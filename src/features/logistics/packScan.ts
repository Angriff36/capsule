import { parsePackSources } from "../../lib/packRules";
import { code39Text } from "../../lib/code39";

/**
 * Scanning on a load sheet: read a label, find the pack line it means, and
 * work out the new count for the step the packer is on. Pure: the screen
 * runs the same pack line commands a typed count uses.
 *
 * Labels it reads:
 * - an equipment tag number (the bar label on the piece);
 * - "EV-<event number>" for the event and "VH-<plate>" for a truck;
 * - "capsule://event/<id>", "capsule://vehicle/<id>" and
 *   "capsule://equipment/<id>" from a QR label.
 */

export type ScanStep = "pack" | "check" | "load" | "back";

export const SCAN_STEPS: ReadonlyArray<{ step: ScanStep; label: string }> = [
  { step: "pack", label: "Pack" },
  { step: "check", label: "Second check" },
  { step: "load", label: "On truck" },
  { step: "back", label: "Came back" },
];

export type ScanOutcome =
  | "ok"
  | "done_already"
  | "too_many"
  | "not_ready"
  | "wrong_event"
  | "wrong_truck"
  | "not_found"
  | "two_match"
  | "not_out_yet"
  | "nothing_left";

export const SCAN_OUTCOME_TEXT: Record<ScanOutcome, string> = {
  ok: "Saved.",
  done_already: "This line is already complete for this step.",
  too_many: "That is more than what is left on this line.",
  not_ready: "Pack this line first.",
  wrong_event: "That label is for a different event.",
  wrong_truck: "This line rides on a different truck.",
  not_found: "No line on this list matches that label.",
  two_match:
    "Two equipment items match that label. Count the line with its button.",
  not_out_yet:
    "This list has not left yet. Count what came back after it is sent out.",
  nothing_left: "Everything packed on this line is already counted back.",
};

export type ScanTarget =
  | { kind: "event"; id: string | null; number: string | null }
  | { kind: "vehicle"; id: string | null; plate: string | null }
  | { kind: "equipment"; id: string | null; tag: string | null };

const fold = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");

/**
 * Is `scanned` (folded) the label of `stored`? A scanner sends either the
 * text as written or the text the bars carry; a person types it as written.
 */
const sameLabel = (scanned: string, stored: string | null | undefined) => {
  const written = fold(stored ?? "");
  return (
    written !== "" &&
    scanned !== "" &&
    (scanned === written || scanned === code39Text(written))
  );
};

/** What a scanned or typed label points at. */
export function parseScanLabel(raw: string): ScanTarget | null {
  const text = raw.trim();
  if (!text) return null;
  const link = text.match(
    /^capsule:\/\/(event|vehicle|equipment)\/([^/?#\s]+)$/i,
  );
  if (link) {
    let id: string;
    try {
      id = decodeURIComponent(link[2]!);
    } catch {
      return null;
    }
    const kind = link[1]!.toLowerCase();
    if (kind === "event") return { kind: "event", id, number: null };
    if (kind === "vehicle") return { kind: "vehicle", id, plate: null };
    return { kind: "equipment", id, tag: null };
  }
  const upper = fold(text);
  if (upper.startsWith("EV-"))
    return { kind: "event", id: null, number: upper.slice(3).trim() };
  if (upper.startsWith("VH-"))
    return { kind: "vehicle", id: null, plate: upper.slice(3).trim() };
  return { kind: "equipment", id: null, tag: upper };
}

/** The label text printed for each kind of thing. */
export const scanLabelFor = {
  event: (eventNumber: string) => `EV-${eventNumber.trim()}`,
  vehicle: (registration: string) => `VH-${registration.trim()}`,
  equipment: (assetTag: string) => assetTag.trim(),
};

export type ScanLine = {
  _id: string;
  description: string;
  status: string;
  requiredQuantity: number;
  packedQuantity: number;
  checkedQuantity?: number | null;
  loadedQuantity?: number | null;
  returnedQuantity?: number | null;
  usedQuantity?: number | null;
  lostQuantity?: number | null;
  damagedQuantity?: number | null;
  loadAssignmentId?: string | null;
  sourcesJson?: string | null;
  excludedAt?: number | null;
};

export type ScanEquipment = {
  _id: string;
  name: string;
  assetTag: string;
  deletedAt?: number | null;
};

export type ScanReservation = {
  _id: string;
  equipmentId: string;
  eventId: string;
  status: string;
  deletedAt?: number | null;
};

export type ScanRig = {
  id: string;
  vehicleId?: string | null;
  plate?: string | null;
};

export type ScanContext = {
  eventId: string;
  eventNumber?: string | null;
  lines: readonly ScanLine[];
  equipment: readonly ScanEquipment[];
  reservations: readonly ScanReservation[];
  rigs: readonly ScanRig[];
};

export type ScanFind =
  | { found: "line"; line: ScanLine; equipmentName: string }
  | { found: "event" }
  | { found: "truck"; rigId: string }
  | {
      found: "none";
      outcome: "not_found" | "two_match" | "wrong_event" | "wrong_truck";
    };

/** Find what a label means on this list. */
export function findScanTarget(
  target: ScanTarget,
  context: ScanContext,
): ScanFind {
  if (target.kind === "event") {
    const same =
      target.id != null
        ? target.id === context.eventId
        : sameLabel(target.number ?? "", context.eventNumber);
    return same
      ? { found: "event" }
      : { found: "none", outcome: "wrong_event" };
  }
  if (target.kind === "vehicle") {
    const rig = context.rigs.find((row) =>
      target.id != null
        ? row.vehicleId === target.id || row.id === target.id
        : sameLabel(target.plate ?? "", row.plate),
    );
    return rig
      ? { found: "truck", rigId: rig.id }
      : { found: "none", outcome: "wrong_truck" };
  }
  const pieces = context.equipment.filter(
    (row) =>
      row.deletedAt == null &&
      (target.id != null
        ? row._id === target.id
        : sameLabel(target.tag ?? "", row.assetTag)),
  );
  // Two tags that read the same (they differ only in capitals): never guess.
  if (pieces.length > 1) return { found: "none", outcome: "two_match" };
  const piece = pieces[0];
  if (!piece) return { found: "none", outcome: "not_found" };
  const holds = context.reservations.filter(
    (row) =>
      row.deletedAt == null &&
      row.equipmentId === piece._id &&
      row.status !== "cancelled",
  );
  const here = new Set(
    holds
      .filter((row) => row.eventId === context.eventId)
      .map((row) => row._id),
  );
  // A piece held for another event and not for this one is not counted here,
  // even when this list has a line with the same name.
  if (
    here.size === 0 &&
    holds.some((row) => ["reserved", "checked_out"].includes(row.status))
  )
    return { found: "none", outcome: "wrong_event" };
  const live = context.lines.filter((line) => line.excludedAt == null);
  const line =
    live.find((row) =>
      parsePackSources(row.sourcesJson).some(
        (source) => source.sourceType === "rental" && here.has(source.sourceId),
      ),
    ) ??
    live.find(
      (row) =>
        row.description.trim().toLowerCase() ===
        piece.name.trim().toLowerCase(),
    );
  if (line) return { found: "line", line, equipmentName: piece.name };
  return { found: "none", outcome: "not_found" };
}

const amount = (value: number | null | undefined) => Number(value ?? 0) || 0;

export type ScanChange =
  | { step: "pack"; packedQuantity: number; full: boolean }
  | { step: "check"; checkedQuantity: number }
  | { step: "load"; loadedQuantity: number }
  | { step: "back"; returnedQuantity: number };

/**
 * The new count when `quantity` more of this line go through `step`.
 * `truckId` is the truck the packer scanned or picked for "On truck".
 */
export function applyScan(
  step: ScanStep,
  line: ScanLine,
  quantity: number,
  truckId?: string | null,
): { outcome: ScanOutcome; change?: ScanChange } {
  if (!Number.isFinite(quantity) || quantity <= 0)
    return { outcome: "too_many" };
  const required = amount(line.requiredQuantity);
  const packed = amount(line.packedQuantity);

  if (step === "pack") {
    if (packed >= required) return { outcome: "done_already" };
    if (packed + quantity > required) return { outcome: "too_many" };
    const next = packed + quantity;
    return {
      outcome: "ok",
      change: { step, packedQuantity: next, full: next >= required },
    };
  }
  if (packed <= 0) return { outcome: "not_ready" };

  if (step === "check") {
    const checked = amount(line.checkedQuantity);
    if (checked >= packed) return { outcome: "done_already" };
    if (checked + quantity > packed) return { outcome: "too_many" };
    return {
      outcome: "ok",
      change: { step, checkedQuantity: checked + quantity },
    };
  }
  if (step === "load") {
    if (truckId && line.loadAssignmentId && line.loadAssignmentId !== truckId)
      return { outcome: "wrong_truck" };
    const loaded = amount(line.loadedQuantity);
    if (loaded >= packed) return { outcome: "done_already" };
    if (loaded + quantity > packed) return { outcome: "too_many" };
    return {
      outcome: "ok",
      change: { step, loadedQuantity: loaded + quantity },
    };
  }
  const counted =
    amount(line.returnedQuantity) +
    amount(line.usedQuantity) +
    amount(line.lostQuantity) +
    amount(line.damagedQuantity);
  if (counted >= packed) return { outcome: "nothing_left" };
  if (counted + quantity > packed) return { outcome: "too_many" };
  return {
    outcome: "ok",
    change: {
      step,
      returnedQuantity: amount(line.returnedQuantity) + quantity,
    },
  };
}
