import { deflateSync } from "zlib";

export type LlmImagePart = { type: "image_url"; image_url: { url: string } };

export type AttachmentVisionRow = {
  filename: string;
  mime_type: string | null;
  storage_path: string | null;
};

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string } | null; error?: unknown }>;
      download: (path: string) => Promise<{ data: Blob | null; error?: unknown }>;
    };
  };
};

const MAX_VISUAL_PARTS = 8;
const MAX_EMBEDDED_IMAGE_BYTES = 4_500_000;
const MAX_PDF_IMAGE_PIXELS = 4_000_000;
const MIN_USEFUL_PIXELS = 40_000;

function clean(s: string | null | undefined) {
  return String(s ?? "").trim();
}

export function isImageMime(mime: string | null | undefined, filename = "") {
  return clean(mime).startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(filename);
}

export function looksLikePdf(mime: string | null | undefined, filename = "") {
  return clean(mime) === "application/pdf" || /\.pdf$/i.test(filename);
}

export function looksLikeOfficeContainer(filename = "") {
  return /\.(pptx|docx|xlsx)$/i.test(filename);
}

function mimeForMediaName(name: string): string | null {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  return null;
}

function crc32(buf: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuf = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuf.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 8 + data.length);
  return out;
}

function rawImageToPngDataUrl(img: { data: Uint8ClampedArray; width: number; height: number; channels: 1 | 3 | 4 }) {
  const { width, height, channels } = img;
  const pixels = width * height;
  if (!width || !height || pixels < MIN_USEFUL_PIXELS || pixels > MAX_PDF_IMAGE_PIXELS) return null;

  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  const src = img.data;
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    scanlines[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const dst = rowStart + 1 + x * 4;
      const srcIdx = (y * width + x) * channels;
      if (channels === 1) {
        const v = src[srcIdx];
        scanlines[dst] = v;
        scanlines[dst + 1] = v;
        scanlines[dst + 2] = v;
        scanlines[dst + 3] = 255;
      } else {
        scanlines[dst] = src[srcIdx];
        scanlines[dst + 1] = src[srcIdx + 1];
        scanlines[dst + 2] = src[srcIdx + 2];
        scanlines[dst + 3] = channels === 4 ? src[srcIdx + 3] : 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  if (png.length > MAX_EMBEDDED_IMAGE_BYTES) return null;
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function downloadBytes(storage: StorageClient, bucket: string, storagePath: string) {
  const { data, error } = await storage.storage.from(bucket).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function extractOfficeImageParts(bytes: Buffer, filename: string, remaining: number) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const mediaPrefix = /\.pptx$/i.test(filename)
    ? /^ppt\/media\//i
    : /\.docx$/i.test(filename)
      ? /^word\/media\//i
      : /^xl\/media\//i;
  const names = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir && mediaPrefix.test(name) && mimeForMediaName(name))
    .sort();
  const parts: LlmImagePart[] = [];
  const notes: string[] = [];
  for (const name of names.slice(0, remaining)) {
    const mime = mimeForMediaName(name);
    if (!mime) continue;
    const data = await zip.files[name].async("uint8array");
    if (data.byteLength > MAX_EMBEDDED_IMAGE_BYTES) {
      notes.push(`${filename}: skipped large embedded image ${name.split("/").pop()}`);
      continue;
    }
    parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${Buffer.from(data).toString("base64")}` } });
    notes.push(`${filename}: attached embedded visual ${name.split("/").pop()}`);
  }
  return { parts, notes, total: names.length };
}

async function extractPdfImageParts(bytes: Buffer, filename: string, remaining: number) {
  const { extractImages, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pageCount = Math.min(Number(pdf.numPages ?? 0), 8);
  const parts: LlmImagePart[] = [];
  const notes: string[] = [];
  for (let page = 1; page <= pageCount && parts.length < remaining; page++) {
    const images = await extractImages(pdf, page).catch(() => []);
    for (const image of images) {
      if (parts.length >= remaining) break;
      const url = rawImageToPngDataUrl(image);
      if (!url) continue;
      parts.push({ type: "image_url", image_url: { url } });
      notes.push(`${filename}: attached visual from PDF page ${page} (${image.width}×${image.height})`);
    }
  }
  return { parts, notes };
}

export async function collectAttachmentVisionParts(opts: {
  storage: StorageClient;
  bucket?: string;
  attachments: AttachmentVisionRow[];
  maxParts?: number;
}) {
  const bucket = opts.bucket ?? "chat-uploads";
  const maxParts = Math.max(0, Math.min(12, opts.maxParts ?? MAX_VISUAL_PARTS));
  const parts: LlmImagePart[] = [];
  const notes: string[] = [];

  for (const attachment of opts.attachments) {
    if (parts.length >= maxParts) break;
    const filename = clean(attachment.filename);
    const mime = clean(attachment.mime_type);
    const storagePath = clean(attachment.storage_path);
    if (!storagePath) continue;

    if (isImageMime(mime, filename)) {
      const { data } = await opts.storage.storage.from(bucket).createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) {
        parts.push({ type: "image_url", image_url: { url: data.signedUrl } });
        notes.push(`${filename}: attached as image input`);
      }
      continue;
    }

    if (!looksLikePdf(mime, filename) && !looksLikeOfficeContainer(filename)) continue;
    const bytes = await downloadBytes(opts.storage, bucket, storagePath);
    if (!bytes) continue;

    try {
      const remaining = maxParts - parts.length;
      const extracted = looksLikePdf(mime, filename)
        ? await extractPdfImageParts(bytes, filename, remaining)
        : await extractOfficeImageParts(bytes, filename, remaining);
      parts.push(...extracted.parts);
      notes.push(...extracted.notes);
      if ((extracted as any).total && (extracted as any).total > extracted.parts.length) {
        notes.push(`${filename}: ${(extracted as any).total - extracted.parts.length} additional embedded visuals omitted`);
      }
    } catch (e: any) {
      notes.push(`${filename}: visual extraction failed (${e?.message ?? "unknown error"})`);
    }
  }

  return { parts, notes };
}

export function emptyExtractionNotice(filename: string) {
  return `[No readable text was embedded in ${filename}. The file may be image-based; vision-capable models will receive any available images/visual pages separately. Do not treat this as a missing attachment.]`;
}