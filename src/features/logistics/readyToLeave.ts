import {
  latestTripCheck,
  tripCheckFailures,
  type TripCheckRow,
} from "./tripCheck";

/**
 * Ready to leave: everything still open before an event's trucks pull out,
 * read from the real records (pack lines, trucks, drivers, trip checks,
 * crew). Pure. It never stops anyone: "fix first" items are the ones a lead
 * would not leave without, "worth a look" items are the rest. A person can
 * still send the truck and say why.
 */

export type LeaveSeverity = "fix" | "look";

export type LeaveItemKind =
  | "must_have_short"
  | "must_have_missing"
  | "must_have_left_off"
  | "lines_short"
  | "lines_missing"
  | "no_pack_list"
  | "list_not_loaded"
  | "no_truck"
  | "no_driver"
  | "trip_check_missing"
  | "trip_check_unsafe"
  | "positions_open"
  | "crew_unconfirmed"
  | "no_crew"
  | "no_owner";

export type LeaveItem = {
  /** Stable for one event: the kind plus the record it is about. */
  key: string;
  kind: LeaveItemKind;
  severity: LeaveSeverity;
  text: string;
  /** Where to fix it. */
  to: string;
};

export type LeaveEvent = {
  _id: string;
  assignedToId?: string | null;
};

export type LeavePackList = {
  _id: string;
  eventId: string;
  name: string;
  status: string;
  deletedAt?: number | null;
};

export type LeavePackLine = {
  _id: string;
  packListId: string;
  description: string;
  status: string;
  requiredQuantity: number;
  packedQuantity: number;
  requiredCapability?: boolean | null;
  listedAt?: number | null;
  retiredAt?: number | null;
  excludedAt?: number | null;
  replacementDescription?: string | null;
  coveredBy?: string | null;
  sentInstead?: string | null;
  deletedAt?: number | null;
};

export type LeaveRig = {
  _id: string;
  activeEventId?: string | null;
  vehicleId?: string | null;
  trailerId?: string | null;
  driverId?: string | null;
  vendorName?: string | null;
  deletedAt?: number | null;
};

export type LeaveAssignment = {
  eventId: string;
  status: string;
  deletedAt?: number | null;
};

export type LeaveStaffNeed = {
  eventId: string;
  status: string;
  deletedAt?: number | null;
};

export type LeaveInput = {
  event: LeaveEvent;
  packLists: readonly LeavePackList[];
  packLines: readonly LeavePackLine[];
  rigs: readonly LeaveRig[];
  /** Printed name of a rig, by its id. */
  rigLabel: (rigId: string) => string;
  tripChecks: readonly TripCheckRow[];
  assignments: readonly LeaveAssignment[];
  staffNeeds: readonly LeaveStaffNeed[];
};

export type LeaveSummary = {
  items: LeaveItem[];
  fixCount: number;
  lookCount: number;
  /** 0..100 of the amount to pack that is packed; null with nothing to pack. */
  packedPercent: number | null;
  /** True when every live pack list is loaded or gone out. */
  loaded: boolean;
  /** True when every live pack list has gone out. */
  left: boolean;
  /** One line: the first thing to do. */
  nextStep: string;
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const amount = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export function readyToLeave(input: LeaveInput): LeaveSummary {
  const eventId = input.event._id;
  const items: LeaveItem[] = [];
  const add = (
    kind: LeaveItemKind,
    severity: LeaveSeverity,
    subject: string,
    text: string,
    to: string,
  ) => items.push({ key: `${kind}:${subject}`, kind, severity, text, to });

  // Pack lists and their lines.
  const lists = input.packLists.filter(
    (row) =>
      row.deletedAt == null &&
      row.eventId === eventId &&
      row.status !== "cancelled",
  );
  const listIds = new Set(lists.map((row) => row._id));
  const lines = input.packLines.filter(
    (row) =>
      row.deletedAt == null &&
      row.listedAt != null &&
      row.retiredAt == null &&
      listIds.has(row.packListId),
  );
  const packTo = (listId: string) => `/logistics/packs/${listId}`;

  let toPack = 0;
  let packed = 0;
  let shortCount = 0;
  let missingCount = 0;
  let firstShortList: string | null = null;
  for (const line of lines) {
    const mustHave = line.requiredCapability === true;
    if (line.excludedAt != null) {
      const covered =
        (line.replacementDescription ?? "").trim() !== "" ||
        line.coveredBy != null;
      if (mustHave && !covered)
        add(
          "must_have_left_off",
          "fix",
          line._id,
          `Must-have item left off with nothing in its place: ${line.description}`,
          packTo(line.packListId),
        );
      continue;
    }
    const required = Number(line.requiredQuantity) || 0;
    const done = Math.min(Number(line.packedQuantity) || 0, required);
    toPack += required;
    packed += done;
    if (line.status === "missing") {
      const stand = (line.sentInstead ?? "").trim();
      if (mustHave && stand === "")
        add(
          "must_have_missing",
          "fix",
          line._id,
          `Must-have item marked missing: ${line.description}`,
          packTo(line.packListId),
        );
      else missingCount += 1;
      firstShortList ??= line.packListId;
      continue;
    }
    if (done < required) {
      if (mustHave)
        add(
          "must_have_short",
          "fix",
          line._id,
          `Must-have item not fully packed: ${line.description} (${amount(done)} of ${amount(required)})`,
          packTo(line.packListId),
        );
      else {
        shortCount += 1;
        firstShortList ??= line.packListId;
      }
    }
  }
  if (shortCount > 0)
    add(
      "lines_short",
      "look",
      eventId,
      `${plural(shortCount, "pack line is", "pack lines are")} not fully packed`,
      packTo(firstShortList ?? lists[0]!._id),
    );
  if (missingCount > 0)
    add(
      "lines_missing",
      "look",
      eventId,
      `${plural(missingCount, "pack line is", "pack lines are")} marked missing`,
      packTo(firstShortList ?? lists[0]!._id),
    );
  if (lists.length === 0)
    add(
      "no_pack_list",
      "look",
      eventId,
      "No pack list for this event",
      "/logistics/packs",
    );
  for (const list of lists) {
    if (list.status === "loaded" || list.status === "dispatched") continue;
    add(
      "list_not_loaded",
      "look",
      list._id,
      list.status === "packed"
        ? `${list.name || "Pack list"} is packed but not loaded`
        : `${list.name || "Pack list"} is still being packed`,
      packTo(list._id),
    );
  }

  // Trucks, drivers and trip checks. A vendor drop is the vendor's own truck.
  const rigs = input.rigs.filter(
    (row) => row.deletedAt == null && row.activeEventId === eventId,
  );
  const ours = rigs.filter(
    (row) => row.vehicleId != null || row.trailerId != null,
  );
  const tracker = "/events/tracker";
  const eventTimeline = `/events/${eventId}?tab=timeline`;
  if (rigs.length === 0)
    add("no_truck", "look", eventId, "No truck on this event", tracker);
  for (const rig of ours) {
    const label = input.rigLabel(rig._id);
    if (rig.vehicleId != null && rig.driverId == null)
      add("no_driver", "fix", rig._id, `No driver for ${label}`, tracker);
    if (rig.vehicleId == null) continue;
    const check = latestTripCheck(input.tripChecks, rig._id, "before_leaving");
    if (!check)
      add(
        "trip_check_missing",
        "look",
        rig._id,
        `${label} has no trip check before leaving`,
        eventTimeline,
      );
    else {
      const failed = tripCheckFailures(check);
      if (failed.length > 0)
        add(
          "trip_check_unsafe",
          "fix",
          rig._id,
          `${label} trip check says not safe: ${failed.join(", ")}`,
          eventTimeline,
        );
    }
  }

  // Crew.
  const staffing = `/events/${eventId}?tab=staffing`;
  const crew = input.assignments.filter(
    (row) =>
      row.deletedAt == null &&
      row.eventId === eventId &&
      row.status !== "unassigned" &&
      row.status !== "no_show",
  );
  const open = input.staffNeeds.filter(
    (row) =>
      row.deletedAt == null &&
      row.eventId === eventId &&
      (row.status === "open" || row.status === "claimed"),
  );
  if (open.length > 0)
    add(
      "positions_open",
      "fix",
      eventId,
      `${plural(open.length, "crew position is", "crew positions are")} not filled`,
      staffing,
    );
  const unconfirmed = crew.filter((row) => row.status === "assigned");
  if (unconfirmed.length > 0)
    add(
      "crew_unconfirmed",
      "look",
      eventId,
      `${unconfirmed.length} of ${crew.length} crew have not confirmed`,
      staffing,
    );
  if (crew.length === 0 && open.length === 0)
    add("no_crew", "look", eventId, "No crew on this event", staffing);
  if (input.event.assignedToId == null)
    add(
      "no_owner",
      "look",
      eventId,
      "No owner on this event",
      `/events/${eventId}`,
    );

  const rank = { fix: 0, look: 1 } as const;
  items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const fixCount = items.filter((row) => row.severity === "fix").length;
  const lookCount = items.length - fixCount;
  const loaded =
    lists.length > 0 &&
    lists.every(
      (row) => row.status === "loaded" || row.status === "dispatched",
    );
  const left =
    lists.length > 0 && lists.every((row) => row.status === "dispatched");

  return {
    items,
    fixCount,
    lookCount,
    packedPercent: toPack > 0 ? Math.round((packed / toPack) * 100) : null,
    loaded,
    left,
    nextStep: left
      ? "Left for the event"
      : items[0]
        ? items[0].text
        : loaded
          ? "Ready to leave"
          : "Load the truck",
  };
}
