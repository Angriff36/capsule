import { inflateRawSync } from "node:zlib";

/**
 * Hardened minimal ZIP reader for OOXML (.xlsx) containers and report
 * archives (PR01-07). Standard library only — a spreadsheet dependency is
 * not worth carrying for reading a handful of XML parts.
 *
 * Every malformed or abusive input — traversal names, absolute paths,
 * duplicate filenames, nested archives, encrypted entries, corrupt
 * records, and over-limit expansion — fails with a bounded, named
 * ZipArchiveError instead of a RangeError or an unbounded allocation.
 * The parser is pure: it writes nothing, anywhere, ever.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const EOCD_RECORD = 22;
const CENTRAL_RECORD = 46;
const LOCAL_RECORD = 30;
const MAX_NAME_LENGTH = 1024;

/** Stable machine-readable failure kinds (PR01-07 "bounded, named failures"). */
export type ZipFailureCode =
  | "not_a_zip"
  | "zip64_unsupported"
  | "corrupt_directory"
  | "corrupt_entry"
  | "unsupported_compression"
  | "traversal"
  | "absolute_path"
  | "bad_name"
  | "duplicate_name"
  | "nested_archive"
  | "encrypted"
  | "too_many_entries"
  | "entry_bytes_exceeded"
  | "expanded_bytes_exceeded";

export class ZipArchiveError extends Error {
  readonly code: ZipFailureCode;

  constructor(code: ZipFailureCode, message: string) {
    super(message);
    this.name = "ZipArchiveError";
    this.code = code;
  }
}

/** Bounds applied to every read. Override per call for small fixtures. */
export interface ZipLimits {
  maxEntries: number;
  maxEntryExpandedBytes: number;
  maxTotalExpandedBytes: number;
  /** Reject entries that are themselves archives. The only legitimate case
   * is the outer report archive whose .xlsx workbooks are zip containers. */
  allowArchiveEntries: boolean;
}

export const DEFAULT_ZIP_LIMITS: Readonly<ZipLimits> = {
  maxEntries: 1000,
  maxEntryExpandedBytes: 64 * 1024 * 1024,
  maxTotalExpandedBytes: 256 * 1024 * 1024,
  allowArchiveEntries: false,
};

/** Central-directory metadata for one entry — no decompression. */
export interface ZipEntryInfo {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  encrypted: boolean;
  isDirectory: boolean;
}

interface DirectoryEntry extends ZipEntryInfo {
  compressionMethod: number;
  localHeaderOffset: number;
}

function fail(code: ZipFailureCode, message: string): never {
  throw new ZipArchiveError(code, message);
}

/** Names stay bounded in messages even when the entry name is hostile. */
function showName(name: string): string {
  return name.length > 80 ? `${name.slice(0, 80)}…` : name;
}

function requireBytes(
  buffer: Buffer,
  offset: number,
  count: number,
  code: ZipFailureCode,
  what: string,
): void {
  if (offset < 0 || count < 0 || offset + count > buffer.length) {
    fail(code, `ZIP ${what} is out of bounds`);
  }
}

function assertSafeEntryName(name: string): void {
  if (name.length === 0) fail("bad_name", "ZIP entry name is empty");
  if (name.includes("\0")) {
    fail("bad_name", `ZIP entry name contains a NUL byte: ${showName(name)}`);
  }
  if (name.length > MAX_NAME_LENGTH) {
    fail("bad_name", `ZIP entry name is too long: ${showName(name)}`);
  }
  if (
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /^[A-Za-z]:/.test(name)
  ) {
    fail(
      "absolute_path",
      `ZIP entry name is an absolute path: ${showName(name)}`,
    );
  }
  // Both separators: hostile archives mix them to dodge slash-only checks.
  if (name.split(/[\\/]+/).includes("..")) {
    fail("traversal", `ZIP entry name escapes the archive: ${showName(name)}`);
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < EOCD_RECORD) {
    fail(
      "not_a_zip",
      "Not a ZIP container: file is smaller than an end-of-central-directory record",
    );
  }
  const earliest = Math.max(0, buffer.length - 0xffff - EOCD_RECORD);
  for (
    let offset = buffer.length - EOCD_RECORD;
    offset >= earliest;
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  fail("not_a_zip", "Not a ZIP container: end of central directory not found");
}

/** Parse the central directory once — shared by listing and reading. */
function readDirectory(
  buffer: Buffer,
  limits: Readonly<ZipLimits>,
): DirectoryEntry[] {
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const cursorStart = buffer.readUInt32LE(endOffset + 16);
  if (entryCount === 0xffff || cursorStart === 0xffffffff) {
    fail("zip64_unsupported", "ZIP64 archives are not supported");
  }
  if (entryCount > limits.maxEntries) {
    fail(
      "too_many_entries",
      `ZIP declares ${entryCount} entries; limit is ${limits.maxEntries}`,
    );
  }

  const entries: DirectoryEntry[] = [];
  const seen = new Set<string>();
  let cursor = cursorStart;

  for (let index = 0; index < entryCount; index += 1) {
    requireBytes(
      buffer,
      cursor,
      CENTRAL_RECORD,
      "corrupt_directory",
      `central directory record ${index}`,
    );
    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) {
      fail(
        "corrupt_directory",
        `Corrupt ZIP central directory at entry ${index}`,
      );
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    requireBytes(
      buffer,
      cursor + CENTRAL_RECORD,
      nameLength,
      "corrupt_directory",
      `central directory name at entry ${index}`,
    );
    const name = buffer.toString(
      "utf8",
      cursor + CENTRAL_RECORD,
      cursor + CENTRAL_RECORD + nameLength,
    );

    assertSafeEntryName(name);
    if (seen.has(name)) {
      fail(
        "duplicate_name",
        `ZIP contains a duplicate filename: ${showName(name)}`,
      );
    }
    seen.add(name);

    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      encrypted: (flags & 0x1) === 0x1,
      isDirectory: name.endsWith("/"),
      compressionMethod,
      localHeaderOffset,
    });

    cursor += CENTRAL_RECORD + nameLength + extraLength + commentLength;
  }
  return entries;
}

function resolveLimits(limits?: Partial<ZipLimits>): Readonly<ZipLimits> {
  return { ...DEFAULT_ZIP_LIMITS, ...limits };
}

/**
 * List every entry of a ZIP container from its central directory alone —
 * no decompression, so limits and progress are visible before expensive
 * processing begins (PR01-07). Encrypted entries are listed with a flag
 * instead of thrown, so an operator can see why a later read will fail.
 */
export function listZipEntries(
  buffer: Buffer,
  limits?: Partial<ZipLimits>,
): ZipEntryInfo[] {
  return readDirectory(buffer, resolveLimits(limits)).map(
    ({ name, compressedSize, uncompressedSize, encrypted, isDirectory }) => ({
      name,
      compressedSize,
      uncompressedSize,
      encrypted,
      isDirectory,
    }),
  );
}

function looksLikeArchive(name: string, data: Buffer): boolean {
  return (
    name.toLowerCase().endsWith(".zip") ||
    (data.length >= ZIP_MAGIC.length &&
      data.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC))
  );
}

function inflateEntry(
  buffer: Buffer,
  entry: DirectoryEntry,
  limits: Readonly<ZipLimits>,
): Buffer {
  requireBytes(
    buffer,
    entry.localHeaderOffset,
    LOCAL_RECORD,
    "corrupt_entry",
    `local header for ${showName(entry.name)}`,
  );
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_HEADER) {
    fail(
      "corrupt_entry",
      `ZIP local header mismatch for entry: ${showName(entry.name)}`,
    );
  }
  const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart =
    entry.localHeaderOffset + LOCAL_RECORD + nameLength + extraLength;
  requireBytes(
    buffer,
    dataStart,
    entry.compressedSize,
    "corrupt_entry",
    `data for ${showName(entry.name)}`,
  );
  const raw = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  let data: Buffer;
  if (entry.compressionMethod === STORED) {
    data = Buffer.from(raw);
  } else if (entry.compressionMethod === DEFLATED) {
    try {
      data = inflateRawSync(raw);
    } catch {
      fail(
        "corrupt_entry",
        `ZIP entry failed to decompress: ${showName(entry.name)}`,
      );
    }
  } else {
    fail(
      "unsupported_compression",
      `Unsupported ZIP compression method ${entry.compressionMethod}`,
    );
  }

  if (data.length !== entry.uncompressedSize) {
    fail(
      "corrupt_entry",
      `ZIP entry size mismatch for ${showName(entry.name)}: directory says ${entry.uncompressedSize}, got ${data.length}`,
    );
  }
  if (!limits.allowArchiveEntries && looksLikeArchive(entry.name, data)) {
    fail(
      "nested_archive",
      `ZIP entry is a nested archive: ${showName(entry.name)}`,
    );
  }
  return data;
}

/** Read every file entry of a ZIP container into a name → contents map. */
export function readZipEntries(
  buffer: Buffer,
  limits?: Partial<ZipLimits>,
): Map<string, Buffer> {
  const resolved = resolveLimits(limits);
  const directory = readDirectory(buffer, resolved);

  // Pre-flight the declared expansion before any inflate: a bomb fails
  // here, cheaply, instead of inside zlib.
  let totalExpanded = 0;
  for (const entry of directory) {
    if (entry.isDirectory) continue;
    if (entry.encrypted) {
      fail("encrypted", `ZIP entry is encrypted: ${showName(entry.name)}`);
    }
    if (entry.uncompressedSize > resolved.maxEntryExpandedBytes) {
      fail(
        "entry_bytes_exceeded",
        `ZIP entry exceeds the expanded-bytes limit: ${showName(entry.name)} declares ${entry.uncompressedSize} bytes`,
      );
    }
    totalExpanded += entry.uncompressedSize;
  }
  if (totalExpanded > resolved.maxTotalExpandedBytes) {
    fail(
      "expanded_bytes_exceeded",
      `ZIP expands to ${totalExpanded} bytes; limit is ${resolved.maxTotalExpandedBytes}`,
    );
  }

  const entries = new Map<string, Buffer>();
  for (const entry of directory) {
    if (!entry.isDirectory) {
      entries.set(entry.name, inflateEntry(buffer, entry, resolved));
    }
  }
  return entries;
}
