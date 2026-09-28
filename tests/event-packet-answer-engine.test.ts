import { describe, expect, it } from "vitest";
import {
  evaluateFinalLock,
  printedAnswers,
  type StoredOverride,
} from "../src/lib/eventPacket/finalLock/evaluate";
import {
  POLICY_VERSION,
  QUESTIONS,
} from "../src/lib/eventPacket/finalLock/policy";
import type {
  FinalLockAnswer,
  FinalLockInput,
} from "../src/lib/eventPacket/finalLock/types";

const T = Date.parse("2026-10-10T18:00:00Z");
const MIN = 60_000;

function input(): FinalLockInput {
  return {
    event: {
      id: "event-1",
      version: 7,
      title: "Ashley's Wedding",
      eventNumber: "6014",
      stage: "sales_lock",
      serviceStyleId: "style-1",
      serviceStyleName: "Full Service",
      expectedHeadcount: 100,
      venueId: "venue-1",
      venueName: "Lakeside Lawn",
      venueAddress: "1 Shore Road",
      venueCapacity: 150,
      clientId: "client-1",
      contactName: "Ashley",
      contactPhone: "555-0100",
      contactEmail: null,
      assignedToId: "person-owner",
      ownerName: "Dana",
      quotedPrice: 5000,
      startsAt: T,
      endsAt: T + 180 * MIN,
      serviceStartsAt: T,
      timing: {
        setup: 120,
        load: 60,
        outbound: 30,
        cleanup: 60,
        returnTravel: 30,
        unload: 30,
      },
      salesLockedAt: T - 7 * 24 * 60 * MIN,
      operationalRequirements: null,
      text: {
        linenColorTables: "Ivory",
        linenColorBaskets: "Black",
        setupDiagram: "Binder page 3",
        servingwareKit: "Rustic kit",
        rainPlan: "Move under the pavilion",
        venueSurface: "Grass",
        tentAndFlooring: "No tent",
        handwashing: "Station packed",
        servingwareSource: "Rented china",
        eventRentals: "Yes",
        takeRentalsWithUs: "Yes",
        leaveRentalsOnsite: "No",
        guestTableSetup: "Mangia",
        placeSettings: "Mangia",
        tablesideWater: "Mangia",
        buffetTableSetup: "Mangia",
        appetizerTableSetup: "Yes",
        beverageTableSetup: "Mangia",
        stationaryApps: "Yes",
        passedApps: "No",
        beverageDispensers: "Yes",
        buffetService: null,
        bussing: null,
        dessertService: "Mangia",
        barService: "Client",
        beveragesOnMenu: "Lemonade, coffee",
        buffetHotPlates: "Green Beans, Roasted Potatoes, Chicken Marsala",
        buffetColdPlates: "Fruit Platter, Caesar Salad, Rolls and Butter",
      },
    },
    serviceStyle: { id: "style-1", version: 1, name: "Full Service" },
    client: {
      id: "client-1",
      version: 2,
      name: "Ashley Smith",
      status: "active",
    },
    venue: {
      id: "venue-1",
      version: 3,
      name: "Lakeside Lawn",
      venueType: "outdoor",
      loadInInstructions: "Gate B, grass path",
    },
    dishes: [
      ["Bruschetta", "Appetizer"],
      ["Green Beans", "Vegetable"],
      ["Roasted Potatoes", "Starch"],
      ["Chicken Marsala", "Entree"],
      ["Fruit Platter", "Cold side"],
      ["Caesar Salad", "Salad"],
      ["Rolls and Butter", "Bread"],
      ["Chocolate Cake", "Dessert"],
    ].map(([name, course], i) => ({
      id: `dish-${i}`,
      version: 1,
      name: name!,
      course: course!,
      serviceStyle: null,
      sortOrder: i,
      quantityServings: 100,
      followsEventHeadcount: true,
      notes: null,
    })),
    timeline: [],
    vehicles: [
      {
        id: "va-1",
        version: 1,
        vehicleId: "truck-1",
        vehicleName: "Box truck",
        trailerId: null,
        trailerName: null,
        driverId: "person-driver",
        outOfService: false,
      },
    ],
    equipment: [],
    packLists: [
      {
        id: "pack-1",
        version: 4,
        status: "packed",
        itemCount: 40,
        missingCount: 0,
      },
    ],
    assignments: [
      { id: "asg-1", version: 1, status: "confirmed", confirmedAt: T - MIN },
    ],
    channel: { messageCount: 3, attachmentCount: 1, lastMessageId: "msg-3" },
    packet: {
      latestRevisionId: "rev-1",
      latestRevisionStale: false,
      signoffs: [
        {
          key: "check.signature.warehouse-ops",
          actor: "user-w",
          at: "2026-10-10T15:00:00Z",
        },
        {
          key: "check.signature.event-lead",
          actor: "user-l",
          at: "2026-10-10T15:05:00Z",
        },
      ],
    },
    confirmations: {},
  };
}

const allConfirmed = (i: FinalLockInput) => {
  for (const q of QUESTIONS.filter((item) => item.form))
    i.confirmations[q.form!] = {
      actor: "user-crew",
      at: "2026-10-10T16:00:00Z",
    };
  return i;
};
const get = (answers: FinalLockAnswer[], key: string) => {
  const found = answers.find((a) => a.questionKey === key);
  if (!found) throw new Error(`missing ${key}`);
  return found;
};
const run = (i: FinalLockInput, options = {}) => evaluateFinalLock(i, options);

describe("Final Lock answer engine", () => {
  it("records question key and policy version on every derived answer", () => {
    const { answers, policyVersion } = run(input());
    expect(policyVersion).toBe(POLICY_VERSION);
    expect(answers.map((a) => a.questionKey).sort()).toEqual(
      QUESTIONS.map((q) => q.key).sort(),
    );
    expect(new Set(answers.map((a) => a.group))).toEqual(
      new Set([
        "identity",
        "menu",
        "timeline",
        "setup",
        "servingware",
        "rentals",
        "room",
        "food",
        "bussing",
        "dessert",
        "beverage",
        "buffet",
        "vehicles",
        "communication",
        "readiness",
        "field",
      ]),
    );
    for (const a of answers) {
      expect(a.policyVersion).toBe(POLICY_VERSION);
      expect(a.ruleVersion).toBeGreaterThan(0);
    }
  });

  it("produces all four result states with the right inputs", () => {
    const i = input();
    i.venue!.venueType = "banquet_hall";
    i.event.text.rainPlan = null;
    i.event.expectedHeadcount = null;
    const { answers } = run(i);
    expect(get(answers, "identity.service_style").result).toBe("answered");
    expect(get(answers, "setup.rain_plan").result).toBe("not_applicable");
    expect(get(answers, "identity.guest_count").result).toBe("unresolved");
    expect(get(answers, "field.arrival").result).toBe("field_confirmation");
    for (const a of answers)
      expect([
        "answered",
        "not_applicable",
        "unresolved",
        "field_confirmation",
      ]).toContain(a.result);
  });

  it("stores typed answer values per question", () => {
    const { answers } = run(input());
    expect(get(answers, "identity.guest_count").value).toEqual({
      type: "count",
      count: 100,
    });
    expect(get(answers, "identity.service_style").value).toEqual({
      type: "choice",
      choice: "Full Service",
    });
    expect(get(answers, "timeline.schedule").value.type).toBe("times");
    for (const a of answers.filter((x) => x.result === "answered"))
      expect(a.value.type).not.toBe("none");
    for (const a of answers.filter((x) => x.result !== "answered"))
      expect(a.value).toEqual({ type: "none" });
  });

  it("attaches a plain-language explanation to each answer", () => {
    const i = input();
    i.event.contactName = null;
    for (const a of run(i).answers) {
      expect(a.explanation.length).toBeGreaterThan(5);
      expect(a.explanation.length).toBeLessThan(300);
      expect(a.explanation).not.toMatch(/undefined|null|NaN|\[object/);
    }
  });

  it("records source record ids and versions", () => {
    const { answers } = run(input());
    expect(get(answers, "identity.guest_count").sources).toEqual([
      {
        table: "events",
        id: "event-1",
        version: 7,
        field: "expectedHeadcount",
      },
    ]);
    expect(get(answers, "identity.customer").sources).toContainEqual({
      table: "clients",
      id: "client-1",
      version: 2,
    });
    expect(get(answers, "menu.order").sources).toHaveLength(8);
    expect(get(answers, "vehicles.assigned").sources[0]).toEqual({
      table: "eventVehicleAssignments",
      id: "va-1",
      version: 1,
    });
  });

  it("records the rule identifier behind each answer", () => {
    const { answers } = run(input());
    for (const a of answers) expect(a.rule).toMatch(/^[a-z_.-]+/);
    expect(get(answers, "food.buffet_served").rule).toBe(
      "food.buffet_served.mangia-default-served",
    );
  });

  it("records an authorized override with reason, actor and time, only for the facts it saw", () => {
    const i = input();
    i.event.text.buffetHotPlates =
      "Chicken Marsala, Green Beans, Roasted Potatoes";
    const before = get(run(i).answers, "buffet.arrangement");
    expect(before.result).toBe("unresolved");
    const override: StoredOverride = {
      questionKey: "buffet.arrangement",
      basedOn: before.fingerprint,
      value: { type: "text", text: "Chicken first: the couple asked for it" },
      reason: "Client asked for the chicken first",
      actor: "user-manager",
      at: "2026-10-09T12:00:00Z",
    };
    const after = get(
      run(i, { overrides: [override] }).answers,
      "buffet.arrangement",
    );
    expect(after.result).toBe("answered");
    expect(after.override).toEqual({
      value: override.value,
      reason: override.reason,
      actor: "user-manager",
      at: "2026-10-09T12:00:00Z",
    });
    expect(after.rule).toContain("authorized-override");
    // The deliberate exception is recorded, not silently fixed.
    expect(after.value).toEqual(override.value);
    i.event.text.buffetHotPlates =
      "Chicken Marsala, Roasted Potatoes, Green Beans";
    expect(
      get(run(i, { overrides: [override] }).answers, "buffet.arrangement")
        .override,
    ).toBeNull();
    // Physical field work cannot be overridden from the office.
    const field = get(run(input()).answers, "field.arrival");
    const fieldOverride = {
      ...override,
      questionKey: "field.arrival",
      basedOn: field.fingerprint,
    };
    expect(
      get(run(input(), { overrides: [fieldOverride] }).answers, "field.arrival")
        .result,
    ).toBe("field_confirmation");
  });

  it("links each answer to the displaying packet revision", () => {
    const first = run(input());
    const printed = printedAnswers(first, "rev-1");
    const again = run(input(), { printed });
    expect(get(again.answers, "identity.venue").displayedInRevision).toBe(
      "rev-1",
    );
    const moved = input();
    moved.event.venueName = "Hilltop Barn";
    const later = run(moved, { printed });
    expect(get(later.answers, "identity.venue").displayedInRevision).toBeNull();
    expect(get(later.answers, "identity.guest_count").displayedInRevision).toBe(
      "rev-1",
    );
  });

  it("answers only with structured evidence and proves not-applicable with a rule", () => {
    const i = input();
    i.event.text.linenColorTables = "  ";
    i.event.text.eventRentals = "No";
    i.event.text.servingwareSource = "Plasticware";
    i.event.text.takeRentalsWithUs = null;
    const { answers } = run(i);
    expect(get(answers, "setup.linen_tables").result).toBe("unresolved");
    const rentals = get(answers, "rentals.return");
    expect(rentals.result).toBe("not_applicable");
    expect(rentals.rule).toBe("rentals.return.none-on-event");
    expect(rentals.sources.length).toBeGreaterThan(0);
  });

  it("names the exact missing facts and one action when unresolved", () => {
    const i = input();
    i.event.contactName = null;
    i.event.contactPhone = null;
    const contact = get(run(i).answers, "identity.contact");
    expect(contact.missing).toEqual([
      "No day-of contact name.",
      "No phone or email for the day-of contact.",
    ]);
    expect(contact.action).toBe("Fill in the day-of contact on the event.");
    expect(contact.resolver).toBe("Sales");
  });

  it("raises a Sales exception for blank or conflicting identity facts", () => {
    const i = input();
    i.event.serviceStyleName = "Drop Off";
    i.event.expectedHeadcount = 200;
    i.event.eventNumber = null;
    const { answers } = run(i);
    expect(get(answers, "identity.service_style").missing[0]).toContain(
      '"Drop Off"',
    );
    expect(get(answers, "identity.venue").missing[0]).toBe(
      "Lakeside Lawn holds 150 but the event has 200 guests.",
    );
    expect(get(answers, "identity.event_number").result).toBe("unresolved");
    for (const key of [
      "identity.service_style",
      "identity.venue",
      "identity.event_number",
    ])
      expect(get(answers, key).resolver).toBe("Sales");
  });

  it("checks menu order, servings, blank lines, open notes and service fit", () => {
    const i = input();
    i.dishes[0]!.name = "***";
    i.dishes[1]!.sortOrder = null;
    i.dishes[2]!.quantityServings = 60;
    i.dishes[3]!.notes = "Sauce TBD with client";
    i.dishes[4]!.quantityServings = 40;
    i.dishes[4]!.followsEventHeadcount = false;
    const { answers } = run(i);
    expect(get(answers, "menu.no_empty_shell").missing).toEqual([
      'Menu line "***" is a blank placeholder.',
    ]);
    expect(get(answers, "menu.order").missing).toEqual([
      "Green Beans has no place in the menu order.",
    ]);
    expect(get(answers, "menu.servings").missing).toEqual([
      "Roasted Potatoes: 60 servings for 100 guests.",
    ]);
    expect(get(answers, "menu.production_notes").result).toBe("unresolved");
    const drop = input();
    drop.serviceStyle!.name = "Drop Off";
    drop.event.serviceStyleName = "Drop Off";
    drop.dishes[0]!.course = "Passed appetizer";
    expect(get(run(drop).answers, "menu.service_fit").missing[0]).toContain(
      "drop-off",
    );
  });

  it("derives every step of the day plan and the route", () => {
    const { answers } = run(input());
    const times = get(answers, "timeline.schedule").value;
    expect(times).toEqual({
      type: "times",
      times: {
        staff_on: T - 210 * MIN,
        load: T - 210 * MIN,
        shop_departure: T - 150 * MIN,
        onsite_arrival: T - 120 * MIN,
        service: T,
        cleanup: T + 180 * MIN,
        venue_departure: T + 240 * MIN,
        shop_return: T + 270 * MIN,
        unload: T + 270 * MIN,
        staff_off: T + 300 * MIN,
      },
    });
    const i = input();
    i.event.timing.outbound = null;
    const missing = run(i).answers;
    expect(get(missing, "timeline.schedule").missing).toContain(
      "No shop departure (NLT): add travel time to the venue.",
    );
    expect(get(missing, "timeline.route").missing).toEqual([
      "No travel time to the venue.",
    ]);
  });

  it("derives setup/weather answers from structured setup records or raises exact exceptions", () => {
    const outdoor = input();
    outdoor.event.text.tentAndFlooring = null;
    outdoor.event.text.handwashing = "No";
    const a = run(outdoor).answers;
    expect(get(a, "setup.tent_flooring").missing).toEqual([
      "No tent, flooring and tarps is recorded for this outdoor venue.",
    ]);
    expect(get(a, "setup.handwashing").result).toBe("unresolved");
    expect(get(a, "setup.linen_tables").value).toEqual({
      type: "text",
      text: "Ivory",
    });
    const indoor = input();
    indoor.venue!.venueType = "banquet_hall";
    indoor.event.text.venueSurface = null;
    expect(get(run(indoor).answers, "setup.venue_surface").rule).toBe(
      "setup.venue_surface.indoor-venue",
    );
  });

  it("answers the china supplier from the servingware records and catches a clash", () => {
    const { answers } = run(input());
    expect(get(answers, "servingware.source").value).toEqual({
      type: "list",
      items: ["Rented pieces"],
    });
    const i = input();
    i.event.text.eventRentals = "No";
    expect(get(run(i).answers, "servingware.source").missing).toEqual([
      "Servingware says rented pieces but the day sheet says no rentals.",
    ]);
  });

  it("assigns exactly one return owner and window per rented line", () => {
    const rentals = get(run(input()).answers, "rentals.return");
    expect(rentals.value).toEqual({
      type: "record",
      fields: {
        handling: "Mangia takes them away",
        owner: "Mangia",
        windowStartsAt: T + 180 * MIN,
      },
    });
    const both = input();
    both.event.text.leaveRentalsOnsite = "Yes";
    expect(get(run(both).answers, "rentals.return").result).toBe("unresolved");
    const left = input();
    left.event.text.takeRentalsWithUs = "No";
    left.event.text.leaveRentalsOnsite = "Yes, rental company picks up";
    expect(get(run(left).answers, "rentals.return").value).toMatchObject({
      fields: { owner: "Rental company" },
    });
  });

  it("answers who sets each part of the room", () => {
    const i = input();
    i.event.text.guestTableSetup = "Venue staff";
    i.event.text.tablesideWater = "No";
    i.event.text.beverageTableSetup = "maybe";
    const { answers } = run(i);
    expect(get(answers, "room.guest_tables").value).toEqual({
      type: "choice",
      choice: "Venue",
    });
    expect(get(answers, "room.water_goblets").result).toBe("not_applicable");
    expect(get(answers, "room.beverage_tables").missing).toEqual([
      '"maybe" does not say who sets the drinks table.',
    ]);
    expect(get(answers, "room.place_settings").value).toEqual({
      type: "choice",
      choice: "Mangia",
    });
  });

  it("serves the buffet by default and places appetizers from the task breakdown", () => {
    const { answers } = run(input());
    expect(get(answers, "food.buffet_served").value).toEqual({
      type: "choice",
      choice: "Served",
    });
    expect(get(answers, "food.appetizer_placement").value).toEqual({
      type: "choice",
      choice: "Own table",
    });
    expect(get(answers, "food.beverage_dispensers").value).toEqual({
      type: "yes_no",
      yes: true,
    });
    const i = input();
    i.event.text.buffetService = "Self-serve";
    i.event.text.appetizerTableSetup = "No";
    const other = run(i).answers;
    expect(get(other, "food.buffet_served").value).toEqual({
      type: "choice",
      choice: "Self-serve",
    });
    expect(get(other, "food.appetizer_placement").value).toEqual({
      type: "choice",
      choice: "On the main buffet",
    });
  });

  it("busses after dinner by default and full bussing only when stated", () => {
    expect(get(run(input()).answers, "bussing.plan").value).toEqual({
      type: "record",
      fields: { afterDinner: true, full: false },
    });
    const full = input();
    full.event.text.bussing = "Full clear";
    expect(get(run(full).answers, "bussing.plan").value).toEqual({
      type: "record",
      fields: { afterDinner: true, full: true },
    });
    const drop = input();
    drop.serviceStyle!.name = "Drop Off";
    drop.event.serviceStyleName = "Drop Off";
    drop.event.text.bussing = "Full clear";
    expect(get(run(drop).answers, "bussing.plan").result).toBe("unresolved");
  });

  it("derives dessert setup, cutting, serving and coffee bar", () => {
    expect(get(run(input()).answers, "dessert.plan").value).toEqual({
      type: "record",
      fields: {
        setup: "Mangia",
        cutting: "Mangia",
        serving: "Mangia",
        coffeeBar: "Mangia",
      },
    });
    const none = input();
    none.dishes = none.dishes.filter((d) => d.course !== "Dessert");
    none.event.text.beveragesOnMenu = "Lemonade";
    none.event.text.dessertService = null;
    expect(get(run(none).answers, "dessert.plan").result).toBe(
      "not_applicable",
    );
  });

  it("beverage/bar answers applicable or not applicable and never stays blank", () => {
    expect(get(run(input()).answers, "beverage.bar").value).toMatchObject({
      fields: { applicable: true, bar: "Client" },
    });
    const blank = input();
    blank.event.text.barService = null;
    blank.event.text.beveragesOnMenu = null;
    expect(get(run(blank).answers, "beverage.bar").result).toBe("unresolved");
    const none = input();
    none.event.text.barService = "No";
    none.event.text.beveragesOnMenu = "None";
    expect(get(run(none).answers, "beverage.bar").result).toBe(
      "not_applicable",
    );
  });

  it("validates buffet arrangement standard and records deliberate exceptions", () => {
    expect(get(run(input()).answers, "buffet.arrangement").result).toBe(
      "answered",
    );
    const i = input();
    i.event.text.buffetHotPlates =
      "Chicken Marsala, Green Beans, Roasted Potatoes, Beef Brisket";
    i.event.text.buffetColdPlates = "Caesar Salad, Fruit Platter";
    const missing = get(run(i).answers, "buffet.arrangement").missing;
    expect(missing).toEqual([
      "Green Beans comes after Chicken Marsala: vegetables go closest to the plates, then starches, then proteins.",
      "4 hot items: the standard is three per line; plan a second table or rotate chafers.",
      "Fruit Platter comes after the salad: cold sides go before the salad.",
      "No bread and butter on the buffet: the standard buffet has them.",
    ]);
  });

  it("shows trucks and equipment and treats missing capacity as an exception", () => {
    expect(get(run(input()).answers, "vehicles.assigned").value).toEqual({
      type: "list",
      items: ["Box truck"],
    });
    const i = input();
    i.vehicles[0]!.outOfService = true;
    i.equipment.push({
      id: "res-1",
      version: 1,
      name: "Chafers",
      quantity: 10,
      status: "reserved",
      shortBy: 2,
    });
    expect(get(run(i).answers, "vehicles.assigned").missing).toEqual([
      "Box truck is out of service.",
      "Chafers is short by 2.",
    ]);
    const none = input();
    none.vehicles = [];
    expect(get(run(none).answers, "vehicles.assigned").action).toBe(
      "Assign a truck on the event.",
    );
  });

  it("derives ready-to-leave from actual work and needs two different people before takeoff", () => {
    const i = allConfirmed(input());
    expect(get(run(i).answers, "readiness.dispatch").value).toMatchObject({
      fields: { readyToDispatch: true, twoPersonSignature: true },
    });
    const same = allConfirmed(input());
    same.packet.signoffs[1]!.actor = "user-w";
    const one = get(run(same).answers, "readiness.dispatch");
    expect(one.result).toBe("unresolved");
    expect(one.missing).toEqual([
      "The before-takeoff check was signed twice by the same person; it needs two people.",
    ]);
    const unlocked = input();
    unlocked.event.salesLockedAt = null;
    const report = run(unlocked);
    expect(get(report.answers, "readiness.dispatch").missing).toContain(
      "Sales has not locked the event.",
    );
    expect(report.outcome).toBe("needs_review");
  });

  it("reports clear, needs review, field work pending and stale", () => {
    expect(run(allConfirmed(input())).outcome).toBe("clear");
    const pending = run(input());
    expect(pending.outcome).toBe("field_work_pending");
    expect(get(pending.answers, "field.arrival").fieldWork).toEqual({
      form: "field.arrival",
      dueAt: T - 120 * MIN,
      confirmedAt: null,
      confirmedBy: null,
    });
    const review = input();
    review.event.venueName = null;
    review.venue = null;
    const blocked = run(review);
    expect(blocked.outcome).toBe("needs_review");
    expect(get(blocked.answers, "identity.venue").sources).toEqual([
      { table: "events", id: "event-1", version: 7, field: "venueName" },
    ]);
    const printed = printedAnswers(run(allConfirmed(input())), "rev-1");
    const changed = allConfirmed(input());
    changed.event.text.linenColorTables = "White";
    changed.event.text.rainPlan = "Tent on the lawn";
    const stale = run(changed, { printed });
    expect(stale.outcome).toBe("stale");
    expect(stale.staleQuestions.sort()).toEqual([
      "setup.linen_tables",
      "setup.rain_plan",
    ]);
    expect(stale.staleSections).toEqual(["layouts"]);
    // The draft answer is already recalculated from the new facts.
    expect(get(stale.answers, "setup.linen_tables").value).toEqual({
      type: "text",
      text: "White",
    });
    // A change that opens a question is Needs review, and still marks the section.
    const more = allConfirmed(input());
    more.event.expectedHeadcount = 120;
    const review2 = run(more, { printed });
    expect(review2.outcome).toBe("needs_review");
    expect(review2.staleQuestions.sort()).toEqual([
      "identity.guest_count",
      "menu.servings",
    ]);
    expect(review2.staleSections.sort()).toEqual(["contacts", "menu"]);
  });

  it("a policy version bump marks affected future answers stale deterministically", () => {
    const printed = printedAnswers(run(allConfirmed(input())), "rev-1");
    const bumped = QUESTIONS.map((q) =>
      q.key === "bussing.plan" ? { ...q, ruleVersion: 2 } : q,
    );
    const first = run(allConfirmed(input()), {
      printed,
      policy: bumped,
      policyVersion: "next",
    });
    const second = run(allConfirmed(input()), {
      printed,
      policy: bumped,
      policyVersion: "next",
    });
    expect(first).toEqual(second);
    expect(first.staleQuestions).toEqual(["bussing.plan"]);
    expect(first.staleSections).toEqual(["staffing"]);
  });
});
