import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  serviceStyleSelectOptions,
  usingBuiltInServiceStyles,
} from "../../../src/features/events/serviceStyleCatalog";

// Spec: dropdown-lists-and-their-admin-screen.md — "A retired service style
// disappears from new-event selectors but remains on existing events and
// imports." The imports half has no id-mapping surface yet (mapServiceStyle
// is unimplemented); create and detail are the built paths this pins.
describe("retired service styles", () => {
  it("retired hidden on create, resolved on detail", () => {
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

    // Existing events keep resolving: EventDetailsCard looks the id up in the
    // full live list (no status filter), so a since-retired style still names.
    const card = readFileSync(
      "src/features/events/EventDetailsCard.tsx",
      "utf8",
    );
    expect(card).toContain("nameOf(useListServiceStyle(), serviceStyleId)");
    expect(card).toContain("rows?.find((row) => row._id === id)?.name");

    // The create page feeds its picker only the filtered options.
    const page = readFileSync(
      "src/features/events/EventCreatePage.tsx",
      "utf8",
    );
    expect(page).toContain("serviceStyleSelectOptions(serviceStyles)");
  });
});
