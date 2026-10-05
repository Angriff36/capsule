import {
  answered,
  hasText,
  notApplicable,
  said,
  source,
  unresolved,
  type Draft,
} from "./answer";
import type { FinalLockInput } from "./types";

const MINUTE = 60_000;
const INDOOR_VENUES = new Set(["banquet_hall", "office", "private_home"]);
/** Words that make an event note about getting in to the venue. */
const LOAD_IN_WORDS =
  /load|unload|dock|entrance|door|elevator|lift|stair|ramp|park|gate|access|back of house/i;

/** Day plan steps in order, with the plain words for a missing one. */
const STEPS = [
  ["staff_on", "No staff-on time: add the load time on the event timing."],
  ["load", "No load time: add the load time on the event timing."],
  ["shop_departure", "No shop departure (NLT): add travel time to the venue."],
  [
    "onsite_arrival",
    "No onsite arrival: add the setup time on the event timing.",
  ],
  ["service", "No serve time: set when service starts."],
  ["cleanup", "No cleanup time: set when the event ends."],
  ["venue_departure", "No venue departure: add the cleanup time."],
  ["shop_return", "No return to the shop: add travel time back."],
  ["unload", "No unload time: add the unload time on the event timing."],
  ["staff_off", "No staff-off time: add the unload time on the event timing."],
] as const;

const after = (base: number | null, minutes: number | null, sign = 1) =>
  base != null && minutes != null ? base + sign * minutes * MINUTE : null;

/** Every step of the day: event timing, replaced by timeline rows. */
export function dayTimes(input: FinalLockInput) {
  const { event } = input;
  const t = event.timing;
  const service = event.serviceStartsAt ?? event.startsAt;
  const onsite = after(service, t.setup, -1);
  const depart = after(onsite, t.outbound, -1);
  const staffOn = after(depart, t.load, -1);
  const departVenue = after(event.endsAt, t.cleanup);
  const back = after(departVenue, t.returnTravel);
  const staffOff = after(back, t.unload);
  const times: Record<string, number | null> = {
    staff_on: staffOn,
    load: staffOn,
    shop_departure: depart,
    onsite_arrival: onsite,
    service,
    cleanup: event.endsAt,
    venue_departure: departVenue,
    shop_return: back,
    unload: back,
    staff_off: staffOff,
  };
  const rows = input.timeline.filter((r) => r.milestone && r.startsAt != null);
  for (const row of rows) times[row.milestone!] = row.startsAt;
  return { times, rows };
}

/** Timeline (spec §14.2 / §8.4) from event timing, timeline rows first. */
export function timelineAnswers(input: FinalLockInput): Record<string, Draft> {
  const { event } = input;
  const t = event.timing;
  const { times, rows } = dayTimes(input);
  const sources = [
    ...source("events", event, "timing"),
    ...rows.flatMap((r) => source("eventTimelineActivities", r)),
  ];
  const missing = STEPS.filter(([key]) => times[key] == null).map(
    ([, words]) => words,
  );
  const order = STEPS.map(([key]) => [key, times[key]] as const).filter(
    (step): step is readonly [(typeof STEPS)[number][0], number] =>
      step[1] != null,
  );
  const backwards = order
    .slice(1)
    .filter(([, at], i) => at < order[i]![1])
    .map(
      ([key]) =>
        `The ${key.replace(/_/g, " ")} time comes before the step it follows.`,
    );
  const out: Record<string, Draft> = {};
  out["timeline.schedule"] =
    missing.length || backwards.length
      ? unresolved(
          [...missing, ...backwards],
          "Fill in the event timing so every step of the day has a time.",
          "timeline.schedule.section-8-4",
          sources,
        )
      : answered(
          { type: "times", times },
          "Every step of the day has a time, in order.",
          "timeline.schedule.section-8-4",
          sources,
        );

  const routeMissing = [
    ...(event.venueAddress?.trim() ? [] : ["No venue address to drive to."]),
    ...(t.outbound != null ? [] : ["No travel time to the venue."]),
  ];
  out["timeline.route"] = routeMissing.length
    ? unresolved(
        routeMissing,
        event.venueAddress?.trim()
          ? "Add the travel time on the event timing."
          : "Add the venue address on the event.",
        "timeline.route.address-and-travel",
        source("events", event, "venueAddress"),
      )
    : answered(
        {
          type: "record",
          fields: { to: event.venueAddress!.trim(), travelMinutes: t.outbound },
        },
        `Drive to ${event.venueAddress!.trim()}, about ${t.outbound} minutes.`,
        "timeline.route.address-and-travel",
        source("events", event, "venueAddress"),
      );
  return out;
}

/** Setup and weather (spec §14.2): setup notes or an exact gap. */
export function setupAnswers(input: FinalLockInput): Record<string, Draft> {
  const { event, venue } = input;
  const text = event.text;
  const out: Record<string, Draft> = {};
  const note = (key: string, field: string, words: string) => {
    out[key] = hasText(text[field])
      ? answered(
          { type: "text", text: text[field]!.trim() },
          `${words}: ${text[field]!.trim()}.`,
          `${key}.from-setup-notes`,
          source("events", event, field),
        )
      : unresolved(
          [`No ${words.toLowerCase()} is recorded.`],
          `Fill in ${words.toLowerCase()} in the setup notes.`,
          `${key}.from-setup-notes`,
          source("events", event, field),
        );
  };
  note("setup.linen_tables", "linenColorTables", "Table linen color");
  note("setup.linen_baskets", "linenColorBaskets", "Basket and tray linen");
  note("setup.diagram", "setupDiagram", "Setup diagram");
  note("setup.servingware_kit", "servingwareKit", "Servingware kit");

  const indoor = venue?.venueType != null && INDOOR_VENUES.has(venue.venueType);
  const weather = (key: string, field: string, words: string) => {
    if (hasText(text[field])) return note(key, field, words);
    out[key] = indoor
      ? notApplicable(
          `${venue!.name} is an indoor venue, so no ${words.toLowerCase()} is needed.`,
          `${key}.indoor-venue`,
          [
            ...source("venues", venue, "venueType"),
            ...source("events", event, field),
          ],
        )
      : unresolved(
          [
            venue?.venueType
              ? `No ${words.toLowerCase()} is recorded for this ${venue.venueType.replace(/_/g, " ")} venue.`
              : `No ${words.toLowerCase()} is recorded and the venue type is not set.`,
          ],
          `Fill in ${words.toLowerCase()} in the setup notes.`,
          `${key}.indoor-venue`,
          [
            ...source("venues", venue, "venueType"),
            ...source("events", event, field),
          ],
        );
  };
  weather("setup.rain_plan", "rainPlan", "Rain plan");
  weather("setup.venue_surface", "venueSurface", "Ground surface");
  weather("setup.tent_flooring", "tentAndFlooring", "Tent, flooring and tarps");
  weather("setup.handwashing", "handwashing", "Handwashing station");
  if (said(text.handwashing).kind === "no" && !indoor)
    out["setup.handwashing"] = unresolved(
      [
        "Handwashing is marked not needed, but the venue is not an indoor venue with sinks.",
      ],
      "Pack a handwashing station or set the venue type.",
      "setup.handwashing.indoor-venue",
      [
        ...source("venues", venue, "venueType"),
        ...source("events", event, "handwashing"),
      ],
    );

  // The event's operational notes count only when they talk about getting
  // in (an inquiry puts dietary notes there, which are not load-in notes).
  const eventNotes = event.operationalRequirements?.trim();
  const loadIn =
    venue?.loadInInstructions?.trim() ||
    (eventNotes && LOAD_IN_WORDS.test(eventNotes) ? eventNotes : undefined);
  out["setup.load_in"] = loadIn
    ? answered(
        { type: "text", text: loadIn },
        `Load-in: ${loadIn}.`,
        "setup.load_in.venue-or-event",
        venue?.loadInInstructions?.trim()
          ? source("venues", venue, "loadInInstructions")
          : source("events", event, "operationalRequirements"),
      )
    : unresolved(
        ["No load-in notes on the venue or the event."],
        "Add load-in notes on the venue.",
        "setup.load_in.venue-or-event",
        [
          ...source("venues", venue),
          ...source("events", event, "operationalRequirements"),
        ],
      );
  return out;
}
