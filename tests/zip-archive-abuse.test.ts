import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZIP_LIMITS,
  listZipEntries,
  readZipEntries,
  ZipArchiveError,
} from "../src/lib/tppReports/zipReader";

/**
 * PR01-07 / AC-026: zip traversal, absolute paths, nested archive abuse,
 * excessive expanded bytes, duplicate filenames, encrypted workbooks, and
 * corrupt entries each produce a bounded, named failure. Fixtures are
 * crafted synthetic buffers built byte-by-byte here — never a private
 * export. The parser is pure, so "no writes outside source storage" is
 * proven structurally: the module must not touch the filesystem at all.
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

interface BuiltEntry {
  name: string;
  data: Buffer;
  stored?: boolean;
  flags?: number;
  method?: number;
  declaredUncompressed?: number;
  localOffsetOverride?: number;
}

/** Craft a ZIP byte-for-byte so malformed variants stay fully controlled. */
function buildZip(
  entries: BuiltEntry[],
  overrides: { entryCount?: number; centralOffset?: number } = {},
): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const method = entry.method ?? (entry.stored ? 0 : 8);
    const payload = entry.stored ? entry.data : deflateRawSync(entry.data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_SIG, 0);
    header.writeUInt16LE(entry.flags ?? 0, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, payload);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(CENTRAL_SIG, 0);
    record.writeUInt16LE(entry.flags ?? 0, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(payload.length, 20);
    record.writeUInt32LE(entry.declaredUncompressed ?? entry.data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(entry.localOffsetOverride ?? offset, 42);
    central.push(record, name);

    offset += 30 + name.length + payload.length;
  }
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  // EOCD: +8 entries on this disk, +10 total entries (what the reader
  // trusts), +12 central-directory size, +16 central-directory offset.
  eocd.writeUInt16LE(overrides.entryCount ?? entries.length, 8);
  eocd.writeUInt16LE(overrides.entryCount ?? entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(overrides.centralOffset ?? offset, 16);
  return Buffer.concat([...local, ...central, eocd]);
}

/** Assert the call fails and return its named failure code. */
function failureCode(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(ZipArchiveError);
    expect(error).toBeInstanceOf(Error);
    return (error as ZipArchiveError).code;
  }
  throw new Error("expected the call to fail with a ZipArchiveError");
}

const text = (value: string) => Buffer.from(value, "utf8");
const smallLimits = { maxEntryExpandedBytes: 100, maxTotalExpandedBytes: 150 };

describe("readZipEntries", () => {
  it("a lying directory cannot bypass the per-entry expansion bound", () => {
    // Review R2-14: the central directory declares 64 uncompressed bytes
    // while the deflated stream expands to 32 KiB. The declared-size
    // preflight cannot see the lie — only the inflate-time maxOutputLength
    // bound stops the allocation before the post-inflate size check runs.
    const zip = buildZip([
      {
        name: "xl/worksheets/sheet1.xml",
        data: Buffer.alloc(32 * 1024, 0x41),
        declaredUncompressed: 64,
      },
    ]);
    expect(
      failureCode(() =>
        readZipEntries(zip, {
          ...DEFAULT_ZIP_LIMITS,
          maxEntryExpandedBytes: 4096,
        }),
      ),
    ).toBe("entry_bytes_exceeded");
  });

  it("reads stored and deflated entries with exact bytes", () => {
    const storedData = text("plain stored bytes");
    const deflatedData = text("deflated workbook part " + "x".repeat(500));
    const zip = buildZip([
      { name: "[Content_Types].xml", data: storedData, stored: true },
      { name: "xl/workbook.xml", data: deflatedData },
    ]);
    const entries = readZipEntries(zip);
    expect(entries.get("[Content_Types].xml")).toEqual(storedData);
    expect(entries.get("xl/workbook.xml")).toEqual(deflatedData);
  });

  it("skips directory entries but keeps their file children", () => {
    const zip = buildZip([
      { name: "reports/", data: Buffer.alloc(0), stored: true },
      { name: "reports/beo.xlsx", data: text("part"), stored: true },
    ]);
    const entries = readZipEntries(zip);
    expect(entries.has("reports/")).toBe(false);
    expect(entries.has("reports/beo.xlsx")).toBe(true);
  });

  it("rejects traversal names in any position or separator style", () => {
    expect(
      failureCode(() =>
        readZipEntries(
          buildZip([{ name: "../evil.txt", data: text("x"), stored: true }]),
        ),
      ),
    ).toBe("traversal");
    expect(
      failureCode(() =>
        readZipEntries(
          buildZip([
            { name: "reports/../../evil.txt", data: text("x"), stored: true },
          ]),
        ),
      ),
    ).toBe("traversal");
    expect(
      failureCode(() =>
        readZipEntries(
          buildZip([
            { name: "reports\\..\\evil.txt", data: text("x"), stored: true },
          ]),
        ),
      ),
    ).toBe("traversal");
  });

  it("rejects absolute paths including Windows drive letters", () => {
    expect(
      failureCode(() =>
        readZipEntries(
          buildZip([{ name: "/etc/passwd", data: text("x"), stored: true }]),
        ),
      ),
    ).toBe("absolute_path");
    expect(
      failureCode(() =>
        readZipEntries(
          buildZip([{ name: "C:\\evil.txt", data: text("x"), stored: true }]),
        ),
      ),
    ).toBe("absolute_path");
  });

  it("rejects names containing NUL bytes", () => {
    expect(
      failureCode(() =>
        readZipEntries(
          buildZip([{ name: "a\0b.txt", data: text("x"), stored: true }]),
        ),
      ),
    ).toBe("bad_name");
  });

  it("rejects duplicate filenames", () => {
    const zip = buildZip([
      { name: "report.xlsx", data: text("one"), stored: true },
      { name: "report.xlsx", data: text("two"), stored: true },
    ]);
    expect(failureCode(() => readZipEntries(zip))).toBe("duplicate_name");
  });

  it("rejects encrypted entries", () => {
    const zip = buildZip([
      { name: "secret.xlsx", data: text("x"), stored: true, flags: 0x1 },
    ]);
    expect(failureCode(() => readZipEntries(zip))).toBe("encrypted");
  });

  it("rejects nested archives by filename and by magic bytes", () => {
    expect(
      failureCode(() =>
        readZipEntries(
          buildZip([
            { name: "inner.zip", data: text("pretend zip"), stored: true },
          ]),
        ),
      ),
    ).toBe("nested_archive");
    expect(
      failureCode(() =>
        readZipEntries(
          buildZip([
            {
              name: "payload.bin",
              data: Buffer.concat([ZIP_MAGIC, text("rest")]),
              stored: true,
            },
          ]),
        ),
      ),
    ).toBe("nested_archive");
  });

  it("reads workbook entries when the caller explicitly allows archives", () => {
    const workbook = text("a workbook is itself a zip container");
    const zip = buildZip([
      { name: "reports/beo.xlsx", data: workbook, stored: true },
    ]);
    const entries = readZipEntries(zip, { allowArchiveEntries: true });
    expect(entries.get("reports/beo.xlsx")).toEqual(workbook);
  });

  it("enforces the per-entry expanded-bytes limit from the declared size", () => {
    const zip = buildZip([
      {
        name: "bomb.xml",
        data: text("x"),
        stored: true,
        declaredUncompressed: 200,
      },
    ]);
    expect(failureCode(() => readZipEntries(zip, smallLimits))).toBe(
      "entry_bytes_exceeded",
    );
  });

  it("enforces the total expanded-bytes limit before any inflate", () => {
    const zip = buildZip([
      {
        name: "a.xml",
        data: text("x"),
        stored: true,
        declaredUncompressed: 60,
      },
      {
        name: "b.xml",
        data: text("y"),
        stored: true,
        declaredUncompressed: 60,
      },
      {
        name: "c.xml",
        data: text("z"),
        stored: true,
        declaredUncompressed: 60,
      },
    ]);
    expect(failureCode(() => readZipEntries(zip, smallLimits))).toBe(
      "expanded_bytes_exceeded",
    );
  });

  it("enforces the entry-count limit", () => {
    const zip = buildZip([
      { name: "a.xml", data: text("x"), stored: true },
      { name: "b.xml", data: text("y"), stored: true },
    ]);
    expect(failureCode(() => readZipEntries(zip, { maxEntries: 1 }))).toBe(
      "too_many_entries",
    );
  });

  it("rejects an unsupported compression method", () => {
    const zip = buildZip([{ name: "a.xml", data: text("x"), method: 12 }]);
    expect(failureCode(() => readZipEntries(zip))).toBe(
      "unsupported_compression",
    );
  });

  it("rejects a corrupt central directory", () => {
    const oneEntry = [
      { name: "a.xml", data: text("x"), stored: true },
    ] as const;
    expect(
      failureCode(() =>
        readZipEntries(buildZip([...oneEntry], { entryCount: 3 })),
      ),
    ).toBe("corrupt_directory");
    expect(
      failureCode(() =>
        readZipEntries(buildZip([...oneEntry], { centralOffset: 999_999 })),
      ),
    ).toBe("corrupt_directory");
  });

  it("rejects a local header offset pointing outside the file", () => {
    const zip = buildZip([
      {
        name: "a.xml",
        data: text("x"),
        stored: true,
        localOffsetOverride: 1_000_000,
      },
    ]);
    expect(failureCode(() => readZipEntries(zip))).toBe("corrupt_entry");
  });

  it("rejects an entry whose declared size disagrees with its data", () => {
    const data = text("real content");
    const zip = buildZip([
      { name: "a.xml", data, declaredUncompressed: data.length + 5 },
    ]);
    expect(failureCode(() => readZipEntries(zip))).toBe("corrupt_entry");
  });

  it("rejects a truncated archive with a named error, not a RangeError", () => {
    const zip = buildZip([{ name: "a.xml", data: text("x"), stored: true }]);
    const truncated = zip.subarray(0, zip.length - 10);
    expect(failureCode(() => readZipEntries(truncated))).toBe("not_a_zip");
  });

  it("rejects a buffer that is not a zip at all", () => {
    expect(
      failureCode(() => readZipEntries(text("plainly not a zip container"))),
    ).toBe("not_a_zip");
  });
});

describe("listZipEntries", () => {
  it("lists names, sizes, and flags without inflating", () => {
    const data = text("some content");
    const zip = buildZip([
      { name: "reports/", data: Buffer.alloc(0), stored: true },
      { name: "reports/beo.xlsx", data, stored: true },
    ]);
    const infos = listZipEntries(zip);
    expect(infos).toHaveLength(2);
    const dir = infos.find((info) => info.name === "reports/")!;
    expect(dir.isDirectory).toBe(true);
    expect(dir.uncompressedSize).toBe(0);
    const file = infos.find((info) => info.name === "reports/beo.xlsx")!;
    expect(file.isDirectory).toBe(false);
    expect(file.uncompressedSize).toBe(data.length);
    expect(file.encrypted).toBe(false);
  });

  it("surfaces encrypted entries instead of throwing", () => {
    const zip = buildZip([
      { name: "secret.xlsx", data: text("x"), stored: true, flags: 0x1 },
    ]);
    const infos = listZipEntries(zip);
    expect(infos[0].encrypted).toBe(true);
  });

  it("rejects traversal names before any decompression", () => {
    const zip = buildZip([
      { name: "../evil.txt", data: text("x"), stored: true },
    ]);
    expect(failureCode(() => listZipEntries(zip))).toBe("traversal");
  });

  it("rejects duplicate filenames", () => {
    const zip = buildZip([
      { name: "report.xlsx", data: text("one"), stored: true },
      { name: "report.xlsx", data: text("two"), stored: true },
    ]);
    expect(failureCode(() => listZipEntries(zip))).toBe("duplicate_name");
  });
});

describe("ZipArchiveError", () => {
  it("carries a stable code and error name", () => {
    const zip = buildZip([
      { name: "../evil.txt", data: text("x"), stored: true },
    ]);
    try {
      readZipEntries(zip);
      throw new Error("expected a ZipArchiveError");
    } catch (error) {
      const zipError = error as ZipArchiveError;
      expect(zipError.name).toBe("ZipArchiveError");
      expect(zipError.code).toBe("traversal");
      expect(typeof zipError.message).toBe("string");
    }
  });

  it("defaults to safe bounds and rejecting nested archives", () => {
    expect(DEFAULT_ZIP_LIMITS.allowArchiveEntries).toBe(false);
    expect(DEFAULT_ZIP_LIMITS.maxEntries).toBeGreaterThan(0);
    expect(DEFAULT_ZIP_LIMITS.maxEntryExpandedBytes).toBeGreaterThan(0);
    expect(DEFAULT_ZIP_LIMITS.maxTotalExpandedBytes).toBeGreaterThan(0);
  });

  it("writes nothing to the filesystem", () => {
    const source = readFileSync("src/lib/tppReports/zipReader.ts", "utf8");
    expect(source).not.toMatch(/node:fs/);
    expect(source).not.toMatch(/writeFile/);
  });
});
