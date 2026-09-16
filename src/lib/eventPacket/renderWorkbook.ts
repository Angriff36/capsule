import { jsPDF } from "jspdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Workbook, WorkbookOverlay } from "./buildWorkbook";
import overlaysMeta from "./fixtures/event-forms-one-print.overlays.json";
import { EVENT_FORMS_ONE_PRINT_B64 } from "./fixtures/event-forms-one-print.b64";
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
  /** Total pages after verbatim template pages are merged in. */
  mergedPageCount: number;
  /** Overlay anchors not found on their original page (must stay empty). */
  unmatchedOverlays: string[];
}
export interface RenderedWorkbook {
  bytes: Uint8Array;
  audit: LayoutAudit;
}
interface PageInsertion {
  afterPage: number;
  file: "event-forms-one-print";
  page: number;
  overlays: WorkbookOverlay[];
}
/** Explicit ASCII fallbacks prevent built-in PDF font missing glyphs. Unknown characters stay visible as codepoints. */
export function printableText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/☐/g, "[ ]")
    .replace(/ /g, " ")
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
// Space-less: pdfjs splits styled words ("bu ff et"), so row labels and
// anchors compare with every non-alphanumeric character removed.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export async function renderWorkbook(
  workbook: Workbook,
): Promise<RenderedWorkbook> {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const records: LayoutRecord[] = [],
    normalizations: string[] = [];
  const insertions: PageInsertion[] = [];
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
    const sourcePage = s.blocks.find(
      (b) => b.kind === "sourcePage",
    )?.sourcePage;
    if (sourcePage) {
      // The original form page is embedded verbatim later; nothing is drawn
      // and no generated chrome (header, footer, banners) touches it.
      insertions.push({
        afterPage: page,
        file: sourcePage.file,
        page: sourcePage.page,
        overlays: sourcePage.overlays,
      });
      continue;
    }
    section = s.id;
    newPage();
    paragraph(s.title, 16, "title", true);
    for (const b of s.blocks) {
      paragraph(
        b.text,
        b.kind === "form" ? 9.5 : b.small ? 8.4 : 10,
        b.kind,
        b.kind === "heading",
      );
    }
  }
  const generatedCount = page;
  // Merge the original Event Forms One Print pages in binder order and draw
  // only the event-specific overlay values on top of them.
  const merged = await PDFDocument.load(doc.output("arraybuffer"));
  const template = await PDFDocument.load(
    base64Bytes(EVENT_FORMS_ONE_PRINT_B64),
  );
  interface PageAnchors {
    header: {
      eventNumber: { x: number; y: number };
      eventDate: { x: number; y: number };
    };
    rows: { y: number; yn: { x: number; y: number }; label: string }[];
    choices: { label: string; x: number; y: number }[];
  }
  const meta = overlaysMeta as { pages: PageAnchors[] };
  const copied = await merged.copyPages(
    template,
    insertions.map((i) => i.page - 1),
  );
  const font = await merged.embedFont(StandardFonts.Helvetica);
  const bold = await merged.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.13, 0.2, 0.28);
  const unmatched: string[] = [];
  let offset = 0;
  for (const [i, entry] of insertions.entries()) {
    const target = copied[i];
    const anchors = meta.pages[entry.page - 1];
    for (const o of entry.overlays) {
      if (o.kind === "text") {
        if (!o.value?.trim()) continue;
        const a =
          o.anchor === "Event Number"
            ? anchors?.header?.eventNumber
            : anchors?.header?.eventDate;
        if (!a) {
          unmatched.push(`page ${entry.page}: ${o.anchor}`);
          continue;
        }
        target.drawText(printableText(o.value), {
          x: a.x,
          y: a.y,
          size: 11,
          font,
          color: ink,
        });
      } else if (o.kind === "yn") {
        const row = anchors?.rows?.find((r) =>
          norm(r.label).startsWith(norm(o.anchor)),
        );
        if (!row) {
          unmatched.push(`page ${entry.page}: ${o.anchor}`);
          continue;
        }
        target.drawText("X", {
          x: o.answer === "no" ? row.yn.x + 16.8 : row.yn.x + 1.2,
          y: row.yn.y + 0.5,
          size: 10,
          font: bold,
          color: ink,
        });
      } else {
        const choice = anchors?.choices?.find((c) => c.label === o.option);
        if (!choice) {
          unmatched.push(`page ${entry.page}: ${o.option}`);
          continue;
        }
        target.drawText("X", {
          x: choice.x,
          y: choice.y + 0.5,
          size: 10,
          font: bold,
          color: ink,
        });
      }
    }
    merged.insertPage(entry.afterPage + offset, target);
    offset++;
  }
  // Footer page numbers count the merged binder; source-form pages stay
  // chrome-free, so only generated pages carry the footer.
  const finalCount = merged.getPageCount();
  const finalIndexOf = new Map<number, number>();
  {
    let generatedSeen = 0,
      insertedSeen = 0;
    for (const entry of insertions) {
      while (generatedSeen < entry.afterPage) {
        finalIndexOf.set(generatedSeen + 1, generatedSeen + 1 + insertedSeen);
        generatedSeen++;
      }
      insertedSeen++;
    }
    while (generatedSeen < generatedCount) {
      finalIndexOf.set(generatedSeen + 1, generatedSeen + 1 + insertedSeen);
      generatedSeen++;
    }
  }
  for (const [generatedPage, finalPage] of finalIndexOf)
    merged
      .getPage(finalPage - 1)
      .drawText(
        printableText(
          `Revision ${workbook.revision} | ${workbook.status} | Page ${finalPage} / ${finalCount}`,
        ),
        { x: left, y: 33.4, size: 8, font, color: rgb(0.63, 0.66, 0.69) },
      );
  const audit: LayoutAudit = {
    pageCount: generatedCount,
    records,
    violations: validateLayout(records, generatedCount),
    normalizations,
    mergedPageCount: finalCount,
    unmatchedOverlays: unmatched,
  };
  if (audit.violations.length)
    throw new Error(
      `Workbook layout failed: ${audit.violations.slice(0, 6).join("; ")}`,
    );
  return { bytes: new Uint8Array(await merged.save()), audit };
}
function base64Bytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
