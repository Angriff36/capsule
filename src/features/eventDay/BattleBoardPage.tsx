import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  EventDayActivity,
  EventDayPerson,
} from "../../lib/eventDayBriefing";
import { useEventDayBriefing } from "../../lib/eventDayBriefing";
import type { EventDayBriefing } from "../../lib/eventDayBriefing";
import { formatCount, formatDate, formatTime } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import { compareActivities } from "../events/EventTimelinePanel";
import { displayEventMenuNotes } from "../events/eventMenuLineFields";
import { formatAssigneeLabel } from "../events/timelineAssigneeOptions";
import {
  deriveDishAllergens,
  dishAllergenClaim,
  type DishAllergenReport,
} from "../kitchen/dishAllergens";
import { CULINARY_ALLERGENS } from "../kitchen/CulinaryAllergenVocabulary";
import "./BattleBoardPage.css";
import "./EventDay.css";
import { EventDayNav } from "./EventDayNav";
import { categoryLabel } from "./runOfShowModel";

/**
 * Battle board — the day-of one-pager, built automatically from the event
 * plan (issue: auto battle board). Everything the Mangia PDF carried, read
 * straight from the briefing seam: layout, menu with recipe-derived
 * allergens, staff, run of show, equipment, deliveries. Print / Save PDF
 * puts it on paper; the document is the only thing that prints.
 */

function personLabel(person: EventDayPerson | undefined): string {
  if (!person) return "Staff";
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ") || "Staff"
  );
}

function windowLine(
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  if (start == null) return "—";
  return end != null
    ? `${formatTime(start)}–${formatTime(end)}`
    : formatTime(start);
}

function allergenLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function buildBoard(briefing: EventDayBriefing) {
  const { event, venue } = briefing;
  const people = new Map(briefing.people.map((person) => [person._id, person]));
  const whoLabel = (row: EventDayActivity) =>
    formatAssigneeLabel({
      teams: row.assigneeTeams ?? [],
      personNames: (row.assigneePersonIds ?? []).map((personId) =>
        personLabel(people.get(personId)),
      ),
      fallback: row.responsibleParty,
    });

  const layout = [...briefing.layoutSections]
    .filter((row) => row.addedAt != null && row.deletedAt == null)
    .sort(
      (left, right) =>
        Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0),
    );

  const venueTraits = venue
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

  const venueNotes = venue
    ? (
        [
          ["Load-in", venue.loadInInstructions],
          ["Access", venue.accessNotes],
          ["Catering notes", venue.cateringNotes],
          ["Restrictions", venue.restrictions],
        ] as const
      ).filter(([, text]) => String(text ?? "").trim().length > 0)
    : [];

  const menuRows = briefing.eventDishes.filter(
    (row) => row.removedAt == null && row.deletedAt == null,
  );
  const courses = new Map<string, typeof menuRows>();
  for (const row of menuRows) {
    const course = String(row.course ?? "").trim() || "Menu";
    courses.set(course, [...(courses.get(course) ?? []), row]);
  }
  const recipe = {
    dishIngredients: briefing.dishIngredients,
    dishComponents: briefing.dishComponents,
    componentIngredients: briefing.componentIngredients,
    ingredients: [],
  };
  const reports = new Map<string, DishAllergenReport>();
  for (const row of menuRows) {
    const dish = briefing.dishes.find((item) => item._id === row.dishId);
    if (dish && !reports.has(String(dish._id)))
      reports.set(String(dish._id), deriveDishAllergens(dish, recipe));
  }
  const menuAllergens = CULINARY_ALLERGENS.filter((allergen) =>
    [...reports.values()].some((report) =>
      report.codes.includes(allergen.code),
    ),
  );

  const timeline = briefing.activities
    .filter((row) => row.scheduledAt != null && row.deletedAt == null)
    .sort(compareActivities);

  const staff = [...briefing.assignments]
    .filter(
      (row) => String(row.status) !== "unassigned" && row.deletedAt == null,
    )
    .sort(
      (left, right) => Number(left.startsAt ?? 0) - Number(right.startsAt ?? 0),
    );
  const staffNeeds = briefing.staffNeeds.filter(
    (row) =>
      ["open", "claimed"].includes(String(row.status)) && row.deletedAt == null,
  );

  const equipment = briefing.equipmentReservations
    .filter(
      (row) => String(row.status) !== "cancelled" && row.deletedAt == null,
    )
    .sort(
      (left, right) => Number(left.startsAt ?? 0) - Number(right.startsAt ?? 0),
    );
  const equipmentName = (equipmentId: string | null) =>
    briefing.equipments.find((item) => item._id === equipmentId)?.name ??
    "Equipment";

  const packLists = briefing.packLists.filter(
    (row) => String(row.status) !== "cancelled" && row.deletedAt == null,
  );

  const deliveries = briefing.deliveries
    .filter(
      (row) => String(row.status) !== "cancelled" && row.deletedAt == null,
    )
    .sort(
      (left, right) =>
        Number(left.windowStartsAt ?? 0) - Number(right.windowStartsAt ?? 0),
    );

  const daySheet: [string, string][] = (
    [
      ["Bar service", event.barService],
      ["Cocktail hour food", event.cocktailHourFood],
      ["Dessert", event.dessertService],
      ["Bussing", event.bussing],
      ["Place settings", event.placeSettings],
      ["Passed apps", event.passedApps],
      ["Stationary apps", event.stationaryApps],
      ["Beverages on menu", event.beveragesOnMenu],
      ["Tableside water", event.tablesideWater],
      ["Our disposables", event.mangiaDisposables],
      ["Event rentals", event.eventRentals],
      ["Scullery", event.scullery],
      ["Power onsite", event.powerOnsite],
      ["Water onsite", event.waterOnsite],
    ] as const
  ).filter(([, value]) => String(value ?? "").trim().length > 0) as [
    string,
    string,
  ][];

  return {
    event,
    venue,
    layout,
    daySheet,
    buffetCold: String(event.buffetColdPlates ?? "").trim(),
    buffetHot: String(event.buffetHotPlates ?? "").trim(),
    venueTraits,
    venueNotes,
    courses,
    reports,
    menuAllergens,
    timeline,
    whoLabel,
    staff,
    staffNeeds,
    equipment,
    equipmentName,
    packLists,
    deliveries,
    people,
  };
}

export function BattleBoardPage() {
  const { id } = useParams();
  const briefing = useEventDayBriefing(id);
  const printedAt = useMemo(() => Date.now(), []);
  const board = useMemo(
    () => (briefing ? buildBoard(briefing) : null),
    [briefing],
  );

  if (briefing === undefined)
    return (
      <div className="evd">
        <div className="evd-frame">
          <p className="evd-empty">Lighting the estate…</p>
        </div>
      </div>
    );
  if (briefing === null)
    return (
      <div className="evd">
        <div className="evd-frame">
          <p className="evd-empty">
            This event is unavailable —{" "}
            <Link className="evd-open-link" to="/event-day">
              choose an event
            </Link>
          </p>
        </div>
      </div>
    );
  if (board == null) return null; // unreachable: board is built from briefing

  const { event, venue } = board;
  const startsAt = typeof event.startsAt === "number" ? event.startsAt : null;
  const guests =
    event.expectedHeadcount != null
      ? `${formatCount(Number(event.expectedHeadcount))} final`
      : null;

  return (
    <div className="evd">
      <div className="evd-frame">
        <div className="bbd-bar bbd-no-print">
          <Link
            className="evd-run-back"
            to={`/event-day/${event._id}`}
            aria-label="Back to event map"
          >
            ← Map
          </Link>
          <span className="bbd-bar-title">Battle board</span>
          <button
            type="button"
            className="evd-run-arm"
            onClick={() => window.print()}
          >
            Print / Save PDF
          </button>
        </div>

        <article className="bbd-doc">
          <header>
            <p className="bbd-brand">Battle board</p>
            <h1 className="bbd-title">{String(event.title ?? "Event")}</h1>
            <dl className="bbd-meta">
              <div>
                <dt>Date</dt>
                <dd>
                  {startsAt != null
                    ? `${formatDate(startsAt)} · ${formatTime(startsAt)}`
                    : "Unscheduled"}
                </dd>
              </div>
              <div>
                <dt>Guests</dt>
                <dd>{guests ?? "—"}</dd>
              </div>
              <div>
                <dt>Style</dt>
                <dd>{event.serviceStyleName ?? event.eventType ?? "—"}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{venue?.name ?? event.venueName ?? "—"}</dd>
              </div>
            </dl>
          </header>

          {board.daySheet.length > 0 ? (
            <section className="bbd-section">
              <h2 className="bbd-kicker">Responsibilities</h2>
              <div className="bbd-sheet">
                {board.daySheet.map(([label, value]) => (
                  <div className="bbd-sheet-row" key={label}>
                    <span className="bbd-sheet-label">{label}</span>
                    <span className="bbd-sheet-value">{value}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {board.buffetCold.length > 0 || board.buffetHot.length > 0 ? (
            <section className="bbd-section">
              <h2 className="bbd-kicker">Buffet layout</h2>
              <p className="bbd-note">
                {[
                  board.buffetCold.length > 0
                    ? `COLD: ${board.buffetCold}`
                    : null,
                  board.buffetHot.length > 0 ? `HOT: ${board.buffetHot}` : null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </p>
            </section>
          ) : null}

          {board.layout.length > 0 ||
          board.venueTraits.length > 0 ||
          board.venueNotes.length > 0 ? (
            <section className="bbd-section">
              <h2 className="bbd-kicker">Layout &amp; locations</h2>
              {board.layout.map((row) => (
                <div key={row._id}>
                  <p className="bbd-note-label">
                    {String(row.type ?? "Section")}
                  </p>
                  {String(row.instructions ?? "").trim().length > 0 ? (
                    <p className="bbd-note">{String(row.instructions)}</p>
                  ) : null}
                </div>
              ))}
              {board.venueTraits.length > 0 ? (
                <p className="bbd-note">
                  On site: {board.venueTraits.join(" · ")}
                </p>
              ) : null}
              {board.venueNotes.map(([label, text]) => (
                <div key={label}>
                  <p className="bbd-note-label">{label}</p>
                  <p className="bbd-note">{String(text)}</p>
                </div>
              ))}
            </section>
          ) : null}

          {board.courses.size > 0 ? (
            <section className="bbd-section">
              <h2 className="bbd-kicker">Menu</h2>
              {board.menuAllergens.length > 0 ? (
                <p className="bbd-banner">
                  Menu contains{" "}
                  {board.menuAllergens
                    .map((allergen) => allergen.label)
                    .join(" · ")}
                </p>
              ) : null}
              {[...board.courses.entries()].map(([course, list]) => (
                <div key={course}>
                  <p className="bbd-note-label">{course}</p>
                  {list.map((row) => {
                    const dish = briefing.dishes.find(
                      (item) => item._id === row.dishId,
                    );
                    const report = dish
                      ? (board.reports.get(String(dish._id)) ?? null)
                      : null;
                    const claim = dishAllergenClaim(report);
                    const instructions = displayEventMenuNotes(
                      row.specialInstructions,
                    );
                    return (
                      <div className="bbd-row" key={row._id}>
                        <span className="bbd-main">
                          <span className="bbd-task">
                            {dish?.name ?? "Dish"}
                            {row.quantityServings != null
                              ? ` · ${row.quantityServings} srv`
                              : ""}
                          </span>
                          {claim === "contains" && report ? (
                            <span className="bbd-sub">
                              Contains{" "}
                              {report.codes.map(allergenLabel).join(", ")}
                            </span>
                          ) : null}
                          {instructions ? (
                            <span className="bbd-sub">{instructions}</span>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          ) : null}

          {board.timeline.length > 0 ? (
            <section className="bbd-section">
              <h2 className="bbd-kicker">Run of show</h2>
              {board.timeline.map((row) => {
                const done = row.completedAt != null;
                const notes = [row.notes, row.siteNotes]
                  .map((part) => String(part ?? "").trim())
                  .filter(Boolean)
                  .join(" · ");
                const who = board.whoLabel(row);
                const category = categoryLabel(row.category);
                return (
                  <div
                    className={`bbd-row${done ? " bbd-row-done" : ""}`}
                    key={row._id}
                  >
                    <span className="bbd-time">
                      {row.startsAt != null
                        ? formatTime(row.startsAt)
                        : formatTime(row.scheduledAt)}
                    </span>
                    <span className="bbd-main">
                      <span className="bbd-task">
                        {String(row.name ?? "Task")}
                        {category ? (
                          <span className="bbd-chip">{category}</span>
                        ) : null}
                      </span>
                      {notes ? <span className="bbd-sub">{notes}</span> : null}
                      {who.trim().length > 0 ? (
                        <span className="bbd-who">{who}</span>
                      ) : null}
                    </span>
                    {done ? (
                      <span className="bbd-done-flag">
                        ✓ {formatTime(row.completedAt)}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}

          {board.staff.length > 0 || board.staffNeeds.length > 0 ? (
            <section className="bbd-section">
              <h2 className="bbd-kicker">Staff roster</h2>
              <div className="bbd-grid">
                <span className="bbd-grid-head">Name</span>
                <span className="bbd-grid-head">Role</span>
                <span className="bbd-grid-head">Shift</span>
                <span className="bbd-grid-head">Status</span>
                {board.staff.map((row) => (
                  <span className="bbd-grid-row bbd-grid" key={row._id}>
                    <span>
                      {personLabel(board.people.get(row.personId ?? ""))}
                    </span>
                    <span>{String(row.role ?? "")}</span>
                    <span>{windowLine(row.startsAt, row.endsAt)}</span>
                    <span>{formatStatusLabel(String(row.status ?? ""))}</span>
                  </span>
                ))}
                {board.staffNeeds.map((row) => (
                  <span className="bbd-grid-row bbd-grid" key={row._id}>
                    <span>— unfilled —</span>
                    <span>{String(row.role ?? "")}</span>
                    <span>{windowLine(row.startsAt, row.endsAt)}</span>
                    <span>{formatStatusLabel(String(row.status ?? ""))}</span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {board.equipment.length > 0 || board.packLists.length > 0 ? (
            <section className="bbd-section">
              <h2 className="bbd-kicker">Equipment &amp; pack</h2>
              {board.equipment.map((row) => (
                <div className="bbd-row" key={row._id}>
                  <span className="bbd-main">
                    <span className="bbd-task">
                      {board.equipmentName(row.equipmentId)}
                      {row.quantity != null ? ` · Qty ${row.quantity}` : ""}
                    </span>
                    <span className="bbd-sub">
                      {[
                        windowLine(row.startsAt, row.endsAt),
                        formatStatusLabel(String(row.status ?? "")),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
              ))}
              {board.packLists.map((list) => {
                const items = briefing.packListItems.filter(
                  (item) =>
                    item.packListId === list._id && item.deletedAt == null,
                );
                return (
                  <div key={list._id}>
                    <p className="bbd-note-label">
                      {String(list.name ?? "Pack list")} ·{" "}
                      {formatStatusLabel(String(list.status ?? ""))}
                    </p>
                    {items.map((item) => (
                      <p className="bbd-note" key={item._id}>
                        {String(item.description ?? "Item")}
                        {item.requiredQuantity != null
                          ? ` — ${item.requiredQuantity} ${item.unit ?? ""}`
                          : ""}
                        {String(item.status) === "missing" ? " (missing)" : ""}
                        {String(item.status) === "packed" ? " (packed)" : ""}
                      </p>
                    ))}
                  </div>
                );
              })}
            </section>
          ) : null}

          {board.deliveries.length > 0 ? (
            <section className="bbd-section">
              <h2 className="bbd-kicker">Deliveries &amp; vehicles</h2>
              {board.deliveries.map((row) => {
                const vehicle = briefing.vehicles.find(
                  (item) => item._id === row.vehicleId,
                );
                const driver = personLabel(
                  board.people.get(row.driverId ?? ""),
                );
                return (
                  <div className="bbd-row" key={row._id}>
                    <span className="bbd-main">
                      <span className="bbd-task">
                        {String(row.destination ?? "Delivery")}
                      </span>
                      <span className="bbd-sub">
                        {[
                          windowLine(row.windowStartsAt, row.windowEndsAt),
                          driver,
                          vehicle
                            ? [vehicle.make, vehicle.model]
                                .filter(Boolean)
                                .join(" ") || "Vehicle"
                            : null,
                          formatStatusLabel(String(row.status ?? "")),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </div>
                );
              })}
            </section>
          ) : null}

          <footer className="bbd-foot">
            Built from the event plan · Capsule battle board · printed{" "}
            {formatDate(printedAt)} {formatTime(printedAt)}
          </footer>
        </article>

        <EventDayNav eventId={String(event._id)} active="board" />
      </div>
    </div>
  );
}
