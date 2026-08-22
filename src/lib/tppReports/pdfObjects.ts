import { inflateSync } from "node:zlib";

/**
 * Just enough PDF object structure to bind content streams to their fonts.
 *
 * TPP exports embed one subset font per style, and the subsets do NOT agree on
 * character codes. Decoding therefore needs the ToUnicode CMap of the font that
 * each `Tf` operator selects, not a merged document-wide map.
 */

export interface PdfIndirectObject {
  number: number;
  /** Dictionary and other text before the stream, if any. */
  header: string;
  /** Decoded stream payload, when the object carries a Flate stream. */
  stream?: Buffer;
}

const OBJECT_HEADER = /(\d+)\s+(\d+)\s+obj\b/g;

function decodeStream(header: string, raw: Buffer): Buffer | undefined {
  if (!/\/Filter\s*\/FlateDecode/.test(header)) return raw;
  try {
    return inflateSync(raw);
  } catch {
    return undefined;
  }
}

/** Scan every `N G obj … endobj` span. Robust to a missing or broken xref. */
export function readIndirectObjects(
  buffer: Buffer,
): Map<number, PdfIndirectObject> {
  const latin = buffer.toString("latin1");
  const objects = new Map<number, PdfIndirectObject>();
  OBJECT_HEADER.lastIndex = 0;

  let match = OBJECT_HEADER.exec(latin);
  while (match !== null) {
    const number = Number(match[1]);
    const bodyStart = match.index + match[0].length;
    const end = latin.indexOf("endobj", bodyStart);
    const bodyEnd = end < 0 ? latin.length : end;
    const streamStart = latin.indexOf("stream", bodyStart);

    if (streamStart >= 0 && streamStart < bodyEnd) {
      let dataStart = streamStart + 6;
      if (buffer[dataStart] === 0x0d) dataStart += 1;
      if (buffer[dataStart] === 0x0a) dataStart += 1;
      const dataEnd = latin.indexOf("endstream", dataStart);
      const header = latin.slice(bodyStart, streamStart);
      objects.set(number, {
        number,
        header,
        stream: decodeStream(
          header,
          buffer.subarray(dataStart, dataEnd < 0 ? bodyEnd : dataEnd),
        ),
      });
    } else {
      objects.set(number, { number, header: latin.slice(bodyStart, bodyEnd) });
    }
    OBJECT_HEADER.lastIndex = bodyEnd;
    match = OBJECT_HEADER.exec(latin);
  }
  return objects;
}

/** Read `12 0 R` style references out of a dictionary value. */
export function referenceIn(source: string, key: string): number | undefined {
  const found = source.match(
    new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R\\b`),
  )?.[1];
  return found === undefined ? undefined : Number(found);
}

/** Read every `/Name 12 0 R` pair inside a `/Font << … >>` sub-dictionary. */
export function fontReferences(resources: string): Map<string, number> {
  const fonts = new Map<string, number>();
  const start = resources.indexOf("/Font");
  if (start < 0) return fonts;
  const open = resources.indexOf("<<", start);
  if (open < 0) return fonts;

  let depth = 0;
  let cursor = open;
  for (; cursor < resources.length; cursor += 1) {
    if (resources.startsWith("<<", cursor)) {
      depth += 1;
      cursor += 1;
    } else if (resources.startsWith(">>", cursor)) {
      depth -= 1;
      cursor += 1;
      if (depth === 0) break;
    }
  }
  const block = resources.slice(open, cursor + 1);
  for (const pair of block.match(/\/([^\s/<>]+)\s+(\d+)\s+\d+\s+R/g) ?? []) {
    const [, name, number] =
      pair.match(/\/([^\s/<>]+)\s+(\d+)\s+\d+\s+R/) ?? [];
    if (name && number) fonts.set(name, Number(number));
  }
  return fonts;
}
