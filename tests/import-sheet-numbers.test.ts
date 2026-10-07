import { describe, expect, it } from "vitest";
import { parseTppVenues } from "../convex/tppParser";

// A .csv or .xlsx sheet hands every cell over as text.
describe("number cells from a spreadsheet import", () => {
  it("reads '1,200' and '220' capacities as numbers", () => {
    const parsed = parseTppVenues([
      {
        VenueName: "Barn",
        Address: "1 Road",
        ZipCode: "99005",
        Capacity: "1,200",
      },
      {
        VenueName: "Hall",
        Address: "2 Road",
        ZipCode: "99216",
        Capacity: "220",
      },
      { VenueName: "Yard", Address: "3 Road", ZipCode: "99001", Capacity: "" },
    ] as never);
    expect(parsed.records.map((venue) => venue.capacity)).toEqual([
      1200,
      220,
      undefined,
    ]);
  });
});
