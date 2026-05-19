// Server-only helpers to generate PDF and DOCX files from a structured outline.
// Pure-JS (pdf-lib, docx) — Worker-compatible.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageOrientation,
} from "docx";

export type DocSection = {
  heading: string;
  paragraphs: string[];
};

export type DocOutline = {
  title: string;
  subtitle?: string;
  author?: string;
  sections: DocSection[];
};

// ── DOCX ──────────────────────────────────────────────────────────────────
export async function renderDocx(outline: DocOutline): Promise<Uint8Array> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: outline.title, bold: true, size: 44 })],
    }),
  );

  if (outline.subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: outline.subtitle,
            italics: true,
            size: 26,
            color: "555555",
          }),
        ],
        spacing: { after: 240 },
      }),
    );
  }

  if (outline.author) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Prepared by ${outline.author} — ${new Date().toLocaleDateString(
              "en-US",
              { year: "numeric", month: "long", day: "numeric" },
            )}`,
            size: 20,
            color: "777777",
          }),
        ],
        spacing: { after: 480 },
      }),
    );
  }

  for (const sec of outline.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: sec.heading, bold: true, size: 30 })],
        spacing: { before: 360, after: 180 },
      }),
    );
    for (const p of sec.paragraphs) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: p, size: 22 })],
          spacing: { after: 160, line: 320 },
        }),
      );
    }
  }

  const doc = new Document({
    creator: outline.author ?? "VDNX CEO Agent",
    title: outline.title,
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

// ── PDF ───────────────────────────────────────────────────────────────────
export async function renderPdf(outline: DocOutline): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(outline.title);
  pdf.setAuthor(outline.author ?? "VDNX CEO Agent");
  pdf.setProducer("VDNX");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 56;
  const marginY = 64;
  const usableWidth = pageWidth - marginX * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginY;
  const ink = rgb(0.08, 0.09, 0.12);
  const muted = rgb(0.45, 0.47, 0.52);

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - marginY;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < marginY) newPage();
  };

  const wrap = (text: string, fnt: typeof font, size: number, maxWidth: number) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const tentative = line ? `${line} ${w}` : w;
      const width = fnt.widthOfTextAtSize(tentative, size);
      if (width <= maxWidth) {
        line = tentative;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawWrapped = (
    text: string,
    fnt: typeof font,
    size: number,
    color = ink,
    afterGap = 6,
  ) => {
    const lineHeight = size * 1.35;
    const lines = wrap(text, fnt, size, usableWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: marginX, y: y - size, size, font: fnt, color });
      y -= lineHeight;
    }
    y -= afterGap;
  };

  // Title
  drawWrapped(outline.title, fontBold, 26, ink, 6);
  if (outline.subtitle) {
    drawWrapped(outline.subtitle, fontItalic, 14, muted, 10);
  }
  if (outline.author) {
    drawWrapped(
      `Prepared by ${outline.author} — ${new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`,
      font,
      10,
      muted,
      18,
    );
  }

  // Divider
  ensureSpace(20);
  page.drawLine({
    start: { x: marginX, y },
    end: { x: pageWidth - marginX, y },
    thickness: 0.5,
    color: muted,
  });
  y -= 20;

  for (const sec of outline.sections) {
    ensureSpace(40);
    drawWrapped(sec.heading, fontBold, 16, ink, 8);
    for (const p of sec.paragraphs) {
      drawWrapped(p, font, 11, ink, 8);
    }
    y -= 6;
  }

  return await pdf.save();
}
