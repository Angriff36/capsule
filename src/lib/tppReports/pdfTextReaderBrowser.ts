import { readIndirectObjects } from "./pdfObjects";
import { readPdfTextLinesWith, type PdfTextLine } from "./pdfTextReader";

/** A TPP report PDF is a few hundred KB; refuse anything that expands past this. */
const MAX_STREAM_BYTES = 64 * 1024 * 1024;

async function inflate(raw: Uint8Array): Promise<Uint8Array | undefined> {
  // The bytes before "endstream" end with a line break the inflate would
  // call junk after the data.
  let end = raw.length;
  while (end > 0 && (raw[end - 1] === 0x0a || raw[end - 1] === 0x0d)) end -= 1;
  try {
    const reader = new Blob([raw.subarray(0, end) as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"))
      .getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_STREAM_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Text lines of a PDF read in the page, for the event import page: the same
 * reader as the agent path, with the page's own inflate. The browser inflate
 * is async, so every Flate stream is inflated first, then read.
 */
export async function readPdfTextLinesInBrowser(
  bytes: Uint8Array,
): Promise<PdfTextLine[]> {
  // A first pass only collects the Flate streams' raw bytes.
  const raws: Uint8Array[] = [];
  readIndirectObjects(bytes, (raw) => {
    raws.push(raw);
    return undefined;
  });
  const inflated = new Map<number, Uint8Array | undefined>();
  for (const raw of raws) inflated.set(raw.byteOffset, await inflate(raw));
  return readPdfTextLinesWith(bytes, (raw) => inflated.get(raw.byteOffset));
}
