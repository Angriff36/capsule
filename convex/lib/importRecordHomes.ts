// PL-IMPORT-RESUME (AC-631): the record types an import makes, where each one
// lives, and the snapshot a link keeps of its record at the moment the import
// finished it. A stopped import takes a record back only while the record
// still matches that snapshot (nobody changed it since).
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, TableNames } from "../_generated/dataModel";

export const IMPORT_RECORD_HOMES: Record<
  string,
  { table: TableNames; entity: string }
> = {
  contact: { table: "clients", entity: "Client" },
  venue: { table: "venues", entity: "Venue" },
  event: { table: "events", entity: "Event" },
  lead: { table: "leads", entity: "Lead" },
  menu: { table: "dishes", entity: "Dish" },
  pack_list: { table: "packLists", entity: "PackList" },
};

export type MadeSnapshot = {
  madeVersion?: number;
  madeUpdatedAt?: number;
  /** When the link was written: files and items the run made come before it. */
  madeAt?: number;
};

/** The record's version and last-change time, as JSON for link.metadata. */
export async function madeSnapshot(
  db: GenericDatabaseReader<DataModel>,
  recordType: string,
  capsuleId: string,
): Promise<string | undefined> {
  const home = IMPORT_RECORD_HOMES[recordType];
  const id = home && capsuleId ? db.normalizeId(home.table, capsuleId) : null;
  if (!id) return undefined;
  const record = (await db.get(id)) as {
    version?: unknown;
    updatedAt?: unknown;
  } | null;
  if (!record) return undefined;
  const snapshot: MadeSnapshot = {
    madeVersion: typeof record.version === "number" ? record.version : undefined,
    madeUpdatedAt:
      typeof record.updatedAt === "number" ? record.updatedAt : undefined,
    madeAt: Date.now(),
  };
  return JSON.stringify(snapshot);
}

export function readMadeSnapshot(raw: string | null | undefined): MadeSnapshot {
  try {
    const parsed = JSON.parse(raw ?? "{}") as MadeSnapshot;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
