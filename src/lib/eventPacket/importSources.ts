import { fingerprintBytes, type SourceArtifact } from "./model";
import { PARSER_VERSION, recognizeSource } from "./recognizeSource";
import {
  groupSources,
  type ExtractedSource,
  type SourcePage,
} from "./groupSources";
import { extractObservations } from "./extractObservations";
import { isRtf, rtfToText } from "../tppReports/rtfToText";
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
/** The picture type the file's first bytes show, whatever its name says. */
export function pictureType(bytes: Uint8Array): string | undefined {
  const head = Array.from(bytes.slice(0, 12));
  const ascii = String.fromCharCode(...head);
  if (head[0] === 0x89 && ascii.slice(1, 4) === "PNG") return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return "image/jpeg";
  if (ascii.startsWith("GIF8")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP")
    return "image/webp";
  return undefined;
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
    const picture = pictureType(input.bytes);
    let pages: SourcePage[] = [],
      rows: string[][] | undefined,
      mimeType = picture ?? input.mimeType;
    if (picture) {
      // A setup or load-in diagram is kept as it is; nothing is read from it.
      const artifact: SourceArtifact = {
        fingerprint,
        name: input.name,
        mimeType,
        kind: "diagram",
        parserVersion: PARSER_VERSION,
        recognitionEvidence: [`Picture file (${picture})`],
        importedAt: existing?.importedAt ?? options.importedAt,
      };
      sources.push({ artifact, tenantId: options.tenantId, pages });
      artifactBytes.push({ artifact, bytes: input.bytes });
      continue;
    }
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
      const decoded = new TextDecoder()
        .decode(input.bytes)
        .replace(/^\uFEFF/, "");
      // TPP saves the BEO and the worksheet as .rtf; read it as its plain text.
      const text = isRtf(decoded) ? rtfToText(decoded) : decoded;
      // The browser names an .rtf many ways (or not at all); the content decides.
      if (isRtf(decoded)) mimeType = "application/rtf";
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
      mimeType,
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
