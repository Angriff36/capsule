import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Doc } from "../../../lib/api";
import {
  formatCount,
  formatDate,
  formatMoney,
  formatTime,
} from "../../../lib/format";
import { formatStatusLabel } from "../../../lib/statusLabels";
import { clientDisplayName } from "../clientName";
import { eventDetailPath } from "../eventRoutes";
import { compareActivities } from "../EventTimelinePanel";
import { formatAssigneeLabel } from "../timelineAssigneeOptions";
import {
  MobileEmpty,
  MobileMore,
  MobileSectionCard,
} from "./MobileSectionCard";

const ROW_LIMIT = 8;

type ClientRow = { _id: string } | null | undefined;

export type MobileFactsProps = {
  readonly event: Doc<"events">;
  readonly venue: { name: string } | null | undefined;
  readonly clients: readonly ClientRow[] | undefined;
  readonly currencyCode: string;
};

/** Facts: when, how many, where, who, what kind, and the commercial snapshot. */
export function MobileFactsCard({
  event,
  venue,
  clients,
  currencyCode,
}: MobileFactsProps) {
  const when = (value: number | null | undefined) => (
    <>
      {formatDate(value)}
      <span className="block text-sm font-medium text-ink-2">
        {formatTime(value)}
      </span>
    </>
  );
  const facts: Array<[string, ReactNode]> = [
    ["Starts", when(event.startsAt)],
    ["Ends", when(event.endsAt)],
    // Date, headcount, and venue already sit in the page header.
    ["Type", formatStatusLabel(event.eventType)],
    [
      "Client",
      <Link
        key="client"
        to={`/clients/${event.clientId}`}
        className="underline"
      >
        {clientDisplayName(event.clientId, clients as never)}
      </Link>,
    ],
    ["Budget", formatMoney(event.budgetAmount, currencyCode)],
    ["Quoted", formatMoney(event.quotedPrice, currencyCode)],
  ];
  return (
    <MobileSectionCard
      id="facts"
      title="Facts"
      seeAllTo={`${eventDetailPath(event._id, "overview")}&full=1`}
      seeAllLabel="Edit"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-semibold text-ink-2">{label}</dt>
            <dd className="mt-0.5 text-base font-semibold break-words text-ink">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </MobileSectionCard>
  );
}

type EventDish = Doc<"eventDishes">;
type Dish = Doc<"dishes">;

export function MobileMenuCard({
  eventId,
  eventDishes,
  dishes,
}: {
  readonly eventId: string;
  readonly eventDishes: readonly EventDish[] | undefined;
  readonly dishes: readonly Dish[] | undefined;
}) {
  const selections = (eventDishes ?? []).filter(
    (row) =>
      row.deletedAt == null && row.removedAt == null && row.eventId === eventId,
  );
  const courses = new Map<string, EventDish[]>();
  for (const row of selections) {
    const course = row.course?.trim() || "Uncategorized";
    courses.set(course, [...(courses.get(course) ?? []), row]);
  }
  const ordered = [...courses.entries()].sort(([a], [b]) =>
    a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b),
  );
  const servings = selections.reduce(
    (sum, row) => sum + (Number(row.quantityServings) || 0),
    0,
  );
  return (
    <MobileSectionCard
      id="menu"
      title="Menu"
      caption={
        selections.length > 0
          ? `${selections.length} dishes · ${servings} servings`
          : undefined
      }
      seeAllTo={eventDetailPath(eventId, "menu")}
    >
      {ordered.length === 0 ? (
        <MobileEmpty>No dishes on this event yet.</MobileEmpty>
      ) : (
        ordered.map(([course, rows]) => (
          <div key={course} className="pt-2">
            <p className="eyebrow">{course}</p>
            {rows.map((row) => {
              const dish = dishes?.find((d) => d._id === row.dishId);
              return (
                <div key={row._id} className="mobile-row">
                  <span className="mobile-row-main truncate">
                    {dish?.name ?? "Unknown dish"}
                  </span>
                  <span className="shrink-0 font-mono text-base text-ink-2">
                    {row.quantityServings} srv
                  </span>
                </div>
              );
            })}
          </div>
        ))
      )}
    </MobileSectionCard>
  );
}

type Activity = Doc<"eventTimelineActivities">;
type Person = Doc<"people">;

function personName(person: Person | undefined): string {
  if (!person) return "";
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ") || "Staff"
  );
}

export function MobileTimelineCard({
  eventId,
  activities,
  people,
}: {
  readonly eventId: string;
  readonly activities: readonly Activity[] | undefined;
  readonly people: readonly Person[] | undefined;
}) {
  const rows = (activities ?? [])
    // Same rows and order as the full Timeline tab.
    .filter(
      (row) =>
        row.eventId === eventId &&
        row.scheduledAt != null &&
        row.deletedAt == null,
    )
    .sort(compareActivities);
  const shown = rows.slice(0, ROW_LIMIT);
  return (
    <MobileSectionCard
      id="timeline"
      title="Timeline"
      caption={rows.length > 0 ? `${rows.length} blocks` : undefined}
      seeAllTo={eventDetailPath(eventId, "timeline")}
    >
      {rows.length === 0 ? (
        <MobileEmpty>No run-of-show blocks yet.</MobileEmpty>
      ) : (
        shown.map((row) => {
          const at = row.startsAt ?? row.scheduledAt;
          const who = formatAssigneeLabel({
            teams: row.assigneeTeams ?? [],
            personNames: (row.assigneePersonIds ?? []).map((id) =>
              personName(people?.find((p) => p._id === id)),
            ),
            fallback: row.responsibleParty,
          });
          return (
            <div key={row._id} className="mobile-row">
              <span className="w-20 shrink-0 font-mono text-base text-ink-2">
                {at != null ? formatTime(at) : "—"}
              </span>
              <span className="mobile-row-main">
                <span className="block truncate">{row.name}</span>
                {who ? (
                  <span className="mobile-row-sub truncate">{who}</span>
                ) : null}
              </span>
            </div>
          );
        })
      )}
      <MobileMore count={rows.length - shown.length} />
    </MobileSectionCard>
  );
}

type Assignment = Doc<"eventAssignments">;

export function MobileStaffCard({
  eventId,
  assignments,
  people,
}: {
  readonly eventId: string;
  readonly assignments: readonly Assignment[] | undefined;
  readonly people: readonly Person[] | undefined;
}) {
  const rows = (assignments ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.eventId === eventId &&
      row.status !== "unassigned",
  );
  const shown = rows.slice(0, ROW_LIMIT);
  return (
    <MobileSectionCard
      id="staff"
      title="Staff"
      caption={rows.length > 0 ? `${rows.length} assigned` : undefined}
      seeAllTo={eventDetailPath(eventId, "staffing")}
    >
      {rows.length === 0 ? (
        <MobileEmpty>No staff assigned yet.</MobileEmpty>
      ) : (
        shown.map((row) => {
          const person = people?.find((p) => p._id === row.personId);
          const window =
            row.startsAt != null
              ? `${formatTime(row.startsAt)}${row.endsAt != null ? `–${formatTime(row.endsAt)}` : ""}`
              : "";
          return (
            <div key={row._id} className="mobile-row">
              <span className="mobile-row-main">
                <span className="block truncate">
                  {personName(person) || "Staff"}
                </span>
                <span className="mobile-row-sub truncate">
                  {[row.role, window].filter(Boolean).join(" · ") ||
                    formatStatusLabel(String(row.status))}
                </span>
              </span>
            </div>
          );
        })
      )}
      <MobileMore count={rows.length - shown.length} />
    </MobileSectionCard>
  );
}
