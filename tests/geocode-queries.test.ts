import { describe, expect, it } from "vitest";
import { geocodeQueries } from "../src/features/logistics/routePlanner";

describe("venue map search", () => {
  it("also tries the street when a building label comes first", () => {
    expect(
      geocodeQueries("2440 BUILDING 2440 NE Hopkins Ct., Pullman, WA, 99163"),
    ).toEqual([
      "2440 BUILDING 2440 NE Hopkins Ct., Pullman, WA, 99163",
      "2440 NE Hopkins Ct., Pullman, WA, 99163",
    ]);
  });

  it("tries a plain address once", () => {
    expect(geocodeQueries("123 Main St, Spokane, WA, 99201")).toEqual([
      "123 Main St, Spokane, WA, 99201",
    ]);
  });
});
