import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { EventDayBriefing } from "../../lib/eventDayBriefing";
import { eventTimingWindows } from "../../lib/eventTimingMilestones";
import { formatTime } from "../../lib/format";
import { displayEventMenuNotes } from "../events/eventMenuLineFields";
import type {
  FinalLockAnswer,
  FinalLockValue,
} from "../../lib/eventPacket/finalLock/types";
import type { buildBoard } from "./BattleBoardPage";
import {
  boardDate,
  courseTitle,
  plates,
  readAnswer,
  readScopeText,
  splitOperational,
  splitRole,
  splitService,
  teamTone,
  type Answer,
} from "./battleBoardSheetModel";
import "./battleBoardSheet.css";

type Board = ReturnType<typeof buildBoard>;

const SCOPE = [
  ["Bar service", "barService"],
  ["Cocktail hour food", "cocktailHourFood"],
  ["Dessert", "dessertService"],
  ["Bussing", "bussing"],
  ["Place settings", "placeSettings"],
] as const;
const SERVICE = [
  ["Passed apps", "passedApps"],
  ["Stationary apps", "stationaryApps"],
  ["Beverages on menu", "beveragesOnMenu"],
  ["Tableside water", "tablesideWater"],
] as const;
const LOGISTICS = [
  ["Our disposables", "mangiaDisposables"],
  ["Event rentals", "eventRentals"],
  ["Scullery", "scullery"],
  ["Power onsite", "powerOnsite"],
  ["Water onsite", "waterOnsite"],
] as const;

const shift = (start: number | null, end: number | null) =>
  start == null
    ? ""
    : end != null
      ? `${formatTime(start)} – ${formatTime(end)}`
      : formatTime(start);

const words = (raw: string | null | undefined) =>
  String(raw ?? "")
    .replaceAll("_", " ")
    .toUpperCase();

/**
 * The printed battle board, laid out like the owner's Mangia battle board:
 * event facts, summary, layout and locations, Mangia's responsibilities,
 * menu, buffet line, staff roster, timeline, and the setup and reference
 * notes. Every part fills itself from the event; a part with nothing to say
 * is left out.
 */
export function BattleBoardSheet({
  briefing,
  board,
  companyName,
  timing,
  finalLock,
}: {
  briefing: EventDayBriefing;
  board: Board;
  companyName: string;
  /** The event's computed crew plan times (staff on, depart shop, ...). */
  timing?: Record<string, unknown> | null;
  /** The event's Final Lock answers: defaults where the day sheet is blank. */
  finalLock?: readonly FinalLockAnswer[];
}) {
  const lockText = (key: string) => {
    const answer = finalLock?.find(
      (row) => row.questionKey === key && row.result === "answered",
    );
    return answer ? finalLockText(answer.value) : "";
  };
  // An imported board's chart, kept as one line in the event's notes.
  const opsText = splitOperational(board.event.operationalRequirements);
  const imported = readScopeText(`${opsText.also}\n${opsText.other}`);
  // A blank day-sheet answer takes the imported chart, then Final Lock.
  const event = {
    ...board.event,
    ...Object.fromEntries(
      Object.entries(imported.answers).filter(
        ([key]) => !(board.event as unknown as Record<string, unknown>)[key],
      ),
    ),
    barService:
      board.event.barService ||
      imported.answers.barService ||
      lockText("beverage.bar") ||
      null,
    dessertService:
      board.event.dessertService ||
      imported.answers.dessertService ||
      lockText("dessert.plan") ||
      null,
    bussing:
      board.event.bussing ||
      imported.answers.bussing ||
      lockText("bussing.plan") ||
      null,
    tablesideWater:
      board.event.tablesideWater ||
      imported.answers.tablesideWater ||
      lockText("room.water_goblets") ||
      null,
    buffetHotPlates:
      board.event.buffetHotPlates ||
      (board.event.buffetColdPlates ? null : lockText("buffet.arrangement")) ||
      null,
  };
  const ops = splitOperational(event.operationalRequirements);
  const service = splitService(event.serviceRequirements);
  // No BEO overview: say what the event is from its own facts.
  const summary =
    service.overview ||
    [
      [event.serviceStyleName, event.eventType].filter(Boolean).join(" "),
      event.expectedHeadcount != null
        ? `for ${event.expectedHeadcount} ${event.expectedHeadcount === 1 ? "guest" : "guests"}`
        : null,
      board.venue?.name || event.venueName
        ? `at ${board.venue?.name ?? event.venueName}`
        : null,
      event.startsAt != null
        ? `from ${formatTime(event.startsAt)}${event.endsAt != null ? ` to ${formatTime(event.endsAt)}` : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/^./, (first) => first.toUpperCase())
      .concat(".");
  const venue = board.venue;
  const venueLine = [
    venue?.name ?? event.venueName,
    [venue?.addressLine1, venue?.city].filter(Boolean).join(", ") ||
      event.venueAddress,
    board.venueTraits.length
      ? `On site: ${board.venueTraits.join(", ")}`
      : null,
    venue?.contactName
      ? `Venue contact: ${venue.contactName}${venue.contactPhone ? ` ${venue.contactPhone}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const cold = plates(event.buffetColdPlates);
  const hot = plates(event.buffetHotPlates);
  const dishName = (id: string | null) =>
    briefing.dishes.find((dish) => dish._id === id)?.name ?? "Dish";

  const layoutLines: [string, string][] = [
    ["Venue", venueLine],
    [
      "Service Setup / Layout",
      [
        ops.serviceSetup,
        ...board.layout.map((row) =>
          [row.type, row.instructions].filter(Boolean).join(": "),
        ),
      ]
        .filter(Boolean)
        .join(" "),
    ],
    [
      "Catering Kitchen / Staging",
      [
        ops.kitchen,
        // The venue's own notes, unless the import already copied them in.
        ...board.venueNotes
          .filter(
            ([, text]) =>
              !`${ops.kitchen} ${ops.serviceSetup}`.includes(
                String(text).slice(0, 40),
              ),
          )
          .map(([label, text]) => `${label}: ${text}`),
      ]
        .filter(Boolean)
        .join(" "),
    ],
    ["Operations Notes", ops.operations],
  ];

  const rentals = [
    ...(briefing.rentals ?? []).map((row) => ({
      key: row._id,
      item: row.description ?? "Rental",
      vendor: row.vendorName ?? "",
      qty: `${row.quantity ?? ""} ${row.countUnit ?? ""}`.trim(),
    })),
    ...board.equipment.map((row) => ({
      key: row._id,
      item: board.equipmentName(row.equipmentId),
      vendor: companyName,
      qty: row.quantity != null ? `${row.quantity} each` : "",
    })),
  ];

  const reference: [string, string][] = [
    [
      "Menu / Culinary Notes",
      [service.dietary, ops.menuNotes].filter(Boolean).join("\n"),
    ],
    ["Operations Notes", ops.operations],
    ["Buffetware / Servingware", String(event.servingwareKit ?? "")],
    [
      "Decor Collection / Linen Color",
      [
        ops.decor,
        event.decorKit,
        event.linenColorTables && `Tables: ${event.linenColorTables}`,
        event.linenColorBaskets && `Baskets: ${event.linenColorBaskets}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ],
    ["Equipment & Rentals", ops.rentals],
    ["Additional Tasks / Responsibilities", imported.rest],
  ];

  // Crew-plan steps ("Staff on / Load at shop", "Depart shop" ...) carry no
  // time of their own; the event's plan works them out.
  const planned = eventTimingWindows(timing ?? {});
  const personName = (id: string | null) => {
    const person = id ? board.people.get(id) : undefined;
    return [person?.givenName, person?.familyName].filter(Boolean).join(" ");
  };
  const trucks = briefing.rigs ?? [];
  const packs = board.packLists.map((list) => {
    const lines = briefing.packListItems.filter(
      (item) => item.packListId === list._id && item.deletedAt == null,
    );
    return {
      id: list._id,
      name: list.name || "Pack list",
      status: list.status,
      total: lines.length,
      packed: lines.filter((item) => String(item.status) === "packed").length,
    };
  });
  // The event packet's check of the documents against the event.
  const packet = briefing.packetReadiness;
  const readiness = packet
    ? packet.ready
      ? { ready: true, text: "Event packet: ready, every check signed off." }
      : {
          ready: false,
          text: `Event packet: ${packet.requiredOpenIssueCount} open checks — ${packet.sections
            .filter((row) => row.openIssueCount > 0)
            .map(
              (row) =>
                `${words(row.section).toLowerCase()} ${row.openIssueCount}`,
            )
            .join(", ")}.`,
        }
    : null;
  const timeline = board.timeline.map((row) => {
    if (row.startsAt != null) return row;
    const milestone = planned.find((entry) =>
      entry.aliases.some(
        (name) =>
          name.toLowerCase() ===
          String(row.name ?? "")
            .trim()
            .toLowerCase(),
      ),
    );
    // Service starts with the event when no separate service time is set.
    const at =
      milestone?.startsAt ??
      (milestone?.key === "service" ? event.startsAt : null);
    return at != null ? { ...row, startsAt: at } : row;
  });
  const untimedCrewSteps = timeline.filter(
    (row) =>
      row.startsAt == null &&
      planned.some((entry) =>
        entry.aliases.some(
          (name) =>
            name.toLowerCase() ===
            String(row.name ?? "")
              .trim()
              .toLowerCase(),
        ),
      ),
  ).length;

  return (
    <article className="bbs">
      <header className="bbs-title">
        <strong>{companyName} — FOH Battle Board</strong>
        <span>
          {" "}
          · {event.title ?? "Event"}
          {event.eventNumber ? ` · #${event.eventNumber}` : ""}
        </span>
      </header>
      <dl className="bbs-facts">
        <Fact label="Event">{event.title ?? "—"}</Fact>
        <Fact label="Date">{boardDate(event.startsAt)}</Fact>
        <Fact label="Guests">
          {event.expectedHeadcount != null
            ? `${event.expectedHeadcount} Final`
            : "—"}
        </Fact>
        <Fact label="Style">
          {event.serviceStyleName ?? event.eventType ?? "—"}
        </Fact>
      </dl>
      {event.primaryContactName ? (
        <p className="bbs-contact">
          <b>Client contact:</b> {event.primaryContactName}
          {event.primaryContactPhone ? ` · ${event.primaryContactPhone}` : ""}
          {event.primaryContactEmail ? ` · ${event.primaryContactEmail}` : ""}
        </p>
      ) : null}
      {summary.length > 1 ? <p className="bbs-summary">{summary}</p> : null}

      {layoutLines.some(([, text]) => text) ? (
        <Section title="Layout & Locations">
          {layoutLines
            .filter(([, text]) => text)
            .map(([label, text]) => (
              <p key={label} className="bbs-para">
                <b>{label}:</b> {text}
              </p>
            ))}
        </Section>
      ) : null}

      <Section title={`${companyName.split(" ")[0]}'s Responsibilities`}>
        <div className="bbs-resp">
          <Column title="Scope" rows={SCOPE} event={event} />
          <Column title="Service" rows={SERVICE} event={event} />
          <Column title="Logistics" rows={LOGISTICS} event={event} />
        </div>
      </Section>

      {board.courses.size > 0 ? (
        <Section title="Menu">
          <div className="bbs-menu">
            {[...board.courses.entries()].map(([course, rows]) => (
              <div key={course} className="bbs-menu-group">
                {course !== "Menu" ? (
                  <div className="bbs-menu-row bbs-menu-course">
                    {courseTitle(course)}
                  </div>
                ) : null}
                {rows.map((row) => {
                  const note = displayEventMenuNotes(row.specialInstructions);
                  return (
                    <div key={row._id} className="bbs-menu-row">
                      <span>
                        {dishName(row.dishId)}
                        {row.quantityServings != null
                          ? ` ×${row.quantityServings}`
                          : ""}
                      </span>
                      {note ? <em>{note}</em> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {board.menuAllergens.length ? (
            <p className="bbs-allergens">
              <b>Menu contains:</b>{" "}
              {board.menuAllergens.map((row) => row.label).join(" · ")}
            </p>
          ) : null}
        </Section>
      ) : null}

      {cold.length || hot.length ? (
        <Section title="Buffet Layout">
          <p className="bbs-buffet">
            <b>PLATES →</b>
            {cold.length ? <b>COLD:</b> : null}
            {cold.map((plate) => (
              <span key={`c-${plate}`} className="bbs-plate bbs-plate-cold">
                {plate}
              </span>
            ))}
            {hot.length ? <b>HOT:</b> : null}
            {hot.map((plate, index) => (
              <span
                key={`h-${plate}`}
                className={`bbs-plate bbs-plate-hot-${index % 3}`}
              >
                {plate}
              </span>
            ))}
          </p>
        </Section>
      ) : null}

      {board.staff.length || board.staffNeeds.length ? (
        <Section title="Staff Roster">
          <table className="bbs-table bbs-roster">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Team</th>
                <th>Shift</th>
                <th>Station</th>
              </tr>
            </thead>
            <tbody>
              {board.staff.map((row) => {
                const person = board.people.get(row.personId ?? "");
                const parts = splitRole(row.role);
                return (
                  <tr key={row._id}>
                    <td>
                      {[person?.givenName, person?.familyName]
                        .filter(Boolean)
                        .join(" ") || "Staff"}
                    </td>
                    <td>{parts.role}</td>
                    <td>{parts.team}</td>
                    <td>{shift(row.startsAt, row.endsAt)}</td>
                    <td>{parts.station}</td>
                  </tr>
                );
              })}
              {board.staffNeeds.map((row) => (
                <tr key={row._id} className="bbs-open">
                  <td>Still needed</td>
                  <td>{row.role ?? ""}</td>
                  <td />
                  <td>{shift(row.startsAt, row.endsAt)}</td>
                  <td>{row.description ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {timeline.length ? (
        <Section title="Timeline">
          <table className="bbs-table bbs-timeline">
            <thead>
              <tr>
                <th>Time</th>
                <th>Task</th>
                <th>Cat</th>
                <th>Notes</th>
                <th>Team</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((row) => {
                const info =
                  String(row.category ?? "").toLowerCase() === "info";
                const teams = row.assigneeTeams ?? [];
                const people = (row.assigneePersonIds ?? [])
                  .map((id) => {
                    const person = board.people.get(id);
                    return [person?.givenName, person?.familyName]
                      .filter(Boolean)
                      .join(" ");
                  })
                  .filter(Boolean);
                return (
                  <tr
                    key={row._id}
                    className={info ? "bbs-info" : ""}
                    data-team={info ? undefined : teamTone(teams) || undefined}
                  >
                    <td className="bbs-time">
                      {row.startsAt != null ? formatTime(row.startsAt) : ""}
                    </td>
                    <td className="bbs-task">{row.name ?? "Task"}</td>
                    <td>
                      {row.category ? (
                        <span
                          className="bbs-cat"
                          data-cat={String(row.category).toLowerCase()}
                        >
                          {words(row.category)}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {[row.notes, row.siteNotes].filter(Boolean).join(" · ")}
                    </td>
                    <td>{teams.join("+")}</td>
                    <td>
                      {people.length
                        ? people.join(", ")
                        : (row.responsibleParty ?? "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {untimedCrewSteps > 0 ? (
            <p className="bbs-hint">
              {untimedCrewSteps} crew steps have no time yet: set the travel,
              load and setup minutes on the event&apos;s Timeline tab and their
              times fill in here.{" "}
              <Link to={`/events/${event._id}?tab=timeline`}>
                Open timeline
              </Link>
            </p>
          ) : null}
        </Section>
      ) : null}

      {trucks.length || board.deliveries.length || packs.length ? (
        <Section title="Trucks, Deliveries & Packing">
          {trucks.length ? (
            <table className="bbs-table">
              <thead>
                <tr>
                  <th>Truck</th>
                  <th>Trailer</th>
                  <th>Driver</th>
                  <th>Riders</th>
                  <th>Loaded</th>
                  <th>Loads at</th>
                </tr>
              </thead>
              <tbody>
                {trucks.map((rig) => (
                  <tr key={rig._id}>
                    <td className="bbs-task">{rig.vehicleName ?? "Truck"}</td>
                    <td>{rig.trailerName ?? "—"}</td>
                    <td>{personName(rig.driverId) || "Not set"}</td>
                    <td>{rig.riderCount}</td>
                    <td>
                      {rig.loadedLineCount} lines
                      {rig.preloadedAt ? " · loaded" : ""}
                    </td>
                    <td>{rig.loadingZone ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {board.deliveries.length ? (
            <table className="bbs-table">
              <thead>
                <tr>
                  <th>Delivery window</th>
                  <th>Destination</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {board.deliveries.map((row) => (
                  <tr key={row._id}>
                    <td className="bbs-time">
                      {shift(row.windowStartsAt, row.windowEndsAt)}
                    </td>
                    <td>{row.destination ?? ""}</td>
                    <td>{personName(row.driverId) || "Not set"}</td>
                    <td>
                      {[
                        briefing.vehicles.find(
                          (item) => item._id === row.vehicleId,
                        )?.make,
                        briefing.vehicles.find(
                          (item) => item._id === row.vehicleId,
                        )?.model,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </td>
                    <td>{words(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {packs.map((pack) => (
            <p key={pack.id} className="bbs-para">
              <b>{pack.name}:</b> {words(pack.status)} · {pack.packed} of{" "}
              {pack.total} lines packed
            </p>
          ))}
        </Section>
      ) : null}

      {readiness ? (
        <p className="bbs-readiness" data-ready={readiness.ready || undefined}>
          {readiness.text}
        </p>
      ) : null}

      {rentals.length || reference.some(([, text]) => text) ? (
        <Section title="Setup & Reference Notes">
          {rentals.length ? (
            <div className="bbs-ref">
              <h4>Rental / Equipment</h4>
              <table className="bbs-table bbs-plain">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Vendor</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {rentals.map((row) => (
                    <tr key={row.key}>
                      <td>{row.item}</td>
                      <td>{row.vendor}</td>
                      <td>{row.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {reference
            .filter(([, text]) => text)
            .map(([label, text]) => (
              <div key={label} className="bbs-ref">
                <h4>{label}</h4>
                {text.split("\n").map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            ))}
        </Section>
      ) : null}
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bbs-section">
      <h2 className="bbs-kicker">{title}</h2>
      {children}
    </section>
  );
}

function Column({
  title,
  rows,
  event,
}: {
  title: string;
  rows: ReadonlyArray<readonly [string, string]>;
  event: Board["event"];
}) {
  return (
    <div>
      <h3 className="bbs-resp-head">{title}</h3>
      {rows.map(([label, key]) => (
        <div key={key} className="bbs-resp-row">
          <span>{label}</span>
          <AnswerView
            answer={readAnswer(
              (event as unknown as Record<string, string | null>)[key],
            )}
          />
        </div>
      ))}
    </div>
  );
}

function AnswerView({ answer }: { answer: Answer }) {
  if (answer.kind === "none") return <span className="bbs-none">—</span>;
  if (answer.kind === "no") return <span className="bbs-no">N</span>;
  if (answer.kind === "note")
    return <em className="bbs-note">{answer.text}</em>;
  return (
    <span className="bbs-answer">
      <span className={`bbs-chip${answer.muted ? " bbs-chip-muted" : ""}`}>
        {answer.text}
      </span>
      {answer.note ? <em className="bbs-note">&gt; {answer.note}</em> : null}
    </span>
  );
}

/** A Final Lock answer as the few words the board prints. */
function finalLockText(value: FinalLockValue): string {
  switch (value.type) {
    case "text":
      return value.text;
    case "choice":
      return value.choice;
    case "yes_no":
      return value.yes ? "Y" : "N";
    case "count":
      return String(value.count);
    case "list":
      return value.items.join("; ");
    case "record":
      return Object.values(value.fields)
        .filter((part) => part != null && part !== "")
        .join(" · ");
    default:
      return "";
  }
}
