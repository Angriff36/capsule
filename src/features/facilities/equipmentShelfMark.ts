// Shelf mark for a piece of equipment or a kit, like the Mangia kit magnets
// ("Kit Rebuilding Training Doc", 2-1-23): green = serviced and ready for an
// event, red = back from an event and needs servicing, yellow = something is
// missing from it. Read from the open equipment problems; nothing is stored.

export interface ShelfIssue {
  equipmentId: string;
  kind: string;
  status: string;
  deletedAt?: number | null;
}

export interface ShelfMark {
  label: string;
  tone: "chip-tone-ok" | "chip-tone-danger" | "chip-tone-warn";
}

const SERVICE_KINDS = new Set(["cleaning", "repair", "damaged"]);

export function equipmentShelfMark(
  equipmentId: string,
  issues: readonly ShelfIssue[],
): ShelfMark {
  const open = issues.filter(
    (row) =>
      row.equipmentId === equipmentId &&
      row.status === "open" &&
      row.deletedAt == null,
  );
  // An unfinished kit is yellow even after it is cleaned: label what is
  // missing first.
  if (open.some((row) => row.kind === "missing"))
    return { label: "Missing items", tone: "chip-tone-warn" };
  if (open.some((row) => SERVICE_KINDS.has(row.kind)))
    return { label: "Needs service", tone: "chip-tone-danger" };
  return { label: "Ready", tone: "chip-tone-ok" };
}
