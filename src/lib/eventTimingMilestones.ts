/** Labels and projections only. Manifest Event computeds own all timing math. */
export const EVENT_TIMING_MILESTONES = [
  {
    key: "staff_on",
    name: "Staff on / Load at shop",
    category: "staff_arrival",
    start: "timingStaffOnAt",
    end: "timingDepartShopAt",
    aliases: ["Staff on / Load at shop", "Staff ON"],
  },
  {
    key: "shop_departure",
    name: "Depart shop",
    category: "load_in",
    start: "timingDepartShopAt",
    end: "timingOnsiteAt",
    aliases: ["Depart shop", "Departure from shop"],
  },
  {
    key: "onsite_arrival",
    name: "Arrive onsite / Setup",
    category: "setup",
    start: "timingOnsiteAt",
    end: "serviceStartsAt",
    aliases: ["Arrive onsite / Setup", "Staff arrival onsite"],
  },
  {
    key: "service",
    name: "Service starts",
    category: "service",
    start: "serviceStartsAt",
    end: null,
    aliases: ["Service starts", "Buffet Open"],
  },
  {
    key: "cleanup",
    name: "Cleanup & reload",
    category: "breakdown",
    start: "endsAt",
    end: "timingDepartVenueAt",
    aliases: ["Cleanup & reload"],
  },
  {
    key: "venue_departure",
    name: "Depart venue",
    category: "load_out",
    start: "timingDepartVenueAt",
    end: "timingReturnShopAt",
    aliases: ["Depart venue"],
  },
  {
    key: "shop_return",
    name: "Return to shop / Unload",
    category: "load_out",
    start: "timingReturnShopAt",
    end: "timingStaffOffAt",
    aliases: ["Return to shop / Unload"],
  },
  {
    key: "staff_off",
    name: "Staff off",
    category: "staff_arrival",
    start: "timingStaffOffAt",
    end: null,
    aliases: ["Staff off"],
  },
] as const;

export type EventTimingMilestone =
  (typeof EVENT_TIMING_MILESTONES)[number]["key"];

export function eventTimingWindows(event: Record<string, unknown>) {
  const time = (key: string | null): number | null =>
    key != null && typeof event[key] === "number" && Number.isFinite(event[key])
      ? (event[key] as number)
      : null;
  return EVENT_TIMING_MILESTONES.map((milestone) => ({
    ...milestone,
    startsAt: time(milestone.start),
    endsAt: time(milestone.end),
  }));
}

export function matchesTimingMilestone(
  row: { name: string; category?: string | null },
  milestone: (typeof EVENT_TIMING_MILESTONES)[number],
) {
  return (
    row.category === milestone.category &&
    milestone.aliases.some(
      (name) => name.toLowerCase() === row.name.trim().toLowerCase(),
    )
  );
}
