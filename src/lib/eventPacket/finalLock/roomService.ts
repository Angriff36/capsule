import {
  answered,
  notApplicable,
  said,
  source,
  unresolved,
  type Draft,
  type Said,
} from "./answer";
import { isDropOff } from "./policy";
import { servingwareAnswer } from "./servingware";
import type { FinalLockInput } from "./types";

const yesLike = (s: Said) => s.kind === "yes" || s.kind === "party";
const partyOf = (s: Said) =>
  s.kind === "party" ? s.party : s.kind === "yes" ? "Mangia" : null;

/** Servingware, rentals, room setup, food service and bussing. */
export function roomServiceAnswers(
  input: FinalLockInput,
): Record<string, Draft> {
  const { event } = input;
  const text = event.text;
  const ev = (field: string) => source("events", event, field);
  const dropOff = isDropOff(input.serviceStyle?.name ?? null);
  const out: Record<string, Draft> = {};

  // Servingware: where plates, china and flatware come from.
  const rentals = said(text.eventRentals);
  const ware = servingwareAnswer(input);
  const pieces = ware.pieces;
  out["servingware.source"] = ware.draft;

  // Rentals: one return owner and one return window.
  const hasRentals = yesLike(rentals) || pieces.includes("Rented pieces");
  const take = said(text.takeRentalsWithUs);
  const leave = said(text.leaveRentalsOnsite);
  const rentalSources = [
    ...ev("eventRentals"),
    ...ev("takeRentalsWithUs"),
    ...ev("leaveRentalsOnsite"),
  ];
  if (
    !hasRentals &&
    (rentals.kind === "no" || rentals.kind === "empty") &&
    !yesLike(take) &&
    !yesLike(leave)
  )
    out["rentals.return"] =
      rentals.kind === "no"
        ? notApplicable(
            "The day sheet says this event has no rentals.",
            "rentals.return.none-on-event",
            rentalSources,
          )
        : unresolved(
            ["The day sheet does not say whether this event has rentals."],
            "Fill in event rentals on the day sheet.",
            "rentals.return.one-owner-one-window",
            rentalSources,
          );
  else if (yesLike(take) && yesLike(leave))
    out["rentals.return"] = unresolved(
      [
        "The task breakdown says both take the rentals with us and leave them onsite.",
      ],
      "Choose one: take the rentals with us or leave them onsite.",
      "rentals.return.one-owner-one-window",
      rentalSources,
    );
  else if (yesLike(take))
    out["rentals.return"] = answered(
      {
        type: "record",
        fields: {
          handling: "Mangia takes them away",
          owner: "Mangia",
          windowStartsAt: event.endsAt,
        },
      },
      "Mangia packs the rentals and takes them away when the event ends.",
      "rentals.return.one-owner-one-window",
      rentalSources,
    );
  else if (yesLike(leave))
    out["rentals.return"] = answered(
      {
        type: "record",
        fields: {
          handling: "Left onsite for pickup",
          owner:
            leave.kind === "party" && leave.party !== "Mangia"
              ? leave.party
              : "Rental company",
          windowStartsAt: event.endsAt,
        },
      },
      `Rentals stay onsite after the event for the ${leave.kind === "party" && leave.party !== "Mangia" ? leave.party.toLowerCase() : "rental company"} to pick up.`,
      "rentals.return.one-owner-one-window",
      rentalSources,
    );
  else
    out["rentals.return"] = unresolved(
      ["This event has rentals but nobody is named to return them."],
      "Say on the task breakdown if we take the rentals with us or leave them onsite.",
      "rentals.return.one-owner-one-window",
      rentalSources,
    );

  // Room setup: who sets each part of the room.
  const noApps =
    said(text.stationaryApps).kind === "no" &&
    !input.dishes.some((d) => /appetizer|hors/i.test(d.course ?? ""));
  const noDrinks =
    said(text.barService).kind === "no" &&
    said(text.beveragesOnMenu).kind === "no";
  const whoSets = (
    key: string,
    field: string,
    words: string,
    notNeeded?: [boolean, string, string],
  ) => {
    const s = said(text[field]);
    if (dropOff && s.kind === "empty")
      return (out[key] = notApplicable(
        `Drop-off: Mangia does not set the ${words}.`,
        `${key}.drop-off`,
        [...ev(field), ...source("serviceStyles", input.serviceStyle)],
      ));
    if (notNeeded?.[0] && s.kind === "empty")
      return (out[key] = notApplicable(notNeeded[1], notNeeded[2], ev(field)));
    if (s.kind === "no")
      return (out[key] = notApplicable(
        `The task breakdown says no ${words} are needed.`,
        `${key}.marked-not-needed`,
        ev(field),
      ));
    const party = partyOf(s);
    if (party)
      return (out[key] = answered(
        { type: "choice", choice: party },
        `${party} sets the ${words}.`,
        `${key}.task-breakdown`,
        ev(field),
      ));
    out[key] = unresolved(
      [
        s.kind === "other"
          ? `"${s.text}" does not say who sets the ${words}.`
          : `Nobody is named to set the ${words}.`,
      ],
      `Say who sets the ${words} on the task breakdown.`,
      `${key}.task-breakdown`,
      ev(field),
    );
  };
  whoSets("room.guest_tables", "guestTableSetup", "guest tables and chairs");
  whoSets("room.place_settings", "placeSettings", "flatware and china");
  whoSets("room.water_goblets", "tablesideWater", "water goblets");
  whoSets("room.buffet_tables", "buffetTableSetup", "buffet tables");
  whoSets("room.appetizer_tables", "appetizerTableSetup", "appetizer tables", [
    noApps,
    "No stationary appetizers are on this event.",
    "room.appetizer_tables.no-stationary-appetizers",
  ]);
  whoSets("room.beverage_tables", "beverageTableSetup", "drinks table", [
    noDrinks,
    "No bar and no drinks are on this event.",
    "room.beverage_tables.no-drinks",
  ]);

  // Food service.
  const stationary = said(text.stationaryApps);
  const passed = said(text.passedApps);
  const appSources = [
    ...ev("stationaryApps"),
    ...ev("passedApps"),
    ...ev("appetizerTableSetup"),
  ];
  const appDishes = input.dishes.some((d) =>
    /appetizer|hors/i.test(d.course ?? ""),
  );
  if (dropOff && yesLike(passed))
    out["food.appetizer_placement"] = unresolved(
      ["Passed appetizers need staff, but this is a drop-off."],
      "Change the appetizers to stationary or change the service style.",
      "food.appetizer_placement.staff-for-passed",
      appSources,
    );
  else if (yesLike(stationary)) {
    const table = said(text.appetizerTableSetup);
    out["food.appetizer_placement"] =
      table.kind === "no"
        ? answered(
            { type: "choice", choice: "On the main buffet" },
            "Stationary appetizers go on the main buffet table.",
            "food.appetizer_placement.task-breakdown",
            appSources,
          )
        : yesLike(table)
          ? answered(
              { type: "choice", choice: "Own table" },
              "Stationary appetizers get their own table.",
              "food.appetizer_placement.task-breakdown",
              appSources,
            )
          : unresolved(
              [
                "Stationary appetizers are on, but nobody said if they get their own table or go on the buffet.",
              ],
              "Fill in appetizer table setup on the task breakdown.",
              "food.appetizer_placement.task-breakdown",
              appSources,
            );
  } else if (yesLike(passed))
    out["food.appetizer_placement"] = answered(
      { type: "choice", choice: "Passed" },
      "Appetizers are passed by staff.",
      "food.appetizer_placement.task-breakdown",
      appSources,
    );
  else if (
    !appDishes &&
    stationary.kind !== "other" &&
    passed.kind !== "other" &&
    (stationary.kind === "no" || passed.kind === "no")
  )
    out["food.appetizer_placement"] = notApplicable(
      "The day sheet says no appetizers, and none are on the menu.",
      "food.appetizer_placement.no-appetizers",
      appSources,
    );
  else
    out["food.appetizer_placement"] = unresolved(
      [
        appDishes
          ? "Appetizers are on the menu but the day sheet does not say stationary or passed."
          : "The day sheet does not say whether there are appetizers.",
      ],
      "Fill in stationary and passed appetizers on the day sheet.",
      "food.appetizer_placement.task-breakdown",
      appSources,
    );

  const dispensers = said(text.beverageDispensers);
  out["food.beverage_dispensers"] =
    dispensers.kind === "no"
      ? answered(
          { type: "yes_no", yes: false },
          "No drink dispensers.",
          "food.beverage_dispensers.task-breakdown",
          ev("beverageDispensers"),
        )
      : yesLike(dispensers)
        ? answered(
            { type: "yes_no", yes: true },
            "Set out drink dispensers.",
            "food.beverage_dispensers.task-breakdown",
            ev("beverageDispensers"),
          )
        : noDrinks && dispensers.kind === "empty"
          ? notApplicable(
              "No bar and no drinks are on this event.",
              "food.beverage_dispensers.no-drinks",
              [...ev("barService"), ...ev("beveragesOnMenu")],
            )
          : unresolved(
              ["Nobody has said whether drink dispensers go out."],
              "Fill in drink dispensers on the task breakdown.",
              "food.beverage_dispensers.task-breakdown",
              ev("beverageDispensers"),
            );

  const buffet = said(text.buffetTableSetup);
  const service = text.buffetService?.trim() ?? "";
  out["food.buffet_served"] = dropOff
    ? notApplicable(
        "Drop-off: no staff stay to serve the buffet.",
        "food.buffet_served.drop-off",
        source("serviceStyles", input.serviceStyle),
      )
    : buffet.kind === "no"
      ? notApplicable(
          "The task breakdown says there is no buffet.",
          "food.buffet_served.no-buffet",
          ev("buffetTableSetup"),
        )
      : /self/i.test(service)
        ? answered(
            { type: "choice", choice: "Self-serve" },
            "Guests serve themselves: the event says self-serve.",
            "food.buffet_served.event-says",
            ev("buffetService"),
          )
        : !service || /serv|yes|staff/i.test(service)
          ? answered(
              { type: "choice", choice: "Served" },
              service
                ? "Staff serve the buffet."
                : "Staff serve the buffet: Mangia serves unless the event says self-serve.",
              service
                ? "food.buffet_served.event-says"
                : "food.buffet_served.mangia-default-served",
              ev("buffetService"),
            )
          : unresolved(
              [`"${service}" does not say served or self-serve.`],
              "Say served or self-serve on the task breakdown.",
              "food.buffet_served.event-says",
              ev("buffetService"),
            );

  // Bussing: bus after dinner by default; full bussing only when stated.
  const bussing = text.bussing?.trim() ?? "";
  out["bussing.plan"] = dropOff
    ? bussing && said(bussing).kind !== "no"
      ? unresolved(
          [
            `Bussing says "${bussing}" but a drop-off has no staff to clear tables.`,
          ],
          "Clear the bussing answer or change the service style.",
          "bussing.plan.staff-needed",
          [...ev("bussing"), ...source("serviceStyles", input.serviceStyle)],
        )
      : notApplicable(
          "Drop-off: no staff stay to clear tables.",
          "bussing.plan.drop-off",
          source("serviceStyles", input.serviceStyle),
        )
    : /full/i.test(bussing)
      ? answered(
          { type: "record", fields: { afterDinner: true, full: true } },
          "Full bussing, including glassware, as the event says.",
          "bussing.plan.event-says",
          ev("bussing"),
        )
      : said(bussing).kind === "no"
        ? answered(
            { type: "record", fields: { afterDinner: false, full: false } },
            "No bussing: the event says so.",
            "bussing.plan.event-says",
            ev("bussing"),
          )
        : answered(
            { type: "record", fields: { afterDinner: true, full: false } },
            bussing
              ? `Bus after dinner (${bussing}); no full bussing.`
              : "Bus after dinner; no full bussing unless the contract says so.",
            bussing ? "bussing.plan.event-says" : "bussing.plan.mangia-default",
            ev("bussing"),
          );
  return out;
}
