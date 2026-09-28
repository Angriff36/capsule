import { describe, expect, it } from "vitest";
import {
  evaluateFinalLock,
  finalLockPrint,
  type FinalLockReport,
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
      clientName: "Ashley Smith",
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
      dish: { id: `dish-record-${i}`, version: 1 },
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
    packItems: [],
    kitItems: [{ id: "kit-1", version: 1, description: "Coffee airpot" }],
    proposal: null,
    staffNeeds: [],
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
          source: {
            table: "eventPacketResolutions",
            id: "sig-w",
            version: null,
          },
        },
        {
          key: "check.signature.event-lead",
          actor: "user-l",
          at: "2026-10-10T15:05:00Z",
          source: {
            table: "eventPacketResolutions",
            id: "sig-l",
            version: null,
          },
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
      source: {
        table: "eventPacketResolutions",
        id: `done-${q.form}`,
        version: null,
      },
    };
  return i;
};
const get = (answers: FinalLockAnswer[], key: string) => {
  const found = answers.find((a) => a.questionKey === key);
  if (!found) throw new Error(`missing ${key}`);
  return found;
};
const run = (i: FinalLockInput, options = {}) => evaluateFinalLock(i, options);
/** What a revision stores for a print: the printed payload plus its id. */
const printedAt = (report: FinalLockReport, revisionId: string) => ({
  revisionId,
  ...finalLockPrint(report),
});

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
    // Each of the 8 menu lines and the dish record it names.
    expect(get(answers, "menu.order").sources).toHaveLength(16);
    expect(get(answers, "menu.order").sources).toContainEqual({
      table: "dishes",
      id: "dish-record-0",
      version: 1,
    });
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
    const printed = printedAt(first, "rev-1");
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
    i.event.serviceStyleName = null;
    i.event.serviceStyleId = null;
    i.serviceStyle = null;
    i.event.expectedHeadcount = 200;
    i.event.eventNumber = null;
    const { answers } = run(i);
    expect(get(answers, "identity.service_style").missing).toEqual([
      "No service style is set on the event.",
    ]);
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
      category: null,
      rented: false,
      quantity: 10,
      status: "reserved",
      shortBy: 2,
      item: { id: "equipment-chafers", version: 1 },
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
    const printed = printedAt(run(allConfirmed(input())), "rev-1");
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
    // A change after the print that opens a question keeps the print Stale
    // (it must be reprinted) and still marks the section.
    const more = allConfirmed(input());
    more.event.expectedHeadcount = 120;
    const review2 = run(more, { printed });
    expect(review2.outcome).toBe("stale");
    // The printed readiness line named no open office question; now it does.
    expect(review2.staleQuestions.sort()).toEqual([
      "identity.guest_count",
      "menu.servings",
      "readiness.dispatch",
    ]);
    expect(review2.staleSections.sort()).toEqual(
      [
        "contacts",
        "menu",
        get(review2.answers, "readiness.dispatch").section,
      ].sort(),
    );
    // A printed setup answer that is later removed: Stale, not Needs review.
    const printedLinen = allConfirmed(input());
    printedLinen.event.text.linenColorTables = "Ivory";
    const printed2 = printedAt(run(printedLinen), "rev-2");
    const removed = allConfirmed(input());
    removed.event.text.linenColorTables = null;
    const gone = run(removed, { printed: printed2 });
    expect(get(gone.answers, "setup.linen_tables").result).toBe("unresolved");
    expect(gone.staleQuestions).toContain("setup.linen_tables");
    expect(gone.outcome).toBe("stale");
  });

  it("a policy version bump marks affected future answers stale deterministically", () => {
    const printed = printedAt(run(allConfirmed(input())), "rev-1");
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

  it("a new source version with the same value makes the answer stale and ends an old decision", () => {
    const base = allConfirmed(input());
    const printed = printedAt(run(base), "rev-1");
    const servings = get(run(base).answers, "menu.servings");
    const decision: StoredOverride = {
      questionKey: "menu.servings",
      basedOn: servings.basis,
      value: { type: "text", text: "Kitchen sends 110" },
      reason: "Late guests",
      actor: "user-m",
      at: "2026-10-01T10:00:00Z",
    };
    expect(
      get(run(base, { overrides: [decision] }).answers, "menu.servings")
        .override,
    ).not.toBeNull();
    // Only the dish line's version moves; every value stays the same.
    const bumped = allConfirmed(input());
    bumped.dishes[1]!.version = 2;
    const later = run(bumped, { printed, overrides: [decision] });
    expect(later.staleQuestions).toContain("menu.servings");
    expect(get(later.answers, "menu.servings").override).toBeNull();
    expect(get(later.answers, "menu.servings").displayedInRevision).toBeNull();
    // An edit to an unrelated Event field keeps other decisions and prints.
    const renamed = allConfirmed(input());
    renamed.event.version = 8;
    renamed.event.title = "Ashley and Sam's Wedding";
    const same = run(renamed, { printed, overrides: [decision] });
    expect(get(same.answers, "menu.servings").override).not.toBeNull();
    expect(same.staleQuestions).not.toContain("setup.rain_plan");
  });

  it("servingware joins the proposal, rentals, service style kit and pack list", () => {
    const i = input();
    i.event.text.servingwareSource = "Rented china";
    i.equipment.push({
      id: "res-china",
      version: 3,
      name: "10in china plate",
      category: "Dinnerware",
      rented: true,
      quantity: 100,
      status: "reserved",
      shortBy: 0,
      item: { id: "equipment-china", version: 5 },
    });
    const agreed = get(run(i).answers, "servingware.source");
    expect(agreed.result).toBe("answered");
    expect(agreed.sources).toContainEqual({
      table: "equipmentReservations",
      id: "res-china",
      version: 3,
    });
    // A pack list line of plasticware disagrees with "Rented china".
    i.packItems.push({ id: "pli-1", version: 1, description: "Plastic forks" });
    i.proposal = {
      id: "prop-1",
      version: 2,
      lines: [
        {
          id: "line-1",
          version: 1,
          table: "proposalLineItems",
          text: "Client-provided plates",
          related: [],
        },
      ],
    };
    const clash = get(run(i).answers, "servingware.source");
    expect(clash.result).toBe("unresolved");
    expect(clash.missing).toEqual([
      'Accepted proposal line "Client-provided plates" means client-provided pieces, but the servingware source says "Rented china".',
      'Pack list line "Plastic forks" means plasticware, but the servingware source says "Rented china".',
    ]);
    // With no written source, the records answer it; rentals vs "no rentals" clash.
    const records = input();
    records.event.text.servingwareSource = null;
    records.event.text.eventRentals = "No";
    records.event.text.takeRentalsWithUs = null;
    records.kitItems.push({
      id: "kit-2",
      version: 1,
      description: "House china plates",
    });
    expect(get(run(records).answers, "servingware.source").value).toEqual({
      type: "list",
      items: ["Mangia pieces"],
    });
    records.equipment.push({ ...i.equipment[0]! });
    expect(get(run(records).answers, "servingware.source").missing).toEqual([
      'Rental "10in china plate" means rented pieces, but the day sheet says no rentals.',
    ]);
  });

  it("dessert joins menu, service, staffing, equipment and the accepted proposal", () => {
    const ok = get(run(input()).answers, "dessert.plan");
    expect(ok.result).toBe("answered");
    expect(ok.sources).toContainEqual({
      table: "serviceStyleKitItems",
      id: "kit-1",
      version: 1,
    });
    // No coffee urn or airpot anywhere.
    const noUrn = input();
    noUrn.kitItems = [];
    expect(get(run(noUrn).answers, "dessert.plan").missing).toEqual([
      "Mangia runs the coffee bar, but no coffee urn or airpot is reserved or packed.",
    ]);
    // No staff asked for or assigned.
    const noStaff = input();
    noStaff.assignments = [];
    expect(get(run(noStaff).answers, "dessert.plan").missing).toEqual([
      "Mangia serves dessert, but no staff are asked for or assigned on this event.",
    ]);
    noStaff.staffNeeds.push({
      id: "need-1",
      version: 1,
      role: "Server",
      status: "open",
    });
    expect(get(run(noStaff).answers, "dessert.plan").result).toBe("answered");
    // The proposal sells a dessert the menu does not have.
    const sold = input();
    sold.proposal = {
      id: "prop-1",
      version: 1,
      lines: [
        {
          id: "x-1",
          version: 1,
          table: "proposalEnhancements",
          text: "Espresso bar",
          related: [],
        },
      ],
    };
    sold.dishes = sold.dishes.filter((d) => d.course !== "Dessert");
    sold.event.text.beveragesOnMenu = "Lemonade";
    sold.event.text.dessertService = null;
    expect(get(run(sold).answers, "dessert.plan")).toMatchObject({
      result: "unresolved",
      missing: [
        'Accepted proposal line "Espresso bar" is not on the event menu.',
      ],
    });
    // Cake cutting sold for the client's own cake: Mangia cuts it.
    const cutting = input();
    cutting.dishes = cutting.dishes.filter((d) => d.course !== "Dessert");
    cutting.event.text.beveragesOnMenu = "Lemonade";
    cutting.proposal = {
      id: "prop-1",
      version: 1,
      lines: [
        {
          id: "c-1",
          version: 1,
          table: "proposalLineItems",
          text: "Cake cutting",
          related: [],
        },
      ],
    };
    expect(get(run(cutting).answers, "dessert.plan").value).toMatchObject({
      type: "record",
      fields: { cutting: "Mangia", serving: "Mangia" },
    });
    cutting.event.text.dessertService = "Client";
    expect(get(run(cutting).answers, "dessert.plan").missing).toEqual([
      'The accepted proposal sells cake cutting, but dessert service says "Client".',
    ]);
  });

  it("an answer-only or policy-only change makes readiness unresolved and keeps the stale outcome", () => {
    const base = allConfirmed(input());
    const printed = printedAt(run(base), "rev-1");
    const current = run(base, { printed });
    expect(current.outcome).toBe("clear");
    expect(get(current.answers, "readiness.dispatch").result).toBe("answered");
    // Only a Final Lock answer changes; the packet fingerprint does not.
    const rain = allConfirmed(input());
    rain.event.text.rainPlan = "Tent on the lawn";
    const answerOnly = run(rain, { printed });
    expect(answerOnly.outcome).toBe("stale");
    expect(get(answerOnly.answers, "readiness.dispatch")).toMatchObject({
      result: "unresolved",
      missing: ["The printed event packet is out of date."],
    });
    // Only the policy version changes.
    const policyOnly = run(allConfirmed(input()), {
      printed,
      policyVersion: "next",
    });
    expect(policyOnly.staleQuestions).toEqual([]);
    expect(policyOnly.outcome).toBe("stale");
    expect(get(policyOnly.answers, "readiness.dispatch").result).toBe(
      "unresolved",
    );
    // An older print that showed no answers is out of date too.
    const legacy = run(allConfirmed(input()), { printed: null });
    expect(legacy.outcome).toBe("stale");
    expect(get(legacy.answers, "readiness.dispatch").result).toBe("unresolved");
  });

  it("every record an answer reads is in its basis: equipment, proposal and menu records", () => {
    const base = () => {
      const i = allConfirmed(input());
      i.equipment.push({
        id: "res-urn",
        version: 1,
        name: "Coffee urn",
        category: "Beverage",
        rented: false,
        quantity: 1,
        status: "reserved",
        shortBy: 0,
        item: { id: "equipment-urn", version: 1 },
      });
      i.dishes.push({
        id: "dish-coffee",
        version: 1,
        name: "Coffee service",
        course: "Beverage",
        serviceStyle: null,
        sortOrder: 9,
        quantityServings: 100,
        followsEventHeadcount: true,
        notes: null,
        dish: { id: "dish-record-coffee", version: 1 },
      });
      i.proposal = {
        id: "prop-1",
        version: 1,
        lines: [
          {
            id: "line-cake",
            version: 1,
            table: "proposalLineItems",
            text: "Cake cutting",
            related: [],
          },
          {
            id: "line-plates",
            version: 1,
            table: "proposalLineItems",
            text: "Rented china plates",
            related: [],
          },
          {
            id: "line-dessert",
            version: 1,
            table: "proposalDishSelections",
            text: "Dessert - Chocolate Cake",
            related: [{ table: "dishes", id: "dish-record-7", version: 1 }],
          },
        ],
      };
      return i;
    };
    const cases: [string, (i: FinalLockInput) => void, string[]][] = [
      [
        "equipment record",
        (i) => (i.equipment[0]!.item!.version = 2),
        ["vehicles.assigned", "dessert.plan"],
      ],
      [
        "accepted proposal",
        (i) => (i.proposal!.version = 2),
        ["servingware.source", "dessert.plan", "bussing.plan"],
      ],
      [
        "coffee menu line",
        (i) => (i.dishes.at(-1)!.version = 2),
        ["dessert.plan", "food.appetizer_placement"],
      ],
      [
        "coffee dish record",
        (i) => (i.dishes.at(-1)!.dish!.version = 2),
        ["dessert.plan", "food.appetizer_placement"],
      ],
      [
        "proposal dish record",
        (i) => (i.proposal!.lines[2]!.related[0]!.version = 2),
        ["dessert.plan"],
      ],
    ];
    const before = run(base()).answers;
    for (const [what, bump, keys] of cases) {
      const i = base();
      bump(i);
      const after = run(i).answers;
      for (const key of keys) {
        expect(get(after, key).value, `${what}: ${key}`).toEqual(
          get(before, key).value,
        );
        expect(get(after, key).basis, `${what}: ${key}`).not.toBe(
          get(before, key).basis,
        );
      }
    }
  });

  it("room setup and bussing read the accepted proposal and surface disagreements", () => {
    const i = input();
    i.event.text.guestTableSetup = null;
    i.proposal = {
      id: "prop-1",
      version: 1,
      lines: [
        {
          id: "l-tables",
          version: 1,
          table: "proposalLineItems",
          text: "Guest table and chair setup",
          related: [],
        },
        {
          id: "l-goblets",
          version: 1,
          table: "proposalEnhancements",
          text: "Water goblets provided by client",
          related: [],
        },
        {
          id: "l-buss",
          version: 1,
          table: "proposalLineItems",
          text: "Full bussing including glassware",
          related: [],
        },
      ],
    };
    const scoped = run(i).answers;
    expect(get(scoped, "room.guest_tables")).toMatchObject({
      result: "answered",
      value: { type: "choice", choice: "Mangia" },
      rule: "room.guest_tables.accepted-scope",
    });
    expect(get(scoped, "room.guest_tables").sources).toContainEqual({
      table: "proposalLineItems",
      id: "l-tables",
      version: 1,
    });
    expect(get(scoped, "room.water_goblets")).toMatchObject({
      result: "unresolved",
      missing: [
        'The task breakdown says Mangia sets the water goblets, but accepted proposal line "Water goblets provided by client" says Client.',
      ],
    });
    const none = input();
    none.event.text.guestTableSetup = "No";
    none.proposal = i.proposal;
    expect(get(run(none).answers, "room.guest_tables").missing).toEqual([
      'The task breakdown says no guest tables and chairs are needed, but accepted proposal line "Guest table and chair setup" includes them.',
    ]);
    // A blank bussing answer follows the contract; a different one clashes.
    expect(get(scoped, "bussing.plan")).toMatchObject({
      rule: "bussing.plan.contract-says",
      value: { type: "record", fields: { afterDinner: true, full: true } },
    });
    i.event.text.bussing = "After dinner";
    const clash = get(run(i).answers, "bussing.plan");
    expect(clash.missing).toEqual([
      'The event says bussing "After dinner", but accepted contract line "Full bussing including glassware" sells full bussing.',
    ]);
    expect(clash.sources).toContainEqual({
      table: "proposalLineItems",
      id: "l-buss",
      version: 1,
    });
    const noSale = input();
    noSale.event.text.bussing = "Full clear";
    noSale.proposal = { id: "prop-2", version: 1, lines: [] };
    expect(get(run(noSale).answers, "bussing.plan").missing).toEqual([
      "The event says full bussing, but the accepted contract does not sell it.",
    ]);
    // "No full bussing" is read as a no, never as full bussing.
    const line = (id: string, text: string) => ({
      id,
      version: 1,
      table: "proposalLineItems",
      text,
      related: [],
    });
    const notFull = input();
    notFull.event.text.bussing = null;
    notFull.proposal = {
      id: "prop-3",
      version: 1,
      lines: [line("l-nf", "No full bussing")],
    };
    expect(get(run(notFull).answers, "bussing.plan")).toMatchObject({
      result: "answered",
      rule: "bussing.plan.contract-says",
      value: { type: "record", fields: { afterDinner: true, full: false } },
    });
    const eventNotFull = input();
    eventNotFull.event.text.bussing = "No full bussing";
    expect(get(run(eventNotFull).answers, "bussing.plan").value).toEqual({
      type: "record",
      fields: { afterDinner: true, full: false },
    });
    // Contract lines that disagree are named, and the question stays open.
    for (const against of ["No full bussing", "No bussing"]) {
      const both = input();
      both.event.text.bussing = null;
      both.proposal = {
        id: "prop-4",
        version: 1,
        lines: [
          line("l-full", "Full bussing including glassware"),
          line("l-against", against),
        ],
      };
      const open = get(run(both).answers, "bussing.plan");
      expect(open.result).toBe("unresolved");
      expect(open.rule).toBe("bussing.plan.contract-lines-agree");
      expect(open.missing[0]).toContain('"Full bussing including glassware"');
      expect(open.missing[0]).toContain(`"${against}"`);
    }
    // Event full against a "No full bussing" line names that line.
    const eventFullVsNot = input();
    eventFullVsNot.event.text.bussing = "Full bussing";
    eventFullVsNot.proposal = {
      id: "prop-5",
      version: 1,
      lines: [line("l-nf", "No full bussing")],
    };
    expect(get(run(eventFullVsNot).answers, "bussing.plan")).toMatchObject({
      result: "unresolved",
      rule: "bussing.plan.contract-agrees",
      missing: [
        'The event says full bussing ("Full bussing"), but accepted contract line "No full bussing" says no full bussing.',
      ],
    });
    // Every disagreeing line is named, on both sides.
    const many = input();
    many.event.text.bussing = null;
    many.proposal = {
      id: "prop-6",
      version: 1,
      lines: [
        line("l-full-1", "Full bussing including glassware"),
        line("l-full-2", "Full bussing of all tables"),
        line("l-nf", "No full bussing"),
        line("l-none", "No bussing"),
      ],
    };
    expect(get(run(many).answers, "bussing.plan").missing).toEqual([
      'Accepted contract line "Full bussing including glassware" sells full bussing, but line "No full bussing" says no full bussing.',
      'Accepted contract line "Full bussing including glassware" sells full bussing, but line "No bussing" says no bussing.',
      'Accepted contract line "Full bussing of all tables" sells full bussing, but line "No full bussing" says no full bussing.',
      'Accepted contract line "Full bussing of all tables" sells full bussing, but line "No bussing" says no bussing.',
    ]);
    const eventFullVsMany = input();
    eventFullVsMany.event.text.bussing = "Full bussing";
    eventFullVsMany.proposal = {
      id: "prop-7",
      version: 1,
      lines: [line("l-nf", "No full bussing"), line("l-none", "No bussing")],
    };
    expect(get(run(eventFullVsMany).answers, "bussing.plan").missing).toEqual([
      'The event says full bussing ("Full bussing"), but accepted contract line "No full bussing" says no full bussing.',
      'The event says full bussing ("Full bussing"), but accepted contract line "No bussing" says no bussing.',
    ]);
  });

  it("a print matches itself once recorded: every printed line, readiness and field forms included", () => {
    // Print before any revision exists, then record it as the latest.
    const before = allConfirmed(input());
    before.packet.latestRevisionId = null;
    before.confirmations = {};
    const first = run(before);
    const printed = printedAt(first, "rev-1");
    expect(Object.keys(printed.answers).sort()).toEqual(
      QUESTIONS.map((q) => q.key).sort(),
    );
    const after = allConfirmed(input());
    after.confirmations = {};
    const recorded = run(after, { printed });
    expect(recorded.staleQuestions).toEqual([]);
    expect(recorded.outcome).not.toBe("stale");
    expect(get(recorded.answers, "readiness.dispatch").result).toBe("answered");
    expect(recorded.print).toEqual(first.print);
    // Field work done after the print does not make the paper wrong.
    const done = run(allConfirmed(input()), { printed });
    expect(done.staleQuestions).toEqual([]);
    expect(done.outcome).toBe("clear");
    // A later change to the printed readiness line makes the print stale.
    const unlocked = allConfirmed(input());
    unlocked.event.salesLockedAt = null;
    const reopened = run(unlocked, { printed });
    expect(reopened.staleQuestions).toEqual(["readiness.dispatch"]);
    expect(reopened.outcome).toBe("stale");
    // A printed line the policy no longer asks is a change too.
    const extra = {
      ...printed,
      answers: { ...printed.answers, "field.retired": "x" },
    };
    expect(
      run(allConfirmed(input()), { printed: extra }).staleQuestions,
    ).toEqual(["field.retired"]);
  });

  it("identity reads the names the event was booked with; a later catalog rename is not a clash; zero is a real price", () => {
    const i = input();
    i.serviceStyle!.name = "Full Service Deluxe";
    i.client!.name = "Ashley Smith-Jones";
    const answers = run(i).answers;
    expect(get(answers, "identity.service_style")).toMatchObject({
      result: "answered",
      value: { type: "choice", choice: "Full Service" },
    });
    expect(get(answers, "identity.customer")).toMatchObject({
      result: "answered",
      value: { type: "choice", choice: "Ashley Smith" },
    });
    expect(get(answers, "identity.billing").value).toEqual({
      type: "record",
      fields: { billTo: "Ashley Smith", quotedPrice: 5000 },
    });
    // No snapshot yet: the linked records answer it.
    const live = input();
    live.event.clientName = null;
    live.event.serviceStyleName = null;
    expect(get(run(live).answers, "identity.customer").value).toEqual({
      type: "choice",
      choice: "Ashley Smith",
    });
    expect(get(run(live).answers, "identity.service_style").value).toEqual({
      type: "choice",
      choice: "Full Service",
    });
    // A comped event has a real price of zero.
    const comped = input();
    comped.event.quotedPrice = 0;
    expect(get(run(comped).answers, "identity.billing")).toMatchObject({
      result: "answered",
      value: { fields: { quotedPrice: 0 } },
    });
    for (const bad of [null, Number.NaN, -1]) {
      const b = input();
      b.event.quotedPrice = bad;
      expect(get(run(b).answers, "identity.billing").missing).toEqual([
        "No quoted price on the event.",
      ]);
    }
  });

  it("one line identity: a new override reason on the same value makes the printed line stale", () => {
    const i = allConfirmed(input());
    i.event.text.buffetHotPlates =
      "Chicken Marsala, Green Beans, Roasted Potatoes";
    const open = get(run(i).answers, "buffet.arrangement");
    const decide = (reason: string, at: string): StoredOverride => ({
      questionKey: "buffet.arrangement",
      basedOn: open.basis,
      value: { type: "text", text: "Chicken first" },
      reason,
      actor: "user-manager",
      at,
    });
    const first = decide("The couple asked for it", "2026-10-09T12:00:00Z");
    const printed = printedAt(run(i, { overrides: [first] }), "rev-1");
    const same = run(i, { overrides: [first], printed });
    expect(same.staleQuestions).toEqual([]);
    expect(get(same.answers, "buffet.arrangement").displayedInRevision).toBe(
      "rev-1",
    );
    const second = decide("The planner asked for it", "2026-10-09T13:00:00Z");
    const later = run(i, { overrides: [first, second], printed });
    expect(later.staleQuestions).toEqual(["buffet.arrangement"]);
    expect(later.outcome).toBe("stale");
    expect(
      get(later.answers, "buffet.arrangement").displayedInRevision,
    ).toBeNull();
  });

  it("a field form completed after the print is not the answer the print showed", () => {
    const blank = input();
    const printed = printedAt(run(blank), "rev-1");
    const before = run(input(), { printed });
    expect(get(before.answers, "field.arrival").displayedInRevision).toBe(
      "rev-1",
    );
    const done = input();
    done.confirmations["field.arrival"] = {
      actor: "user-crew",
      at: "2026-10-10T16:00:00Z",
      source: {
        table: "eventPacketResolutions",
        id: "done-arrival",
        version: null,
      },
    };
    const after = run(done, { printed });
    expect(after.staleQuestions).toEqual([]);
    expect(get(after.answers, "field.arrival").displayedInRevision).toBeNull();
    expect(get(after.answers, "field.leaving-shop").displayedInRevision).toBe(
      "rev-1",
    );
  });

  it("completed field forms and the two-person check name the records they were read from", () => {
    const answers = run(allConfirmed(input())).answers;
    expect(get(answers, "field.arrival").sources).toEqual([
      {
        table: "eventPacketResolutions",
        id: "done-field.arrival",
        version: null,
      },
    ]);
    const readiness = get(answers, "readiness.dispatch").sources;
    expect(readiness).toContainEqual({
      table: "eventPacketResolutions",
      id: "sig-w",
      version: null,
    });
    expect(readiness).toContainEqual({
      table: "eventPacketResolutions",
      id: "sig-l",
      version: null,
    });
    // A different sign-off record behind the same check changes the basis.
    const resigned = allConfirmed(input());
    resigned.packet.signoffs[1]!.source = {
      table: "eventPacketResolutions",
      id: "sig-l-2",
      version: null,
    };
    expect(get(run(resigned).answers, "readiness.dispatch").basis).not.toBe(
      get(answers, "readiness.dispatch").basis,
    );
  });
});
