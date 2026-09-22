/**
 * The browser's unzip for an .xlsx: the same central-directory rules as
 * zipReader.ts (bounded entries, no traversal names, no encryption, no
 * nested archives), with the browser's own inflate (DecompressionStream)
 * in place of Node's zlib. Async because the browser inflate is.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;
const EOCD_RECORD = 22;
const CENTRAL_RECORD = 46;
const LOCAL_RECORD = 30;
const MAX_ENTRIES = 1000;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  encrypted: boolean;
  localHeaderOffset: number;
}

function readDirectory(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < EOCD_RECORD) throw new Error("Not a ZIP container");
  let end = -1;
  const earliest = Math.max(0, bytes.length - 0xffff - EOCD_RECORD);
  for (let offset = bytes.length - EOCD_RECORD; offset >= earliest; offset -= 1)
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      end = offset;
      break;
    }
  if (end < 0) throw new Error("Not a ZIP container");
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  if (count === 0xffff || cursor === 0xffffffff)
    throw new Error("ZIP64 archives are not supported");
  if (count > MAX_ENTRIES) throw new Error("ZIP declares too many entries");
  const decoder = new TextDecoder();
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    if (cursor + CENTRAL_RECORD > bytes.length)
      throw new Error("Corrupt ZIP central directory");
    if (view.getUint32(cursor, true) !== CENTRAL_FILE_HEADER)
      throw new Error("Corrupt ZIP central directory");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + CENTRAL_RECORD;
    if (nameStart + nameLength > bytes.length)
      throw new Error("Corrupt ZIP central directory");
    const name = decoder.decode(
      bytes.subarray(nameStart, nameStart + nameLength),
    );
    if (
      name.length === 0 ||
      name.length > 1024 ||
      name.includes("\0") ||
      /^([A-Za-z]:|[\\/])/.test(name) ||
      name.split(/[\\/]+/).includes("..")
    )
      throw new Error("ZIP entry name is not allowed");
    if (seen.has(name)) throw new Error("ZIP contains a duplicate filename");
    seen.add(name);
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      encrypted: (flags & 0x1) === 0x1,
      localHeaderOffset,
    });
    cursor += CENTRAL_RECORD + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(raw: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("ZIP entry expands beyond the per-entry byte limit");
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
}

/** Read every file entry of a ZIP container into a name → contents map. */
export async function readZipEntriesInBrowser(
  bytes: Uint8Array,
): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const directory = readDirectory(bytes);
  let total = 0;
  for (const entry of directory) {
    if (entry.name.endsWith("/")) continue;
    if (entry.encrypted) throw new Error("ZIP entry is encrypted");
    if (entry.uncompressedSize > MAX_ENTRY_BYTES)
      throw new Error("ZIP entry exceeds the expanded-bytes limit");
    total += entry.uncompressedSize;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error("ZIP expands beyond the limit");
  const entries = new Map<string, Uint8Array>();
  for (const entry of directory) {
    if (entry.name.endsWith("/")) continue;
    const at = entry.localHeaderOffset;
    if (
      at + LOCAL_RECORD > bytes.length ||
      view.getUint32(at, true) !== LOCAL_FILE_HEADER
    )
      throw new Error("ZIP local header mismatch");
    const dataStart =
      at +
      LOCAL_RECORD +
      view.getUint16(at + 26, true) +
      view.getUint16(at + 28, true);
    if (dataStart + entry.compressedSize > bytes.length)
      throw new Error("ZIP entry data is out of bounds");
    const raw = bytes.subarray(dataStart, dataStart + entry.compressedSize);
    let data: Uint8Array;
    if (entry.method === STORED) data = new Uint8Array(raw);
    else if (entry.method === DEFLATED)
      data = await inflateRaw(raw, MAX_ENTRY_BYTES);
    else throw new Error("Unsupported ZIP compression method");
    if (data.length !== entry.uncompressedSize)
      throw new Error("ZIP entry size mismatch");
    if (
      entry.name.toLowerCase().endsWith(".zip") ||
      (data[0] === 0x50 &&
        data[1] === 0x4b &&
        data[2] === 0x03 &&
        data[3] === 0x04)
    )
      throw new Error("ZIP entry is a nested archive");
    entries.set(entry.name, data);
  }
  return entries;
}
