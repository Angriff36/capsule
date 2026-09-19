import type { Doc } from "../../../lib/api";
import { clientDisplayName } from "../clientName";
import { shortRef } from "../../home/homeCalendar";

/** What the pack column of the tracker sheet says, most urgent first. */
export type PackState =
  | "needs_assistance"
  | "question"
  | "dispatched"
  | "loaded"
  | "packed"
  | "packing"
  | "waiting_sales_lock"
  | "not_started";

export const PACK_STATE_LABEL: Record<PackState, string> = {
  needs_assistance: "Needs assistance",
  question: "Question",
  dispatched: "Dispatched",
  loaded: "Loaded",
  packed: "Packed",
  packing: "Packing",
  waiting_sales_lock: "Waiting on sales lock",
  not_started: "Not started",
};

export const BINDER_OPTIONS = [
  { value: "ready_to_build", label: "Ready to build" },
  { value: "built", label: "Built" },
  { value: "fully_packed", label: "Fully packed" },
  { value: "ready", label: "Ready" },
] as const;

const BEFORE_SALES_LOCK = new Set([
  "quote",
  "planning",
  "pending_approval",
  "approved",
]);

export interface TrackerRig {
  id: string;
  version: number;
  vehicleId: string | null;
  trailerId: string | null;
  driverId: string | null;
  /** Carried through a change: an omitted optional param clears the field. */
  notes: string | null;
  preloaded: boolean;
  /** The same truck or trailer is on another event that day. */
  conflict: string | null;
}

export interface TrackerRow {
  id: string;
  version: number | undefined;
  eventNumber: string;
  /** The stored number; empty when the row shows a fallback. */
  storedEventNumber: string;
  startsAt: number | null;
  title: string;
  client: string;
  guests: number;
  stage: string;
  serviceStyleId: string | null;
  binderStatus: string | null;
  packState: PackState;
  packDetail: string | null;
  packListId: string | null;
  rigs: TrackerRig[];
}

export interface TrackerSources {
  events: Doc<"events">[];
  clients: Doc<"clients">[];
  invoices: Doc<"invoices">[];
  packLists: Doc<"packLists">[];
  reviewFlags: Doc<"reviewFlags">[];
  assignments: Doc<"eventVehicleAssignments">[];
}

const PACK_LIST_RANK: Record<string, number> = {
  draft: 0,
  packing: 1,
  packed: 2,
  loaded: 3,
  dispatched: 4,
};

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function packStateOf(
  stage: string,
  lists: Doc<"packLists">[],
  openFlags: number,
): { state: PackState; detail: string | null } {
  const stuck = lists.find((list) => list.assistanceRequestedAt != null);
  if (stuck)
    return {
      state: "needs_assistance",
      detail: stuck.assistanceNote ?? null,
    };
  if (openFlags > 0)
    return {
      state: "question",
      detail: `${openFlags} open ${openFlags === 1 ? "question" : "questions"}`,
    };
  // Several lists: the event is only as far along as its slowest list.
  const ranks = lists.map((list) => PACK_LIST_RANK[String(list.status)] ?? 0);
  const rank = ranks.length > 0 ? Math.min(...ranks) : 0;
  if (rank === 4) return { state: "dispatched", detail: null };
  if (rank === 3) return { state: "loaded", detail: null };
  if (rank === 2) return { state: "packed", detail: null };
  if (rank === 1) return { state: "packing", detail: null };
  if (BEFORE_SALES_LOCK.has(stage))
    return { state: "waiting_sales_lock", detail: null };
  return {
    state: "not_started",
    detail: lists.length === 0 ? "No pack list" : null,
  };
}

/** One sheet row per live, dated event inside [monthStart, monthEnd). */
export function buildTrackerRows(
  sources: TrackerSources,
  monthStart: number,
  monthEnd: number,
): TrackerRow[] {
  const invoiceByEvent = new Map<string, string>();
  for (const invoice of sources.invoices) {
    if (invoice.deletedAt != null || !invoice.eventId) continue;
    if (!invoice.invoiceNumber || invoiceByEvent.has(invoice.eventId)) continue;
    invoiceByEvent.set(invoice.eventId, invoice.invoiceNumber);
  }

  const listsByEvent = new Map<string, Doc<"packLists">[]>();
  for (const list of sources.packLists) {
    if (list.deletedAt != null || String(list.status) === "cancelled") continue;
    const lists = listsByEvent.get(list.eventId) ?? [];
    lists.push(list);
    listsByEvent.set(list.eventId, lists);
  }

  const flagsByEvent = new Map<string, number>();
  for (const flag of sources.reviewFlags) {
    if (flag.deletedAt != null || String(flag.status) !== "open") continue;
    flagsByEvent.set(flag.eventId, (flagsByEvent.get(flag.eventId) ?? 0) + 1);
  }

  const eventById = new Map<string, Doc<"events">>(
    sources.events.map((e) => [e._id, e]),
  );
  const live = sources.assignments.filter(
    (row) =>
      row.deletedAt == null && row.releasedAt == null && row.assignedAt != null,
  );
  // "truck:<id>:<day>" → titles of the events that hold it that day.
  const holders = new Map<string, Set<string>>();
  for (const row of live) {
    const event = eventById.get(row.eventId);
    if (!event || event.startsAt == null) continue;
    const day = dayKey(event.startsAt);
    for (const key of [
      row.vehicleId ? `truck:${row.vehicleId}:${day}` : null,
      row.trailerId ? `trailer:${row.trailerId}:${day}` : null,
    ]) {
      if (!key) continue;
      const set = holders.get(key) ?? new Set<string>();
      set.add(row.eventId);
      holders.set(key, set);
    }
  }
  const conflictFor = (row: Doc<"eventVehicleAssignments">): string | null => {
    const event = eventById.get(row.eventId);
    if (!event || event.startsAt == null) return null;
    const day = dayKey(event.startsAt);
    const others = new Set<string>();
    for (const key of [
      row.vehicleId ? `truck:${row.vehicleId}:${day}` : null,
      row.trailerId ? `trailer:${row.trailerId}:${day}` : null,
    ]) {
      if (!key) continue;
      for (const id of holders.get(key) ?? [])
        if (id !== row.eventId) others.add(id);
    }
    if (others.size === 0) return null;
    const names = [...others].map(
      (id) => eventById.get(id)?.title || "another event",
    );
    return `Also on ${names.join(", ")} that day`;
  };

  const rigsByEvent = new Map<string, TrackerRig[]>();
  for (const row of live) {
    const rigs = rigsByEvent.get(row.eventId) ?? [];
    rigs.push({
      id: row._id,
      version: row.version,
      vehicleId: row.vehicleId ?? null,
      trailerId: row.trailerId ?? null,
      driverId: row.driverId ?? null,
      notes: row.notes ?? null,
      preloaded: row.preloadedAt != null,
      conflict: conflictFor(row),
    });
    rigsByEvent.set(row.eventId, rigs);
  }

  return sources.events
    .filter(
      (event) =>
        event.deletedAt == null &&
        String(event.stage) !== "cancelled" &&
        event.startsAt != null &&
        event.startsAt >= monthStart &&
        event.startsAt < monthEnd,
    )
    .map((event): TrackerRow => {
      const stage = String(event.stage);
      const lists = listsByEvent.get(event._id) ?? [];
      const pack = packStateOf(stage, lists, flagsByEvent.get(event._id) ?? 0);
      const stored = event.eventNumber?.trim() ?? "";
      return {
        id: event._id,
        version: typeof event.version === "number" ? event.version : undefined,
        eventNumber:
          stored || invoiceByEvent.get(event._id) || shortRef(event._id),
        storedEventNumber: stored,
        startsAt: event.startsAt ?? null,
        title: event.title || "Untitled event",
        client: clientDisplayName(event.clientId, sources.clients),
        guests: event.expectedHeadcount ?? 0,
        stage,
        serviceStyleId: event.serviceStyleId ?? null,
        binderStatus: event.binderStatus ? String(event.binderStatus) : null,
        packState: pack.state,
        packDetail: pack.detail,
        packListId: lists[0]?._id ?? null,
        rigs: rigsByEvent.get(event._id) ?? [],
      };
    })
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));
}

export function monthBounds(year: number, month: number) {
  return {
    start: new Date(year, month, 1).getTime(),
    end: new Date(year, month + 1, 1).getTime(),
  };
}
