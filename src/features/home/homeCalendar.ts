import type { Doc } from "../../lib/api";
import { formatStatusLabel } from "../../lib/statusLabels";
import { clientDisplayName } from "../events/clientName";
import { STAGE_LABEL, type EventStage } from "../events/eventStatus";

export const DAY_MS = 86_400_000;

/**
 * Sales-lock reading of Event.stage. The calendar colours by this, not by the
 * ten raw stages, because the question the calendar answers is "can sales
 * still change this event?".
 */
export type LockStatus =
  "open" | "approved" | "locked" | "live" | "done" | "cancelled";

export const LOCK_LABEL: Record<LockStatus, string> = {
  open: "Sales open",
  approved: "Approved · not locked",
  locked: "Sales locked",
  live: "Locked · in service",
  done: "Complete",
  cancelled: "Cancelled",
};

export const LOCK_ORDER: readonly LockStatus[] = [
  "open",
  "approved",
  "locked",
  "live",
  "done",
  "cancelled",
];

export function lockStatusOf(stage: string): LockStatus {
  switch (stage) {
    case "quote":
    case "planning":
    case "pending_approval":
      return "open";
    case "approved":
      return "approved";
    case "sales_lock":
      return "locked";
    case "executing":
    case "final":
      return "live";
    case "completed":
    case "closed_out":
      return "done";
    case "cancelled":
      return "cancelled";
    default:
      return "open";
  }
}

export interface CalendarEventFacts {
  id: string;
  title: string;
  startsAt: number | null;
  endsAt: number | null;
  /** Invoice number when one exists; otherwise a short reference from the id. */
  eventNumber: string;
  guests: number;
  vehicle: string;
  serviceType: string;
  venue: string;
  venueId: string | null;
  client: string;
  owner: string;
  ownerId: string | null;
  stage: EventStage;
  stageLabel: string;
  /** planEngagement has run; submitForApproval needs it. */
  planned: boolean;
  lock: LockStatus;
  lockLabel: string;
  version: number | undefined;
}

export interface CalendarSources {
  events: Doc<"events">[];
  clients: Doc<"clients">[];
  venues: Doc<"venues">[];
  deliveries: Doc<"deliveries">[];
  vehicles: Doc<"vehicles">[];
  serviceStyles: Doc<"serviceStyles">[];
  people: Doc<"people">[];
  invoices: Doc<"invoices">[];
}

function shortRef(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

function personName(person: Doc<"people"> | undefined): string {
  if (!person) return "—";
  const name = `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim();
  return name || "—";
}

function vehicleLabel(vehicle: Doc<"vehicles">): string {
  const name = `${vehicle.make} ${vehicle.model}`.trim();
  return vehicle.registration ? `${name} · ${vehicle.registration}` : name;
}

/** One read-only fact sheet per live event, in start order. */
export function buildCalendarFacts(
  sources: CalendarSources,
): CalendarEventFacts[] {
  const venueById = new Map(sources.venues.map((v) => [v._id, v]));
  const vehicleById = new Map(sources.vehicles.map((v) => [v._id, v]));
  const styleById = new Map(sources.serviceStyles.map((s) => [s._id, s]));
  const personById = new Map(sources.people.map((p) => [p._id, p]));

  const invoiceByEvent = new Map<string, string>();
  for (const invoice of sources.invoices) {
    if (invoice.deletedAt != null || !invoice.eventId) continue;
    if (!invoice.invoiceNumber || invoiceByEvent.has(invoice.eventId)) continue;
    invoiceByEvent.set(invoice.eventId, invoice.invoiceNumber);
  }

  const vehiclesByEvent = new Map<string, Set<string>>();
  for (const delivery of sources.deliveries) {
    if (delivery.deletedAt != null || delivery.status === "cancelled") continue;
    if (!delivery.vehicleId) continue;
    const vehicle = vehicleById.get(delivery.vehicleId);
    if (!vehicle) continue;
    const set = vehiclesByEvent.get(delivery.eventId) ?? new Set<string>();
    set.add(vehicleLabel(vehicle));
    vehiclesByEvent.set(delivery.eventId, set);
  }

  return sources.events
    .filter((event) => event.deletedAt == null)
    .map((event): CalendarEventFacts => {
      const stage = String(event.stage) as EventStage;
      const lock = lockStatusOf(stage);
      const style = event.serviceStyleId
        ? styleById.get(event.serviceStyleId)
        : undefined;
      const serviceType = [
        event.eventType ? formatStatusLabel(event.eventType) : "",
        style?.name,
      ]
        .filter((part): part is string => !!part && part.trim() !== "")
        .join(" · ");
      const venue = event.venueId ? venueById.get(event.venueId) : undefined;
      const owner = event.assignedToId
        ? personById.get(event.assignedToId)
        : undefined;
      const vehicles = vehiclesByEvent.get(event._id);
      return {
        id: event._id,
        title: event.title || "Untitled event",
        startsAt: event.startsAt ?? null,
        endsAt: event.endsAt ?? null,
        eventNumber: invoiceByEvent.get(event._id) ?? shortRef(event._id),
        guests: event.expectedHeadcount ?? 0,
        vehicle: vehicles ? [...vehicles].join(", ") : "—",
        serviceType: serviceType || "Not set",
        venue: venue?.name || event.venueName || "Venue not set",
        venueId: event.venueId ?? null,
        client: clientDisplayName(event.clientId, sources.clients),
        owner: personName(owner),
        ownerId: event.assignedToId ?? null,
        stage,
        stageLabel: STAGE_LABEL[stage] ?? stage,
        planned: event.plannedAt != null,
        lock,
        lockLabel: LOCK_LABEL[lock],
        version: typeof event.version === "number" ? event.version : undefined,
      };
    })
    .sort((a, b) => (a.startsAt ?? Infinity) - (b.startsAt ?? Infinity));
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface CalendarCell {
  dayStart: number;
  inMonth: boolean;
  events: CalendarEventFacts[];
}

/**
 * Six weeks of cells starting on the Sunday on or before the first of the
 * month. Multi-day events are drawn on every day they touch so a two-day
 * festival is not a surprise on day two.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  events: readonly CalendarEventFacts[],
): CalendarCell[][] {
  const first = new Date(year, month, 1);
  const gridStart = addDays(first.getTime(), -first.getDay());
  const byDay = new Map<number, CalendarEventFacts[]>();
  for (const event of events) {
    if (event.startsAt == null) continue;
    const firstDay = startOfDay(event.startsAt);
    const lastDay =
      event.endsAt != null && event.endsAt > event.startsAt
        ? startOfDay(event.endsAt - 1)
        : firstDay;
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      const list = byDay.get(day) ?? [];
      list.push(event);
      byDay.set(day, list);
    }
  }
  const weeks: CalendarCell[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const cells: CalendarCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const dayStart = addDays(gridStart, week * 7 + weekday);
      cells.push({
        dayStart,
        inMonth: new Date(dayStart).getMonth() === month,
        events: byDay.get(dayStart) ?? [],
      });
    }
    weeks.push(cells);
  }
  return weeks;
}

export function unscheduledEvents(
  events: readonly CalendarEventFacts[],
): CalendarEventFacts[] {
  return events.filter(
    (event) =>
      event.startsAt == null &&
      event.lock !== "done" &&
      event.lock !== "cancelled",
  );
}
