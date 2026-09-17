import { describe, expect, it } from "vitest";
import {
  serviceStyleSelectOptions,
  usingBuiltInServiceStyles,
} from "../../../src/features/events/serviceStyleCatalog";

describe("retired service styles", () => {
  it("excludes retired styles from new-event choices and falls back for a retired-only catalog", () => {
    const active = {
      _id: "k57qs3vq8x2r4m9d",
      name: "Full Service",
      status: "active",
      sortOrder: 1,
    };
    const retired = {
      _id: "mm82x1tq5y7w3e6f",
      name: "Old World Plated",
      status: "retired",
      sortOrder: 0,
    };

    // New-event picker: with a mixed catalog only the active row is offered;
    // the retired row never leaks in, whatever its sort order.
    const picker = serviceStyleSelectOptions([active, retired]);
    expect(picker.map((option) => option.id)).toEqual(["k57qs3vq8x2r4m9d"]);
    expect(picker.map((option) => option.name)).not.toContain(
      "Old World Plated",
    );

    // A retired-only catalog falls back to the built-in styles, never to the
    // retired row itself.
    expect(usingBuiltInServiceStyles([retired])).toBe(true);
    expect(
      serviceStyleSelectOptions([retired]).map((option) => option.id),
    ).not.toContain("mm82x1tq5y7w3e6f");
  });
});
