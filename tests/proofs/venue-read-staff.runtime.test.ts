/**
 * Runtime proof (#124): venues are shared operational context, read by every
 * staff role like the event plan. Finance staff see venues (revenue reports
 * group by venue instead of "Unknown"); sales and drivers see them too.
 * Another company's staff still see none, and only event staff change them.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-venue-read-staff";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: every staff role reads venues (#124)", () => {
  it("finance, sales and drivers see the company's venues; outsiders do not", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const as = (role: string, tenantId = TENANT) =>
      proof.asRole({
        subject: `venue-read-${role}-${tenantId}`,
        role,
        tenantId,
      });
    const owner = as("owner");
    await owner.mutation(api.mutations.Venue_createViaRegister, {
      name: "Harbor Hall",
      venueType: "other",
      capacity: 90,
    });

    for (const role of ["finance_staff", "sales_staff", "driver"]) {
      const venues = (await as(role).query(api.queries.listVenue, {})) as {
        name: string;
      }[];
      expect(venues.map((v) => v.name)).toEqual(["Harbor Hall"]);
    }
    const outsider = (await as("owner", "tenant-venue-read-other").query(
      api.queries.listVenue,
      {},
    )) as unknown[];
    expect(outsider).toEqual([]);

    // Reading is wider; changing venues stays with event staff.
    await expect(
      as("finance_staff").mutation(api.mutations.Venue_createViaRegister, {
        name: "Finance Hall",
        venueType: "other",
        capacity: 90,
      }),
    ).rejects.toThrow();
  }, 60_000);
});
