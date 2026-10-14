import type { ReactNode } from "react";
import type { EventDayBriefing } from "../../lib/eventDayBriefing";
import { formatTime } from "../../lib/format";
import { displayEventMenuNotes } from "../events/eventMenuLineFields";
import type { buildBoard } from "./BattleBoardPage";
import {
  boardDate,
  courseTitle,
  plates,
  readAnswer,
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
}: {
  briefing: EventDayBriefing;
  board: Board;
  companyName: string;
}) {
  const { event } = board;
  const ops = splitOperational(event.operationalRequirements);
  const service = splitService(event.serviceRequirements);
  const cold = plates(event.buffetColdPlates);
  const hot = plates(event.buffetHotPlates);
  const dishName = (id: string | null) =>
    briefing.dishes.find((dish) => dish._id === id)?.name ?? "Dish";

  const layoutLines: [string, string][] = [
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
    [
      "Additional Tasks / Responsibilities",
      [ops.also, ops.other].filter(Boolean).join("\n"),
    ],
  ];

  const timeline = board.timeline;

  return (
    <article className="bbs">
      <header className="bbs-title">
        <strong>{companyName} — FOH Battle Board</strong>
        <span> · {event.title ?? "Event"}</span>
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
      {service.overview ? (
        <p className="bbs-summary">{service.overview}</p>
      ) : null}

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
                      <span>{dishName(row.dishId)}</span>
                      {note ? <em>{note}</em> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
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
        </Section>
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
