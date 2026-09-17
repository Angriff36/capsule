import type {
  TextItem,
  PDFDocumentProxy,
} from "pdfjs-dist/types/src/display/api";

export async function extractPdfLines(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  return extractPdfLinesFromArrayBuffer(buffer);
}

export async function extractPdfLinesFromArrayBuffer(
  buffer: ArrayBuffer,
): Promise<string[]> {
  return (await extractPdfPagesFromArrayBuffer(buffer)).flatMap(
    (page) => page.lines,
  );
}

export async function extractPdfPagesFromArrayBuffer(
  buffer: ArrayBuffer,
): Promise<{ page: number; text: string; lines: string[] }[]> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  const { default: workerEntry } =
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  GlobalWorkerOptions.workerSrc = workerEntry;
  const loadingTask = getDocument({
    data: buffer,
    disableFontFace: true,
    disableRange: true,
    disableStream: true,
  });
  const pdf = await loadingTask.promise;
  return extractPagesFromPdfDocument(pdf);
}
/** Shared layout extraction for browser PDF.js and injected Node validation. */
export async function extractPagesFromPdfDocument(pdf: PDFDocumentProxy) {
  const linesByPage: string[][] = [];
  const textByPage: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent({
      includeMarkedContent: false,
    });
    const pageLines = collapseTextItems(textContent.items as TextItem[]);
    linesByPage.push(pageLines);
    textByPage.push(
      collapseTextItems(textContent.items as TextItem[], false).join("\n"),
    );
  }

  await pdf.destroy();
  return linesByPage.map((pageLines, index) => {
    const lines = pageLines
      .map((line) =>
        line
          .replace(/\u2010/g, "-")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    return { page: index + 1, text: textByPage[index], lines };
  });
}

function collapseTextItems(items: TextItem[], splitLabels = true): string[] {
  const rows: string[] = [];
  let currentLine = "";
  let lastY: number | null = null;

  items.forEach((item) => {
    if (!item.str) {
      return;
    }

    const text = item.str.replace(/\s+/g, " ").trim();
    if (!text) {
      return;
    }

    const [, , , , , yPosition] = item.transform;
    const y = Math.round(yPosition);

    if (lastY !== null && Math.abs(y - lastY) > 3) {
      if (splitLabels) pushSegments(rows, currentLine);
      else if (currentLine.trim()) rows.push(currentLine.trim());
      currentLine = text;
    } else {
      currentLine += (currentLine ? " " : "") + text;
    }

    lastY = y;
  });

  if (splitLabels) pushSegments(rows, currentLine);
  else if (currentLine.trim()) rows.push(currentLine.trim());
  return rows;
}

function pushSegments(rows: string[], line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  const initialSegments = trimmed
    .split(/\s+(?=[A-Za-z][A-Za-z0-9&/\-(),\s]{0,24}:\s)/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  initialSegments.forEach((segment) => emitSegment(segment, rows));
}

function emitSegment(segment: string, rows: string[]) {
  const trimmed = segment.trim();
  if (!trimmed) {
    return;
  }

  const headerCandidate = trimmed.replace(/\s+/g, " ").toLowerCase();
  if (
    /^category item special, production notes, container quantity\/?unit$/.test(
      headerCandidate,
    )
  ) {
    rows.push("Category");
    rows.push("Item");
    rows.push("Special, Production Notes, Container");
    rows.push("Quantity/Unit");
    return;
  }

  const labelMatch = trimmed.match(
    /^([A-Za-z][A-Za-z0-9&\/\-(),\s]{0,24}):\s*(.*)$/,
  );
  if (labelMatch) {
    const labelName = labelMatch[1].trim();
    const remainder = labelMatch[2].trim();

    if (/^p$/i.test(labelName)) {
      const combined = remainder ? "P: " + remainder : "P:";
      rows.push(combined.trim());
      return;
    }

    const normalizedLabel = (labelName + ":").trim();
    rows.push(normalizedLabel);
    if (remainder) {
      emitSegment(remainder, rows);
    }
    return;
  }

  rows.push(trimmed);
}

export {};
