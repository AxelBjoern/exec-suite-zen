// Shared, pure helpers and constants for the Outbound page and its
// extracted sub-components. Keeping these out of the route file shrinks the
// component itself and lets sub-components import them without prop drilling.

export const ACCEPT_MIME = {
  image: "image/png,image/jpeg,image/webp,image/jpg",
  pdf: "application/pdf",
  video: "video/mp4,video/quicktime,video/mov",
} as const;

export const MAX_SIZE = { image: 6_000_000, pdf: 12_000_000, video: 20_000_000 } as const;

export const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export const btnCls =
  "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90 disabled:opacity-50";

export function mimeKind(mime: string): "image" | "pdf" | "video" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  return null;
}

// Convert "YYYY-MM-DDTHH:mm" (browser local) → real ISO string w/ offset.
// Without this, the server reads the string as UTC and schedules fire at the
// wrong wall-clock time for anyone outside UTC.
export function localToIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function fileToBase64(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export type MediaValue = {
  kind: "image" | "pdf" | "video";
  base64?: string;
  url?: string;
  path?: string;
  mime: string;
  filename: string;
};

export function mediaSrc(v: MediaValue): string {
  if (v.url) return v.url;
  if (v.base64) return `data:${v.mime};base64,${v.base64}`;
  return "";
}
