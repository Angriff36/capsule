import { inflateRawSync } from "node:zlib";

/**
 * Minimal ZIP reader for OOXML (.xlsx) containers.
 *
 * Standard library only — a spreadsheet dependency is not worth carrying for
 * reading a handful of XML parts out of a report export.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const STORED = 0;
const DEFLATED = 8;

function findEndOfCentralDirectory(buffer: Buffer): number {
  const earliest = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error("Not a ZIP container: end of central directory not found");
}

function inflateEntry(
  buffer: Buffer,
  localHeaderOffset: number,
  compressionMethod: number,
  compressedSize: number,
): Buffer {
  const nameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  const data = buffer.subarray(dataStart, dataStart + compressedSize);
  if (compressionMethod === STORED) return Buffer.from(data);
  if (compressionMethod === DEFLATED) return inflateRawSync(data);
  throw new Error(`Unsupported ZIP compression method ${compressionMethod}`);
}

/** Read every entry of a ZIP container into a name → contents map. */
export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let cursor = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) {
      throw new Error(`Corrupt ZIP central directory at entry ${index}`);
    }
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (!name.endsWith("/")) {
      entries.set(
        name,
        inflateEntry(
          buffer,
          localHeaderOffset,
          compressionMethod,
          compressedSize,
        ),
      );
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
