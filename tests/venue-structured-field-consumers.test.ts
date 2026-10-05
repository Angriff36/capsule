/**
 * AC-313 (CF-8.1-02): every structured venue fact - a yes/no, a count, a
 * kind, a time - is used somewhere other than the venue's own page: the
 * venue filter, the proposal, packing, the day sheet / crew, routes or the
 * capacity planner. Free text stays for context. A new structured field with
 * no consumer fails here.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/** Venue properties in the manifest, with their declared type. */
function venueProperties(): Array<{ name: string; type: string }> {
  const source = read("src/operations/event.manifest");
  const start = source.indexOf("entity Venue mixin");
  const end = source.indexOf("store Venue in durable", start);
  const body = source.slice(start, end);
  return [
    ...body.matchAll(
      /^\s*property (?:required )?(?:searchable )?(?:encrypted )?(\w+): (\w+)/gm,
    ),
  ].map(([, name, type]) => ({ name, type }));
}

// Record keeping, not operating facts.
const BOOKKEEPING = new Set(["status", "registeredAt", "deactivatedAt"]);
const STRUCTURED_TYPES = new Set(["boolean", "int", "float", "VenueType"]);
// Clock fields are stored as "HH:MM" text but drive the load-in window.
const CLOCK_FIELDS = new Set(["loadInFrom", "loadOutBy", "timeZone"]);

const CONSUMERS: Record<string, string> = {
  filter: "src/features/facilities/venueOperatingFacts.ts",
  capacityPlanner: "src/features/events/eventCapacityPlanner.ts",
  // The venue copy frozen into proposals and finished events.
  proposal: "convex/lib/venueFactsSnapshot.ts",
  packing: "convex/lib/packRuleReconciliation.ts",
  daySheet: "convex/eventDayBriefing.ts",
  routes: "src/lib/routeFacts.ts",
  weather: "src/features/events/eventWeather.ts",
  // The Venue partners list grades and sorts partners by their scores.
  partners: "src/features/facilities/venuePartnership.ts",
};

describe("structured venue facts have a consumer outside the venue page", () => {
  const fields = venueProperties().filter(
    (field) =>
      !BOOKKEEPING.has(field.name) &&
      (STRUCTURED_TYPES.has(field.type) || CLOCK_FIELDS.has(field.name)),
  );

  it("finds the structured fields", () => {
    const names = fields.map((field) => field.name);
    for (const expected of [
      "capacity",
      "seatedCapacity",
      "standingCapacity",
      "hasOven",
      "hasRefrigeration",
      "loadInFrom",
      "loadOutBy",
      "onPremise",
      "parkingAvailable",
      "hasStairs",
    ]) {
      expect(names).toContain(expected);
    }
  });

  const sources = Object.fromEntries(
    Object.entries(CONSUMERS).map(([label, path]) => [label, read(path)]),
  );

  it.each(fields.map((field) => [field.name]))(
    "%s is read by a filter, proposal, packing, crew or planning consumer",
    (name) => {
      const pattern = new RegExp(`\\.${name}\\b`);
      const users = Object.entries(sources)
        .filter(([, source]) => pattern.test(source))
        .map(([label]) => label);
      expect(
        users,
        `${name} has no consumer outside the venue page`,
      ).not.toEqual([]);
    },
  );
});
