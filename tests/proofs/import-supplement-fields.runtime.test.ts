/**
 * Runtime proof (PL-SOURCE-DATASETS, AC-063): imported birthdays, venue
 * supplements and staff addresses land in their owning records and show
 * "Not recorded" when absent - nothing made up.
 * - Staff: the old system's staff list is read with its Address column, the
 *   same Person commands the Team roles screen runs save it, and the Staff
 *   Address & Phone List report prints it; a person with no address on the
 *   list (the real export has none) prints "Not recorded".
 * - Venues: load-in, parking, access and catering notes each print on the
 *   Venue Detail report; a venue without them prints "Not recorded".
 * - Birthdays: the Birthday List names only clients with a birthday on file.
 * Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { readTppStaffList } from "../../src/lib/tppStaffList";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const tenantId = "tenant-import-supplement-fields";
const day = Date.UTC(2026, 8, 20);

/** The real export's heading row, one row with an address, one without. */
const STAFF_GRID = [
  ["Active Staff Address & Phone List", "", "", ""],
  ["Staff Member", "Home", "Mobile", "Email", "Address"],
  [
    "Rivers, Dana",
    "",
    "(208) 555-0101",
    "dana@example.test",
    "12 Oak Street Spokane WA 99201",
  ],
  ["Mitchell, Tim", "(208) 555-0102", "", "tim@example.test", ""],
];

describe("runtime proof: supplement fields land and absent ones read Not recorded (AC-063)", () => {
  it("staff addresses, venue supplements and birthdays print from their records", async () => {
    const owner = harness().asRole({
      subject: "supplement-owner",
      role: "owner",
      tenantId,
    });

    const rows = readTppStaffList(STAFF_GRID);
    expect(rows.map((row) => row.address)).toEqual([
      "12 Oak Street Spokane WA 99201",
      undefined,
    ]);
    for (const row of rows) {
      const created = (await owner.mutation(
        api.mutations.Person_createViaHire,
        {
          givenName: row.givenName,
          familyName: row.familyName,
          email: row.email!,
          role: "staff",
          ...(row.phone ? { phone: row.phone } : {}),
        },
      )) as { docId: string };
      if (row.address) {
        await owner.mutation(api.mutations.Person_changeAddress, {
          docId: created.docId as never,
          addressLine1: row.address,
        });
      }
    }

    const staff = (await owner.query(api.tppReports.general.run, {
      reportId: "staff-address-phone-list",
      parameters: {},
    })) as { rows: { values: Record<string, unknown> }[] };
    const byName = new Map(
      staff.rows.map((row) => [row.values.staff, row.values]),
    );
    expect(byName.get("Dana Rivers")?.address).toBe(
      "12 Oak Street Spokane WA 99201",
    );
    expect(byName.get("Tim Mitchell")?.address).toBe("Not recorded");

    const [fullVenue, bareVenue] = await owner.run(async (ctx) => {
      const base = { tenantId, version: 1, createdAt: day, updatedAt: day };
      const insert = (doc: Record<string, unknown>) =>
        ctx.db.insert("venues", {
          ...base,
          venueType: "other",
          capacity: 0,
          status: "active",
          ...doc,
        } as never);
      const full = await insert({
        name: "Lake Lodge",
        loadInInstructions: "Back door by the dock",
        logisticsNotes: "Gravel lot, 20 cars",
        accessNotes: "Area: North Idaho",
        cateringNotes: "No open flame",
      });
      const bare = await insert({ name: "Empty Barn" });
      await ctx.db.insert("clients", {
        ...base,
        clientType: "person",
        givenName: "Bea",
        familyName: "Born",
        birthday: "1990-04-12",
        taxExempt: false,
        paymentTermsDays: 30,
        status: "active",
      } as never);
      await ctx.db.insert("clients", {
        ...base,
        clientType: "person",
        givenName: "Nora",
        familyName: "Nodate",
        taxExempt: false,
        paymentTermsDays: 30,
        status: "active",
      } as never);
      return [String(full), String(bare)];
    });

    const detail = async (venueId: string) => {
      const report = (await owner.query(api.tppReports.general.run, {
        reportId: "venue-detail",
        parameters: { venueId },
      })) as { sections: { rows: { label: string; value: string }[] }[] };
      return Object.fromEntries(
        report.sections[0]!.rows.map((row) => [row.label, row.value]),
      );
    };
    expect(await detail(fullVenue)).toMatchObject({
      "Directions / load-in": "Back door by the dock",
      Parking: "Gravel lot, 20 cars",
      Access: "Area: North Idaho",
      "Special notes": "No open flame",
    });
    expect(await detail(bareVenue)).toMatchObject({
      Address: "Not recorded",
      "Directions / load-in": "Not recorded",
      Parking: "Not recorded",
      Access: "Not recorded",
      "Special notes": "Not recorded",
    });

    const birthdays = JSON.stringify(
      await owner.query(api.tppReports.contacts.run, {
        reportId: "birthday-list",
        parameters: {},
      }),
    );
    expect(birthdays).toContain("Bea Born");
    expect(birthdays).not.toContain("Nora Nodate");
  });
});
