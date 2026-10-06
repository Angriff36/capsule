/** The v2 TPP Brief writer puts each record on one line. Index byte ranges,
 * never concatenate the file. Even binary records stay on disk until needed. */
export interface TppFileIndex {
  metadata: {
    format: string;
    schemaVersion: string;
    account: Record<string, unknown>;
    manifest: {
      startedAt?: string;
      counts: Record<string, number>;
      status: string;
      errors?: unknown[];
    };
  };
  collections: Record<string, number[]>;
  provenanceStart: number;
  fingerprint: string;
  rows: number;
}
export const TPP_READ_SIZE = 1024 * 1024;
export const TPP_BATCH_BYTES = 384 * 1024;
export const TPP_MAX_RECORD_BYTES = 24 * 1024 * 1024;
const decoder = new TextDecoder();
export async function digestHex(bytes: BufferSource): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function indexTppFile(
  file: Blob,
  progress: (bytes: number) => void = () => {},
  signal?: AbortSignal,
): Promise<TppFileIndex> {
  const collections: Record<string, number[]> = Object.create(null);
  const hashes: string[] = [];
  let lineStart = 0,
    prefix = "",
    collection = "",
    dataStart = -1,
    provenanceStart = -1;
  let data = false,
    rows = 0;
  function line(end: number) {
    if (prefix.startsWith('"data":{')) {
      dataStart = lineStart;
      data = true;
    } else if (prefix.startsWith('"provenance":{')) {
      provenanceStart = lineStart;
      data = false;
    } else if (data) {
      const match = /^"([A-Za-z][A-Za-z0-9_]*)":\[/.exec(prefix);
      if (match) {
        collection = match[1];
        if (collections[collection])
          throw new Error(`Duplicate collection: ${collection}`);
        collections[collection] = [];
      } else if (prefix.startsWith("{")) {
        if (!collection) throw new Error("A source record has no collection.");
        collections[collection].push(lineStart, end);
        rows++;
      } else if (
        prefix.trim() !== "}," &&
        prefix.trim() !== "}" &&
        prefix.trim() !== ""
      ) {
        throw new Error(
          "Use the original JSON export produced by TPP Brief; this file's record layout has changed.",
        );
      }
    }
    lineStart = end + 1;
    prefix = "";
  }
  for (let offset = 0; offset < file.size; offset += TPP_READ_SIZE) {
    signal?.throwIfAborted();
    const bytes = new Uint8Array(
      await file.slice(offset, offset + TPP_READ_SIZE).arrayBuffer(),
    );
    hashes.push(await digestHex(bytes));
    let start = 0;
    while (start < bytes.length) {
      const newline = bytes.indexOf(10, start);
      const end = newline < 0 ? bytes.length : newline;
      if (prefix.length < 256)
        prefix += decoder.decode(
          bytes.subarray(start, Math.min(end, start + 256 - prefix.length)),
        );
      if (newline < 0) break;
      line(offset + newline);
      start = newline + 1;
    }
    progress(Math.min(file.size, offset + bytes.length));
  }
  if (prefix) line(file.size);
  if (dataStart < 0 || dataStart > 2 * TPP_READ_SIZE || provenanceStart < 0)
    throw new Error("This is not a complete TPP Brief account export.");
  const tail = (await file.slice(-64).text()).trim();
  if (!tail.endsWith("}}"))
    throw new Error("The export is truncated. Select the finished JSON file.");
  const metadata = JSON.parse(
    (await file.slice(0, dataStart).text()).trimEnd().replace(/,$/, "") + "}",
  ) as TppFileIndex["metadata"];
  if (
    metadata.format !== "tpp-account-export" ||
    metadata.schemaVersion !== "2.0.0" ||
    metadata.account?.id == null ||
    !metadata.manifest?.counts
  )
    throw new Error("Expected a TPP Brief version 2 account export.");
  for (const [name, count] of Object.entries(metadata.manifest.counts)) {
    if ((collections[name]?.length ?? 0) / 2 !== count)
      throw new Error(
        `${name}: the export declares ${count} records but contains ${(collections[name]?.length ?? 0) / 2}.`,
      );
  }
  for (const name of Object.keys(collections))
    if (!(name in metadata.manifest.counts))
      throw new Error(`The manifest has no count for ${name}.`);
  const fingerprint = await digestHex(
    new TextEncoder().encode(`tpp-v2:${file.size}:${hashes.join("")}`),
  );
  return { metadata, collections, provenanceStart, fingerprint, rows };
}
export async function readTppRecord(
  file: Blob,
  start: number,
  end: number,
): Promise<Record<string, unknown>> {
  if (end - start > TPP_MAX_RECORD_BYTES)
    throw new Error(
      `A record at byte ${start} exceeds the 24 MB processing limit. Its bytes can still be preserved as a source attachment.`,
    );
  const text = (await file.slice(start, end).text())
    .trimEnd()
    .replace(/[,\]]+$/, "");
  const row: unknown = JSON.parse(text);
  if (!row || typeof row !== "object" || Array.isArray(row))
    throw new Error(`Invalid source record at byte ${start}.`);
  return row as Record<string, unknown>;
}
/** A batch is contiguous within one collection. One file read per batch,
 * rather than hundreds of thousands of tiny reads for a complete account. */
export async function readTppBatch(
  file: Blob,
  ranges: readonly [number, number][],
): Promise<Record<string, unknown>[]> {
  if (!ranges.length) return [];
  const start = ranges[0][0],
    end = ranges[ranges.length - 1][1];
  if (end - start > TPP_MAX_RECORD_BYTES)
    throw new Error(
      `A source batch at byte ${start} exceeds the 24 MB record limit.`,
    );
  const text = (await file.slice(start, end).text())
    .trimEnd()
    .replace(/[,\]]+$/, "");
  const rows: unknown = JSON.parse(`[${text}]`);
  if (
    !Array.isArray(rows) ||
    rows.length !== ranges.length ||
    rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  )
    throw new Error(`Invalid record batch at byte ${start}.`);
  return rows as Record<string, unknown>[];
}
// Reference tables first; event children and binaries come after their parents.
const ORDER = [
  "unitOfMeasurements",
  "eventTypes",
  "storageLocations",
  "vendors",
  "serviceStyles",
  "occasions",
  "referrals",
  "contacts",
  "legacyLeads",
  "venues",
  "staff",
  "users",
  "inventoryItems",
  "miscellaneousItems",
  "menuItems",
  "menuItemDetails",
  "menuPackages",
  "menuPackageItems",
  "events",
  "opportunities",
  "eventFinancials",
  "eventMenus",
  "eventInventoryItems",
  "eventStaff",
  "eventTimes",
  "eventNotes",
  "tasks",
  "contactNotes",
  "eventPayments",
  "eventPackListItems",
];
export function orderedTppCollections(index: TppFileIndex): string[] {
  return Object.keys(index.collections).sort(
    (a, b) =>
      (ORDER.indexOf(a) < 0 ? 999 : ORDER.indexOf(a)) -
        (ORDER.indexOf(b) < 0 ? 999 : ORDER.indexOf(b)) || a.localeCompare(b),
  );
}
