import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  EventDayActivity,
  EventDayPerson,
} from "../../lib/eventDayBriefing";
import { useEventDayBriefing } from "../../lib/eventDayBriefing";
import type { EventDayBriefing } from "../../lib/eventDayBriefing";
import { compareActivities } from "../events/EventTimelinePanel";
import { formatAssigneeLabel } from "../events/timelineAssigneeOptions";
import {
  deriveDishAllergens,
  type DishAllergenReport,
} from "../kitchen/dishAllergens";
import { CULINARY_ALLERGENS } from "../kitchen/CulinaryAllergenVocabulary";
import "./BattleBoardPage.css";
import { BattleBoardSheet } from "./BattleBoardSheet";
import { useTenantBranding } from "../admin/tenantBranding";
import type { Id } from "../../lib/api";
import { useEventTimingPlan } from "../../lib/operational-transactions";
import "./EventDay.css";
import { EventDayNav } from "./EventDayNav";

/**
 * Battle board — the day-of one-pager, built automatically from the event
 * plan and laid out like the owner's Mangia battle board PDF
 * (BattleBoardSheet). Print / Save PDF puts only the sheet on paper.
 */

function personLabel(person: EventDayPerson | undefined): string {
  if (!person) return "Staff";
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ") || "Staff"
  );
}

export function buildBoard(briefing: EventDayBriefing) {
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
    components: briefing.components ?? [],
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
  const { branding } = useTenantBranding();
  const plan = useEventTimingPlan(id ? (id as Id<"events">) : null);
  const board = useMemo(
    () => (briefing ? buildBoard(briefing) : null),
    [briefing],
  );

  if (briefing === undefined)
    return (
      <div className="eday">
        <div className="eday-frame">
          <p className="eday-empty">Lighting the estate…</p>
        </div>
      </div>
    );
  if (briefing === null)
    return (
      <div className="eday">
        <div className="eday-frame">
          <p className="eday-empty">
            This event is unavailable —{" "}
            <Link className="eday-open-link" to="/event-day">
              choose an event
            </Link>
          </p>
        </div>
      </div>
    );
  if (board == null) return null; // unreachable: board is built from briefing

  const { event } = board;

  return (
    <div className="eday">
      <div className="eday-frame">
        <div className="bbd-bar bbd-no-print">
          <Link
            className="eday-run-back"
            to={`/event-day/${event._id}`}
            aria-label="Back to event map"
          >
            ← Map
          </Link>
          <span className="bbd-bar-title">Battle board</span>
          <button
            type="button"
            className="eday-run-arm"
            onClick={() => window.print()}
          >
            Print / Save PDF
          </button>
        </div>

        <div className="bbd-doc bbs-host">
          <BattleBoardSheet
            briefing={briefing}
            board={board}
            companyName={branding.displayName || "Mangia Catering Co."}
            timing={
              (plan as { event?: Record<string, unknown> } | null | undefined)
                ?.event ?? null
            }
          />
        </div>

        <EventDayNav eventId={String(event._id)} active="board" />
      </div>
    </div>
  );
}
