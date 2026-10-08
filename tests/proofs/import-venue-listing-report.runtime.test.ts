/**
 * Runtime proof (AC-057 venues): TPP's "Venue Listing" report comes in
 * through the file box's "Venues" kind.
 *
 * - The reader skips the title, the heading row printed again on every page
 *   and the "Printed Date:" lines; each "Area:" line goes to the access notes
 *   of the venue above it; "*Unassigned*" is no address, and then a name that
 *   starts with a number is the address.
 * - Every row becomes a venue with its address, city, state, zip and phone;
 *   running the same file again makes nothing twice. Made-up venues only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import {
  TPP_VENUE_LISTING_COLUMNS,
  isVenueListingReport,
  venueListingRowsFromGrid,
} from "../../src/lib/tppReports/parseVenueListing";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5jqU=";
  }
});

type Row = Record<string, unknown> & { _id: string };

const row = (...cells: string[]) =>
  [...cells, ...Array.from({ length: 11 }, () => "")].slice(0, 11);
const venue = (
  name: string,
  address: string,
  city = "",
  state = "",
  zip = "",
  phone = "",
) => row(name, address, "", "", city, "", state, "", zip, phone);
const heading = venue(
  "Location",
  "Address",
  "City",
  "State",
  "Zip Code",
  "Phone Number",
);

const GRID = [
  row("Venue Listing"),
  heading,
  venue(
    "Lakeside Meadows",
    "100 E Lake Pkwy",
    "Spokane Valley",
    "WA",
    "99216",
    "(509) 555-0101",
  ),
  row("Area:", "Pavilion"),
  row("Area:", "Loading zone out front"),
  venue("2200 W Pine St, Spokane, WA 99201", "*Unassigned*"),
  row("Printed Date:", "9/4/2026", "Page", "", "", "1 of 2"),
  heading,
  venue("Hilltop Barn", "*Unassigned*", "Hayden", "ID", "83835"),
  // The real file prints some phones alone on the next line.
  row("(509) 555-0199"),
];

describe("runtime proof: TPP Venue Listing report import (AC-057)", () => {
  it("reads the report into venue rows and makes each venue once", async () => {
    expect(isVenueListingReport(GRID)).toBe(true);
    expect(TPP_VENUE_LISTING_COLUMNS.map((c) => c.column)).toEqual([
      "Location",
      "Address",
      "City",
      "State",
      "Zip Code",
      "Phone Number",
      "Area:",
    ]);
    const rows = venueListingRowsFromGrid(GRID);
    expect(rows).toEqual([
      {
        VenueName: "Lakeside Meadows",
        Address: "100 E Lake Pkwy",
        City: "Spokane Valley",
        State: "WA",
        ZipCode: "99216",
        ContactPhone: "(509) 555-0101",
        AccessNotes: "Area: Pavilion; Loading zone out front",
      },
      {
        VenueName: "2200 W Pine St, Spokane, WA 99201",
        Address: "2200 W Pine St, Spokane, WA 99201",
      },
      {
        VenueName: "Hilltop Barn",
        City: "Hayden",
        State: "ID",
        ZipCode: "83835",
        ContactPhone: "(509) 555-0199",
      },
    ]);

    const tenantId = "tenant-venue-listing";
    const owner = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    }).asRole({ subject: "venue-listing-owner", role: "owner", tenantId });
    const importRows = (input: unknown[]) =>
      (
        owner as unknown as {
          action: (fn: unknown, args: unknown) => Promise<unknown>;
        }
      ).action(api.quickImport.importFile, {
        datasetType: "venues",
        sourceSystem: "tpp_legacy",
        rows: input,
      }) as Promise<{ committed: number; skipped: number; pending: number }>;
    const venues = async () =>
      ((await owner.query(api.queries.listVenue, {})) as Row[]).filter(
        (v) => v.deletedAt == null,
      );
    const first = await importRows(rows);
    expect(first).toMatchObject({ committed: 3, pending: 0 });
    const made = await venues();
    expect(made).toHaveLength(3);
    const lakeside = made.find((v) => v.name === "Lakeside Meadows")!;
    expect(lakeside).toMatchObject({
      city: "Spokane Valley",
      region: "WA",
      postalCode: "99216",
      accessNotes: "Area: Pavilion; Loading zone out front",
    });
    expect(String(lakeside.addressLine1)).toContain("100 E Lake Pkwy");

    const again = await importRows(rows);
    expect(again.committed).toBe(0);
    expect(await venues()).toHaveLength(3);
  });
});
