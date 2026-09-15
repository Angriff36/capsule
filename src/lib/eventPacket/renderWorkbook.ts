import { jsPDF } from "jspdf";
import type { Workbook } from "./buildWorkbook";
export interface LayoutRecord {
  page: number;
  section: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}
export interface LayoutAudit {
  pageCount: number;
  records: LayoutRecord[];
  violations: string[];
  normalizations: string[];
}
export interface RenderedWorkbook {
  bytes: Uint8Array;
  audit: LayoutAudit;
}
/** Explicit ASCII fallbacks prevent built-in PDF font missing glyphs. Unknown characters stay visible as codepoints. */
export function printableText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/\u2610/g, "[ ]")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(
      /[^\x20-\x7e\n]/gu,
      (c) => `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`,
    );
}
export function validateLayout(
  records: LayoutRecord[],
  pageCount: number,
): string[] {
  const violations: string[] = [];
  for (const r of records) {
    if (
      r.x < 35 ||
      r.y < 30 ||
      r.x + r.width > 577.01 ||
      r.y + r.height > 762.01
    )
      violations.push(`Bounds page ${r.page}: ${r.text ?? r.kind}`);
    if (r.text && /[^\x20-\x7e]/.test(r.text))
      violations.push(`Unsupported glyph page ${r.page}`);
  }
  for (let p = 1; p <= pageCount; p++) {
    const rows = records.filter(
      (r) => r.page === p && r.kind !== "header" && r.kind !== "footer",
    );
    if (!rows.length) violations.push(`Blank page ${p}`);
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i],
          b = rows[j];
        if (
          a.x < b.x + b.width - 0.2 &&
          a.x + a.width > b.x + 0.2 &&
          a.y < b.y + b.height - 0.2 &&
          a.y + a.height > b.y + 0.2
        )
          violations.push(`Overlap page ${p}: ${a.kind}/${b.kind}`);
      }
  }
  return violations;
}
export async function renderWorkbook(
  workbook: Workbook,
): Promise<RenderedWorkbook> {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const records: LayoutRecord[] = [],
    normalizations: string[] = [];
  let page = 0,
    y = 0,
    section = "";
  const left = 40,
    width = 532,
    bottom = 742;
  const safe = (s: string) => {
    const t = printableText(s);
    if (t !== s && !normalizations.includes(s)) normalizations.push(s);
    return t;
  };
  const put = (
    text: string,
    x: number,
    top: number,
    size: number,
    kind: string,
    font: "normal" | "bold" = "normal",
    color = [32, 43, 52],
  ) => {
    doc.setFont("helvetica", font);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(text, x, top + size * 0.82);
    records.push({
      page,
      section,
      kind,
      x,
      y: top,
      width: doc.getTextWidth(text),
      height: size * 1.08,
      text,
    });
  };
  const newPage = (continuation = false) => {
    if (page) doc.addPage();
    page++;
    y = 66;
    put(
      `EVENT ${workbook.identity.invoiceNumber}  /  ${workbook.identity.eventDate}  /  REV ${workbook.revision}`,
      left,
      32,
      8,
      "header",
      "bold",
    );
    put(
      workbook.status,
      423,
      32,
      8,
      "header",
      "bold",
      workbook.status === "READY" ? [20, 92, 64] : [160, 60, 20],
    );
    doc.setDrawColor(200, 208, 214);
    doc.line(left, 48, 572, 48);
    if (continuation) {
      put("CONTINUED", left, y, 8, "continued", "bold");
      y += 17;
    }
  };
  const ensure = (height: number) => {
    if (y + height > bottom) newPage(true);
  };
  const paragraph = (
    input: string,
    size: number,
    kind: string,
    bold = false,
  ) => {
    const normalized = safe(input).replace(/_{75,}/g, "_".repeat(72));
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const original of normalized.split("\n")) {
      const lines = doc.splitTextToSize(original || " ", width) as string[];
      for (const line of lines) {
        ensure(size * 1.3);
        put(
          line,
          left,
          y,
          size,
          kind,
          bold ? "bold" : "normal",
          kind === "issue" ? [145, 53, 19] : [32, 43, 52],
        );
        y += size * 1.3;
      }
    }
    y += kind === "issue" ? 4 : 6;
  };
  for (const s of workbook.sections) {
    section = s.id;
    newPage();
    paragraph(s.title, 16, "title", true);
    for (const b of s.blocks) {
      if (b.kind === "diagram") {
        paragraph(b.text, 9, "text", true);
        ensure(127);
        const diagramTop = y;
        doc.setDrawColor(68, 91, 103);
        doc.setFillColor(240, 245, 246);
        const labels = [
          "Plates",
          "Veggie chafer",
          "Starch chafer",
          "Protein chafer",
          "Salad",
          "Bread",
          "Butter",
          "Cutlery",
        ];
        for (let i = 0; i < 8; i++) {
          const col = i % 4,
            row = Math.floor(i / 4),
            x = left + col * 133,
            top = y + row * 54;
          doc.setFillColor(240, 245, 246);
          doc.roundedRect(x, top, 121, 32, 3, 3, "FD");
          doc.setTextColor(32, 43, 52);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(labels[i], x + 8, top + 19);
          if (col < 3) {
            doc.line(x + 122, top + 16, x + 131, top + 16);
            doc.line(x + 128, top + 13, x + 131, top + 16);
            doc.line(x + 128, top + 19, x + 131, top + 16);
          }
        }
        doc.setFontSize(8);
        doc.text(
          "Service flow: top row left to right, then lower row left to right.",
          left,
          y + 107,
        );
        records.push({
          page,
          section,
          kind: "diagram",
          x: left,
          y: diagramTop,
          width: 520,
          height: 112,
        });
        y += 124;
        continue;
      }
      paragraph(
        b.text,
        b.kind === "form" ? 9.5 : b.small ? 8.4 : 10,
        b.kind,
        b.kind === "heading",
      );
    }
  }
  const count = page;
  for (let p = 1; p <= count; p++) {
    doc.setPage(p);
    page = p;
    section = "footer";
    put(
      `Revision ${workbook.revision} | ${workbook.status} | Page ${p} / ${count}`,
      left,
      752,
      8,
      "footer",
    );
  }
  const audit = {
    pageCount: count,
    records,
    violations: validateLayout(records, count),
    normalizations,
  };
  if (audit.violations.length)
    throw new Error(
      `Workbook layout failed: ${audit.violations.slice(0, 6).join("; ")}`,
    );
  return { bytes: new Uint8Array(doc.output("arraybuffer")), audit };
}
