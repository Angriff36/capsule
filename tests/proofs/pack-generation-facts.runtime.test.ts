/**
 * Runtime proof (PL-PACK-RULES): every event fact that asks for equipment
 * puts it on the pack list through the pack-rule seam, with its sources.
 * AC-380 (notes + venue facts), AC-528 (dish needs scaled by servings),
 * AC-529 (dish note rules), AC-530 (service style kit + style rule),
 * AC-531 (guest count + spare), AC-532 (venue and setup facts),
 * AC-533 (bar kit once).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  addDish,
  createPlannedEvent,
  defineRule,
  harness,
  line,
  openPackList,
  packLines,
  rolesFor,
  runner,
  sources,
  version,
} from "./pack-rules.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: pack lines from event facts", () => {
  it("dish serving-vessel and utensil requirements generate scaled pack lines (AC-528)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-dish-facts";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(proof, tenantId, "Dish facts");
    const piccata = await addDish(
      proof,
      tenantId,
      eventId,
      "Chicken piccata",
      40,
    );
    await defineRule(proof, tenantId, {
      trigger: "dish",
      dishId: piccata.dishId,
      description: "Serving tongs",
      category: "utensil",
      scaleBy: "servings",
      perUnits: 20,
      baseQuantity: 0,
    });
    await defineRule(proof, tenantId, {
      trigger: "dish",
      dishId: piccata.dishId,
      description: "Hotel pan",
      category: "holding",
      scaleBy: "servings",
      perUnits: 10,
      baseQuantity: 1,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Dish facts list",
    );

    let lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Serving tongs").requiredQuantity).toBe(2);
    expect(line(lines, "Serving tongs").category).toBe("utensil");
    expect(line(lines, "Hotel pan").requiredQuantity).toBe(5);
    const pan = sources(line(lines, "Hotel pan"));
    expect(pan).toHaveLength(1);
    expect(pan[0]).toMatchObject({
      sourceType: "dish",
      sourceId: piccata.eventDishId,
      ruleVersion: 1,
      quantity: 5,
    });
    expect(pan[0]!.formula).toContain("40 servings");

    await runner(proof, roles.events)(M.EventDish_adjustServings, {
      docId: piccata.eventDishId,
      quantityServings: 60,
      version: await version(roles.owner, piccata.eventDishId),
    });
    lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Serving tongs").requiredQuantity).toBe(3);
    expect(line(lines, "Hotel pan").requiredQuantity).toBe(7);
  });

  it("a configured note rule adds exactly the cones (or side-service set) scaled to the dish (AC-529)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-note-rules";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(proof, tenantId, "Note rules");
    const fries = await addDish(
      proof,
      tenantId,
      eventId,
      "Fries",
      50,
      "Fries in cones, extra salt",
    );
    await addDish(proof, tenantId, eventId, "Roast potatoes", 50);
    const salad = await addDish(
      proof,
      tenantId,
      eventId,
      "Caesar salad",
      30,
      "Dressing on the side",
    );
    await defineRule(proof, tenantId, {
      trigger: "production_note",
      matchText: "in cones",
      description: "Paper cones",
      category: "disposable",
      scaleBy: "servings",
      perUnits: 1,
      baseQuantity: 0,
      sparePercent: 10,
      returnRequired: false,
    });
    for (const description of ["Souffle cup", "Souffle lid"])
      await defineRule(proof, tenantId, {
        trigger: "production_note",
        matchText: "on the side",
        description,
        category: "disposable",
        scaleBy: "servings",
        perUnits: 1,
        baseQuantity: 0,
        returnRequired: false,
      });
    await defineRule(proof, tenantId, {
      trigger: "production_note",
      matchText: "on the side",
      description: "Dressing ladle",
      category: "utensil",
      baseQuantity: 1,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Note list",
    );

    let lines = await packLines(roles.owner, tenantId, packListId);
    const cones = line(lines, "Paper cones");
    expect(cones.requiredQuantity).toBe(55);
    expect(sources(cones).map((s) => s.sourceId)).toEqual([fries.eventDishId]);
    expect(line(lines, "Souffle cup").requiredQuantity).toBe(30);
    expect(line(lines, "Souffle lid").requiredQuantity).toBe(30);
    expect(line(lines, "Dressing ladle").requiredQuantity).toBe(1);
    expect(sources(line(lines, "Souffle cup"))[0]!.sourceId).toBe(
      salad.eventDishId,
    );

    // The note changes: the cones go, nothing else moves.
    await runner(proof, roles.events)(M.EventDish_updateInstructions, {
      docId: fries.eventDishId,
      specialInstructions: "Extra salt",
      version: await version(roles.owner, fries.eventDishId),
    });
    lines = await packLines(roles.owner, tenantId, packListId);
    const gone = line(lines, "Paper cones");
    expect(gone.requiredQuantity).toBe(0);
    expect(gone.retiredAt).toEqual(expect.any(Number));
    expect(line(lines, "Souffle cup").requiredQuantity).toBe(30);
  });

  it("a soft-ground venue with rain plan generates flooring, tarp and handwash pack lines (AC-532)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-venue-facts";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Venue facts",
    );
    await defineRule(proof, tenantId, {
      trigger: "event_fact",
      matchFact: "venueSurface",
      matchText: "grass",
      description: "Flooring panels",
      category: "flooring",
      baseQuantity: 8,
      requiredCapability: true,
    });
    await defineRule(proof, tenantId, {
      trigger: "event_fact",
      matchFact: "rainPlan",
      description: "Tarps",
      category: "weather",
      baseQuantity: 4,
    });
    await defineRule(proof, tenantId, {
      trigger: "event_fact",
      matchFact: "handwashing",
      description: "Handwashing station",
      category: "handwashing",
      baseQuantity: 1,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Venue list",
    );
    expect(await packLines(roles.owner, tenantId, packListId)).toHaveLength(0);

    await runner(proof, roles.events)(M.Event_updateSetupNotes, {
      docId: eventId,
      venueSurface: "Grass lawn",
      rainPlan: "Tent on standby",
      handwashing: "Yes, none on site",
      version: await version(roles.owner, eventId),
    });
    let lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Flooring panels").requiredQuantity).toBe(8);
    expect(line(lines, "Flooring panels").requiredCapability).toBe(true);
    expect(line(lines, "Tarps").requiredQuantity).toBe(4);
    expect(line(lines, "Handwashing station").requiredQuantity).toBe(1);
    expect(sources(line(lines, "Tarps"))[0]).toMatchObject({
      sourceType: "event_fact",
    });

    // A "No" answer asks for nothing; paved ground needs no flooring.
    await runner(proof, roles.events)(M.Event_updateSetupNotes, {
      docId: eventId,
      venueSurface: "Concrete patio",
      handwashing: "No",
      version: await version(roles.owner, eventId),
    });
    lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Flooring panels").retiredAt).toEqual(
      expect.any(Number),
    );
    expect(line(lines, "Handwashing station").requiredQuantity).toBe(0);
    expect(line(lines, "Tarps").requiredQuantity).toBe(4);
  });

  it("an event with bar service ensures the bar kit lines once (AC-533)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-bar-kit";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(proof, tenantId, "Bar kit");
    await defineRule(proof, tenantId, {
      trigger: "event_fact",
      matchFact: "barService",
      matchText: "bar",
      description: "Bar tool kit",
      category: "bar",
      baseQuantity: 1,
    });
    await defineRule(proof, tenantId, {
      trigger: "event_fact",
      matchFact: "barService",
      matchText: "bar",
      description: "Ice",
      category: "ice",
      scaleBy: "guests",
      perUnits: 10,
      baseQuantity: 2,
      returnRequired: false,
    });
    await defineRule(proof, tenantId, {
      trigger: "event_fact",
      matchFact: "beverageDispensers",
      description: "Drink dispenser",
      category: "bar",
      baseQuantity: 2,
    });
    const packListId = await openPackList(proof, tenantId, eventId, "Bar list");
    const daySheet = {
      barService: "Full bar - Mangia",
      beveragesOnMenu: "Wine, beer",
    };
    await runner(proof, roles.events)(M.Event_updateDaySheet, {
      docId: eventId,
      ...daySheet,
      version: await version(roles.owner, eventId),
    });
    await runner(proof, roles.events)(M.Event_updateTaskBreakdown, {
      docId: eventId,
      beverageDispensers: "Lemonade and iced tea",
      version: await version(roles.owner, eventId),
    });
    const first = await packLines(roles.owner, tenantId, packListId);
    expect(first.map((row) => row.description)).toEqual([
      "Bar tool kit",
      "Drink dispenser",
      "Ice",
    ]);
    expect(line(first, "Ice").requiredQuantity).toBe(6);
    expect(line(first, "Ice").returnRequired).toBe(false);

    // Saving the same answers again adds and changes nothing.
    await runner(proof, roles.events)(M.Event_updateDaySheet, {
      docId: eventId,
      ...daySheet,
      version: await version(roles.owner, eventId),
    });
    const again = await packLines(roles.owner, tenantId, packListId);
    expect(again).toHaveLength(3);
    expect(again.map((row) => [row._id, row.version])).toEqual(
      first.map((row) => [row._id, row.version]),
    );
  });

  it("raising headcount rescales guestsPerUnit kit lines and applies the configured spare percentage (AC-531)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-guest-count";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Guest count",
    );
    const style = await runner(proof, roles.owner)(
      M.ServiceStyle_createViaRegister,
      { name: "Buffet", code: "BUF" },
    );
    await runner(proof, roles.logistics)(M.ServiceStyleKitItem_createViaAdd, {
      serviceStyleId: style.docId,
      description: "Chafing dish",
      guestsPerUnit: 10,
      sparePercent: 20,
    });
    await defineRule(proof, tenantId, {
      trigger: "guest_count",
      description: "Dinner napkins",
      category: "place_setting",
      scaleBy: "guests",
      perUnits: 1,
      baseQuantity: 0,
      sparePercent: 10,
      returnRequired: false,
    });
    await runner(proof, roles.events)(M.Event_changeServiceStyle, {
      docId: eventId,
      serviceStyleId: style.docId,
      serviceStyleName: "Buffet",
      version: await version(roles.owner, eventId),
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Guest list",
    );
    let lines = await packLines(roles.owner, tenantId, packListId);
    // 40 guests: 4 chafers + 20% = 5; 40 napkins + 10% = 44.
    expect(line(lines, "Chafing dish").requiredQuantity).toBe(5);
    expect(line(lines, "Dinner napkins").requiredQuantity).toBe(44);

    await runner(proof, roles.events)(M.Event_changeHeadcount, {
      docId: eventId,
      newHeadcount: 60,
      version: await version(roles.owner, eventId),
    });
    lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Chafing dish").requiredQuantity).toBe(8);
    expect(line(lines, "Dinner napkins").requiredQuantity).toBe(66);
    expect(sources(line(lines, "Dinner napkins"))[0]!.formula).toContain(
      "+10% spare",
    );
  });

  it("service style kits and style rules generate presentation lines (AC-530)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-style-kit";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(proof, tenantId, "Style kit");
    const buffet = await runner(proof, roles.owner)(
      M.ServiceStyle_createViaRegister,
      { name: "Buffet", code: "BUF" },
    );
    const plated = await runner(proof, roles.owner)(
      M.ServiceStyle_createViaRegister,
      { name: "Plated", code: "PLT" },
    );
    await runner(proof, roles.logistics)(M.ServiceStyleKitItem_createViaAdd, {
      serviceStyleId: buffet.docId,
      description: "Buffet table skirt",
      baseQuantity: 2,
    });
    await defineRule(proof, tenantId, {
      trigger: "service_style",
      serviceStyleId: buffet.docId,
      description: "Sneeze guard",
      category: "table_setup",
      baseQuantity: 3,
    });
    await defineRule(proof, tenantId, {
      trigger: "service_style",
      serviceStyleId: plated.docId,
      description: "Plate covers",
      category: "serving_vessel",
      scaleBy: "guests",
      perUnits: 1,
      baseQuantity: 0,
    });
    await runner(proof, roles.events)(M.Event_changeServiceStyle, {
      docId: eventId,
      serviceStyleId: buffet.docId,
      serviceStyleName: "Buffet",
      version: await version(roles.owner, eventId),
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Style list",
    );
    let lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Buffet table skirt").requiredQuantity).toBe(2);
    expect(line(lines, "Sneeze guard").requiredQuantity).toBe(3);
    expect(sources(line(lines, "Sneeze guard"))[0]).toMatchObject({
      sourceType: "service_style",
      sourceId: buffet.docId,
    });

    await runner(proof, roles.events)(M.Event_changeServiceStyle, {
      docId: eventId,
      serviceStyleId: plated.docId,
      serviceStyleName: "Plated",
      version: await version(roles.owner, eventId),
    });
    lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Sneeze guard").retiredAt).toEqual(expect.any(Number));
    expect(line(lines, "Plate covers").requiredQuantity).toBe(40);
  });

  it("production notes and venue facts generate pack items (AC-380)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-all-facts";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(proof, tenantId, "All facts");
    await addDish(proof, tenantId, eventId, "Fries", 40, "Fries in cones");
    await defineRule(proof, tenantId, {
      trigger: "production_note",
      matchText: "cones",
      description: "Paper cones",
      category: "disposable",
      scaleBy: "servings",
      perUnits: 1,
      baseQuantity: 0,
      returnRequired: false,
    });
    await defineRule(proof, tenantId, {
      trigger: "event_fact",
      matchFact: "tentAndFlooring",
      matchText: "tent",
      description: "Tent weights",
      category: "tent",
      baseQuantity: 8,
    });
    await defineRule(proof, tenantId, {
      trigger: "guest_count",
      description: "Cocktail napkins",
      category: "disposable",
      scaleBy: "guests",
      perUnits: 1,
      baseQuantity: 0,
      returnRequired: false,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "All facts list",
    );
    await runner(proof, roles.events)(M.Event_updateSetupNotes, {
      docId: eventId,
      tentAndFlooring: "20x40 tent, no floor",
      version: await version(roles.owner, eventId),
    });
    const lines = await packLines(roles.owner, tenantId, packListId);
    expect(lines.map((row) => [row.description, row.requiredQuantity])).toEqual(
      [
        ["Cocktail napkins", 40],
        ["Paper cones", 40],
        ["Tent weights", 8],
      ],
    );
    for (const row of lines) {
      expect(row.generationKey).toEqual(expect.any(String));
      expect(sources(row).length).toBeGreaterThan(0);
    }
  });
});
