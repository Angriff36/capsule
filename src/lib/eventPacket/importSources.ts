import { fingerprintBytes, type SourceArtifact } from "./model";
import { recognizeSource } from "./recognizeSource";
import {
  groupSources,
  type ExtractedSource,
  type SourcePage,
} from "./groupSources";
import { extractObservations } from "./extractObservations";
export interface ImportInput {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}
export interface ImportOptions {
  tenantId: string;
  importedAt: string;
  existingArtifacts?: SourceArtifact[];
  extractPdfPages?: (bytes: Uint8Array) => Promise<SourcePage[]>;
}
/** RFC 4180 cells including escaped quotes, embedded newlines, and empty columns. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\r" || c === "\n") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted cell");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
export async function importSources(
  inputs: ImportInput[],
  options: ImportOptions,
) {
  const sources: ExtractedSource[] = [],
    artifactBytes: { artifact: SourceArtifact; bytes: Uint8Array }[] = [];
  for (const input of inputs) {
    const fingerprint = await fingerprintBytes(input.bytes);
    if (sources.some((s) => s.artifact.fingerprint === fingerprint)) continue;
    const existing = options.existingArtifacts?.find(
      (a) => a.fingerprint === fingerprint,
    );
    const isPdf = new TextDecoder().decode(input.bytes.slice(0, 5)) === "%PDF-";
    let pages: SourcePage[] = [],
      rows: string[][] | undefined;
    if (isPdf) {
      const extract =
        options.extractPdfPages ??
        (async (bytes: Uint8Array) => {
          const { extractPdfPagesFromArrayBuffer } =
            await import("../pdf/extractPdfText");
          return extractPdfPagesFromArrayBuffer(new Uint8Array(bytes).buffer);
        });
      pages = await extract(input.bytes);
    } else {
      const text = new TextDecoder().decode(input.bytes).replace(/^\uFEFF/, "");
      if (
        input.mimeType.includes("csv") ||
        /Pack List[\s\S]*Grouped by:/i.test(text)
      )
        rows = parseCsv(text);
      else pages = [{ page: 1, text }];
    }
    const recognition = recognizeSource({
      text: pages.map((p) => p.text).join("\n"),
      rows,
    });
    const artifact: SourceArtifact = {
      fingerprint,
      name: input.name,
      mimeType: input.mimeType,
      ...recognition,
      importedAt: existing?.importedAt ?? options.importedAt,
    };
    const source = { artifact, tenantId: options.tenantId, pages, rows };
    sources.push(source);
    artifactBytes.push({ artifact, bytes: input.bytes });
  }
  const grouped = groupSources(sources);
  return {
    ...grouped,
    sources,
    artifactBytes,
    candidates: grouped.candidates.map((c) => ({
      ...c,
      observations: c.sources.flatMap((s) =>
        extractObservations(s, c.identity),
      ),
    })),
  };
}
