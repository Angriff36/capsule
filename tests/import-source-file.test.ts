/**
 * PL-SOURCE-DATASETS: an import run reads the old system's report file. The
 * sample has the exact headings of TPP's Address / Phone List report
 * (work/reports/ContactAddressPhoneList.xlsx, 3,314 rows) with made-up people.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  datasetReadsFile,
  sourceRowsFromGrid,
} from "../src/lib/importSourceFile";
import { parseCsv } from "../src/lib/tppMenuCsv";

const grid = parseCsv(
  readFileSync(
    new URL(
      "./fixtures/tpp-reports/address-phone-list-sample.csv",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("old system report file -> import rows", () => {
  it("matches printed headings to field names and keeps the rest as written", () => {
    const read = sourceRowsFromGrid(grid, "contacts");
    expect(read.matched).toEqual([
      { heading: "Company", field: "CompanyName" },
      { heading: "First Name", field: "FirstName" },
      { heading: "Last Name", field: "LastName" },
      { heading: "Address", field: "Address" },
      { heading: "City", field: "City" },
      { heading: "State", field: "State" },
      { heading: "Zip", field: "ZipCode" },
      { heading: "Phone", field: "Phone" },
      { heading: "Email", field: "Email" },
    ]);
    expect(read.keptAsWritten).toEqual(["Type", "Inactive", "Account"]);
    // The blank line is left out; empty cells are not sent.
    expect(read.rows).toHaveLength(6);
    expect(read.rows[0]).toEqual({
      FirstName: "Lena",
      LastName: "Hartwell",
      Address: "12 Example St",
      City: "Spokane",
      State: "WA",
      ZipCode: "99201",
      Email: "lena@example.com",
      Type: "Social",
      Inactive: "False",
    });
    expect(read.rows[2]).toMatchObject({
      CompanyName: "Example Studios",
      FirstName: "Jon",
    });
  });

  it("finds the heading row under title lines, and says when there is none", () => {
    const titled = [["Address / Phone List"], ["As of 5/14/2026"], ...grid];
    expect(sourceRowsFromGrid(titled, "contacts").rows).toHaveLength(6);
    expect(
      sourceRowsFromGrid(
        [
          ["Name", "Price"],
          ["Cake", "4"],
        ],
        "contacts",
      ).rows,
    ).toEqual([]);
  });

  it("reads files only for the datasets with a documented field map", () => {
    expect(datasetReadsFile("contacts")).toBe(true);
    expect(datasetReadsFile("venues")).toBe(true);
    expect(datasetReadsFile("pack_list")).toBe(false);
    // "Company" is a person's company only in the contacts dataset.
    const venue = sourceRowsFromGrid(
      [
        ["Venue Name", "Zip", "Company"],
        ["Grand Hall", "99201", "Hall Co"],
      ],
      "venues",
    );
    expect(venue.rows).toEqual([
      { VenueName: "Grand Hall", ZipCode: "99201", Company: "Hall Co" },
    ]);
  });
});
