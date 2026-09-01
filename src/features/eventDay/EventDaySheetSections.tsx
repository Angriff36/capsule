import type { ReactNode } from "react";
import type { Doc } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import { compareActivities } from "../events/EventTimelinePanel";
import { formatAssigneeLabel } from "../events/timelineAssigneeOptions";
import type { EventDayInputs } from "./eventDayModel";

/**
 * Read-only sheet bodies, one per map section. Everything a crew member
 * needs on site, nothing they can break: no mutations anywhere in here.
 */

export type EventDayDetailData = EventDayInputs & {
  dishes: readonly Doc<"dishes">[];
  people: readonly Doc<"people">[];
  vehicles: readonly Doc<"vehicles">[];
  equipments: readonly Doc<"equipments">[];
};

function personName(person: Doc<"people"> | undefined): string {
  if (!person) return "";
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ") || "Staff"
  );
}

function timeWindow(startsAt: unknown, endsAt: unknown): string {
  const start = typeof startsAt === "number" ? formatTime(startsAt) : null;
  const end = typeof endsAt === "number" ? formatTime(endsAt) : null;
  if (start && end) return `${start}–${end}`;
  return start ?? "";
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="evd-empty">{children}</p>;
}

function Row({
  time,
  title,
  sub,
  flag,
  flagClass,
}: {
  time?: string;
  title: ReactNode;
  sub?: ReactNode;
  flag?: string;
  flagClass?: string;
}) {
  return (
    <div className="evd-row">
      {time != null ? <span className="evd-row-time">{time}</span> : null}
      <span className="evd-row-main">
        <span className="evd-row-title">{title}</span>
        {sub ? <span className="evd-row-sub block">{sub}</span> : null}
      </span>
      {flag ? (
        <span className={`evd-row-flag ${flagClass ?? ""}`}>{flag}</span>
      ) : null}
    </div>
  );
}

function Note({ label, text }: { label: string; text: unknown }) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  return (
    <>
      <p className="evd-kicker">{label}</p>
      <p className="evd-note">{value}</p>
    </>
  );
}

function Tel({ phone }: { phone: unknown }) {
  const value = String(phone ?? "").trim();
  if (!value) return null;
  return (
    <a className="evd-tel" href={`tel:${value.replace(/[^+\d]/g, "")}`}>
      {value}
    </a>
  );
}

export function VenueSheet({ data }: { data: EventDayDetailData }) {
  const { event, venue } = data;
  const name = venue?.name ?? event.venueName;
  if (!name) return <Empty>No venue on this event yet.</Empty>;
  const address = venue
    ? [
        venue.addressLine1,
        venue.addressLine2,
        [venue.city, venue.region, venue.postalCode].filter(Boolean).join(", "),
      ]
        .map((line) => String(line ?? "").trim())
        .filter(Boolean)
        .join("\n")
    : String(event.venueAddress ?? "").trim();
  const traits = venue
    ? [
        venue.parkingAvailable ? "Parking" : null,
        venue.kitchenAccess ? "Kitchen access" : null,
        venue.powerAvailable ? "Power" : null,
        venue.waterAccess ? "Water" : null,
        venue.hasFreightElevator ? "Freight elevator" : null,
        venue.hasStairs ? "Stairs" : null,
        venue.storageAvailable ? "Storage" : null,
      ].filter(Boolean)
    : [];
  return (
    <div>
      <Row
        title={String(name)}
        sub={venue?.capacity != null ? `Capacity ${venue.capacity}` : undefined}
      />
      {address ? <p className="evd-note">{address}</p> : null}
      {traits.length > 0 ? (
        <>
          <p className="evd-kicker">On site</p>
          <p className="evd-note">{traits.join(" · ")}</p>
        </>
      ) : null}
      <Note label="Load-in" text={venue?.loadInInstructions} />
      <Note label="Access" text={venue?.accessNotes} />
      <Note label="Catering notes" text={venue?.cateringNotes} />
      <Note label="Restrictions" text={venue?.restrictions} />
      {venue?.contactName || venue?.contactPhone ? (
        <>
          <p className="evd-kicker">Venue contact</p>
          <Row
            title={String(venue.contactName ?? "Venue")}
            sub={<Tel phone={venue.contactPhone} />}
          />
        </>
      ) : null}
    </div>
  );
}

export function StaffingSheet({ data }: { data: EventDayDetailData }) {
  const rows = [...data.assignments]
    .filter((row) => String(row.status) !== "unassigned")
    .sort((a, b) => Number(a.startsAt ?? 0) - Number(b.startsAt ?? 0));
  const needs = data.staffNeeds.filter((row) =>
    ["open", "claimed"].includes(String(row.status)),
  );
  if (rows.length === 0 && needs.length === 0)
    return <Empty>No staff assigned yet.</Empty>;
  return (
    <div>
      {rows.map((row) => (
        <Row
          key={row._id}
          time={timeWindow(row.startsAt, row.endsAt) || undefined}
          title={
            personName(data.people.find((p) => p._id === row.personId)) ||
            "Staff"
          }
          sub={String(row.role ?? "")}
          flag={formatStatusLabel(String(row.status))}
          flagClass={
            ["confirmed", "checked_in"].includes(String(row.status))
              ? "evd-tone-ok"
              : undefined
          }
        />
      ))}
      {needs.length > 0 ? (
        <>
          <p className="evd-kicker">Unfilled roles</p>
          {needs.map((row) => (
            <Row
              key={row._id}
              time={timeWindow(row.startsAt, row.endsAt) || undefined}
              title={String(row.role ?? "Role")}
              sub={String(row.description ?? "")}
              flag={formatStatusLabel(String(row.status))}
              flagClass="evd-tone-warn"
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function TimelineSheet({ data }: { data: EventDayDetailData }) {
  const rows = [...data.activities].sort(compareActivities);
  if (rows.length === 0) return <Empty>No run of show yet.</Empty>;
  return (
    <div>
      {rows.map((row) => {
        const at = row.startsAt ?? row.scheduledAt;
        const who = formatAssigneeLabel({
          teams: row.assigneeTeams ?? [],
          personNames: (row.assigneePersonIds ?? []).map((id) =>
            personName(data.people.find((p) => p._id === id)),
          ),
          fallback: row.responsibleParty,
        });
        return (
          <Row
            key={row._id}
            time={typeof at === "number" ? formatTime(at) : "—"}
            title={String(row.name)}
            sub={[who, String(row.siteNotes ?? "").trim()]
              .filter(Boolean)
              .join(" · ")}
          />
        );
      })}
    </div>
  );
}

export function MenuSheet({ data }: { data: EventDayDetailData }) {
  const rows = data.eventDishes;
  if (rows.length === 0) return <Empty>No dishes on this event.</Empty>;
  const courses = new Map<string, typeof rows>();
  for (const row of rows) {
    const course = String(row.course ?? "").trim() || "Menu";
    courses.set(course, [...(courses.get(course) ?? []), row]);
  }
  return (
    <div>
      {[...courses.entries()].map(([course, list]) => (
        <div key={course}>
          <p className="evd-kicker">{course}</p>
          {list.map((row) => {
            const dish = data.dishes.find((d) => d._id === row.dishId);
            return (
              <Row
                key={row._id}
                title={dish?.name ?? "Dish"}
                sub={String(row.specialInstructions ?? "").trim() || undefined}
                flag={`${row.quantityServings} srv`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function VehiclesSheet({ data }: { data: EventDayDetailData }) {
  const rows = [...data.deliveries]
    .filter((row) => String(row.status) !== "cancelled")
    .sort(
      (a, b) => Number(a.windowStartsAt ?? 0) - Number(b.windowStartsAt ?? 0),
    );
  if (rows.length === 0) return <Empty>No deliveries scheduled.</Empty>;
  return (
    <div>
      {rows.map((row) => {
        const vehicle = data.vehicles.find((v) => v._id === row.vehicleId);
        const driver = personName(
          data.people.find((p) => p._id === row.driverId),
        );
        return (
          <Row
            key={row._id}
            time={timeWindow(row.windowStartsAt, row.windowEndsAt) || undefined}
            title={String(row.destination ?? "Delivery")}
            sub={[
              driver || "No driver",
              vehicle ? `${vehicle.make} ${vehicle.model}` : "No vehicle",
            ].join(" · ")}
            flag={formatStatusLabel(String(row.status))}
            flagClass={
              String(row.status) === "failed"
                ? "evd-missing"
                : String(row.status) === "delivered"
                  ? "evd-tone-ok"
                  : undefined
            }
          />
        );
      })}
    </div>
  );
}

export function LayoutsSheet({ data }: { data: EventDayDetailData }) {
  const rows = [...data.layoutSections].sort(
    (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
  );
  if (rows.length === 0) return <Empty>No layout sections yet.</Empty>;
  return (
    <div>
      {rows.map((row) => (
        <Row
          key={row._id}
          title={String(row.type ?? "Section")}
          sub={String(row.instructions ?? "").trim() || undefined}
        />
      ))}
    </div>
  );
}

export function EquipmentSheet({ data }: { data: EventDayDetailData }) {
  const rows = [...data.equipmentReservations]
    .filter((row) => String(row.status) !== "cancelled")
    .sort((a, b) => Number(a.startsAt ?? 0) - Number(b.startsAt ?? 0));
  if (rows.length === 0) return <Empty>No equipment reserved.</Empty>;
  return (
    <div>
      {rows.map((row) => {
        const item = data.equipments.find((e) => e._id === row.equipmentId);
        return (
          <Row
            key={row._id}
            title={item?.name ?? "Equipment"}
            sub={[
              `Qty ${Number(row.quantity) || 1}`,
              timeWindow(row.startsAt, row.endsAt),
            ]
              .filter(Boolean)
              .join(" · ")}
            flag={formatStatusLabel(String(row.status))}
            flagClass={
              String(row.status) === "checked_out" ? "evd-tone-ok" : undefined
            }
          />
        );
      })}
    </div>
  );
}

export function ContactsSheet({ data }: { data: EventDayDetailData }) {
  const { event, venue } = data;
  const named = String(event.primaryContactName ?? "").trim();
  const contacts = data.clientContacts;
  if (!named && contacts.length === 0 && !venue?.contactName)
    return <Empty>No contacts on file.</Empty>;
  return (
    <div>
      {named ? (
        <>
          <p className="evd-kicker">Event contact</p>
          <Row
            title={named}
            sub={
              <>
                <Tel phone={event.primaryContactPhone} />
                {event.primaryContactEmail
                  ? ` · ${event.primaryContactEmail}`
                  : ""}
              </>
            }
          />
        </>
      ) : null}
      {contacts.length > 0 ? (
        <>
          <p className="evd-kicker">Client contacts</p>
          {contacts.map((row) => (
            <Row
              key={row._id}
              title={[row.givenName, row.familyName].filter(Boolean).join(" ")}
              sub={
                <>
                  {row.title ? `${row.title} · ` : ""}
                  <Tel phone={row.phone ?? row.mobile} />
                </>
              }
              flag={row.isPrimary ? "Primary" : undefined}
              flagClass="evd-tone-ok"
            />
          ))}
        </>
      ) : null}
      {venue?.contactName || venue?.contactPhone ? (
        <>
          <p className="evd-kicker">Venue</p>
          <Row
            title={String(venue.contactName ?? "Venue")}
            sub={<Tel phone={venue.contactPhone} />}
          />
        </>
      ) : null}
    </div>
  );
}

export function PackListSheet({ data }: { data: EventDayDetailData }) {
  const lists = data.packLists.filter(
    (row) => String(row.status) !== "cancelled",
  );
  if (lists.length === 0) return <Empty>No pack list for this event.</Empty>;
  return (
    <div>
      {lists.map((list) => {
        const items = data.packListItems.filter(
          (row) => row.packListId === list._id,
        );
        return (
          <div key={list._id}>
            <p className="evd-kicker">
              {String(list.name ?? "Pack list")} ·{" "}
              {formatStatusLabel(String(list.status))}
            </p>
            {items.length === 0 ? (
              <Empty>No items listed.</Empty>
            ) : (
              items.map((row) => {
                const missing = String(row.status) === "missing";
                const packed = String(row.status) === "packed";
                return (
                  <Row
                    key={row._id}
                    title={String(row.description)}
                    sub={`${row.requiredQuantity} ${String(row.unit ?? "")}`}
                    flag={missing ? "Missing" : packed ? "Packed" : undefined}
                    flagClass={missing ? "evd-missing" : "evd-tone-ok"}
                  />
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

export function eventDateLine(event: Doc<"events">): string {
  const date =
    typeof event.startsAt === "number" ? formatDate(event.startsAt) : "";
  const time =
    typeof event.startsAt === "number" ? formatTime(event.startsAt) : "";
  return [date, time].filter(Boolean).join(" · ");
}
