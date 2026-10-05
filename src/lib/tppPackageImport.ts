import { readTppBatch, type TppFileIndex } from "./tppAccountFile";
import {
  analyzePackagePatterns,
  type PlanEvent,
  type InventoryLine,
} from "./tppPackagePatterns";

/** Only retain compact planning facts; documents and other account data stay
 * on disk. Shared by upload and rehearsal so inferred results are reproducible. */
export async function inferTppFilePackages(file: Blob, index: TppFileIndex) {
  const events: PlanEvent[] = [],
    lines: InventoryLine[] = [];
  for (const collection of ["events", "eventInventoryItems"]) {
    const offsets = index.collections[collection] ?? [];
    for (let i = 0; i < offsets.length; i += 200) {
      const ranges: [number, number][] = [];
      for (let j = i; j < Math.min(i + 200, offsets.length); j += 2)
        ranges.push([offsets[j], offsets[j + 1]]);
      for (const raw of await readTppBatch(file, ranges)) {
        const row = raw as unknown as PlanEvent & InventoryLine;
        if (collection === "events")
          events.push({
            id: row.id,
            date: row.date,
            guestCount: row.guestCount,
            statusModel: row.statusModel,
          });
        else
          lines.push({
            id: row.id,
            event: row.event,
            quantity: row.quantity,
            isHeader: row.isHeader,
            inventoryItem: row.inventoryItem
              ? {
                  id: row.inventoryItem.id,
                  name: row.inventoryItem.name,
                  classification: row.inventoryItem.classification,
                }
              : null,
          });
      }
    }
  }
  return analyzePackagePatterns(
    events,
    lines,
    index.metadata.manifest.startedAt ?? "",
  );
}
