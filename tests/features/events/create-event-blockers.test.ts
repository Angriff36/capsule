import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eventCreateDisabledReason } from "../../../src/features/events/eventCreateGuards";
import {
  SERVICE_STYLE_CATALOG,
  persistableServiceStyleId,
  serviceStyleSelectOptions,
  usingBuiltInServiceStyles,
} from "../../../src/features/events/serviceStyleCatalog";

const TEST_EVENT_ID = "nn7ez3fz56ya246m6p17az2ad58crnwg";

describe("service style catalog fallback", () => {
  it("uses the production catalog name Full Service, not an invented Buffet enum", () => {
    const names = SERVICE_STYLE_CATALOG.map((row) => row.name);
    expect(names).toContain("Full Service");
    expect(names).toContain("Limited Service");
    expect(names).toContain("Drop Off");
    expect(names).toContain("Vending");
    expect(names).not.toContain("Buffet");
  });

  it("shows Full Service when Convex has no active service styles", () => {
    const empty = serviceStyleSelectOptions([]);
    expect(empty.map((row) => row.name)).toContain("Full Service");
    expect(empty).toHaveLength(SERVICE_STYLE_CATALOG.length);
  });

  it("prefers live active rows when the tenant catalog is populated", () => {
    const live = serviceStyleSelectOptions([
      { _id: "ss1", name: "Full Service", status: "active", sortOrder: 0 },
    ]);
    expect(live).toEqual([{ id: "ss1", name: "Full Service" }]);
  });

  it("does not treat catalog codes as persistable serviceStyleId values", () => {
    expect(persistableServiceStyleId("full-service")).toBe("");
    expect(persistableServiceStyleId("j570xjfxqrgv9dxdwqvxjxrghd7n8sez")).toBe(
      "j570xjfxqrgv9dxdwqvxjxrghd7n8sez",
    );
  });
});

describe("create event client-required copy", () => {
  it("explains a disabled Create when the client is missing", () => {
    expect(eventCreateDisabledReason({ busy: false, clientId: "" })).toBe(
      "Client is required",
    );
    expect(eventCreateDisabledReason({ busy: false, clientId: "   " })).toBe(
      "Client is required",
    );
    expect(
      eventCreateDisabledReason({ busy: false, clientId: "client1" }),
    ).toBeNull();
  });
});

describe("empty catalogs show an explicit state and do not block create", () => {
  it("flags the built-in service-style fallback only once the list has loaded", () => {
    expect(usingBuiltInServiceStyles(undefined)).toBe(false);
    expect(usingBuiltInServiceStyles([])).toBe(true);
    expect(
      usingBuiltInServiceStyles([
        { _id: "ss1", name: "Full Service", status: "retired" },
      ]),
    ).toBe(true);
    expect(
      usingBuiltInServiceStyles([
        { _id: "ss1", name: "Full Service", status: "active" },
      ]),
    ).toBe(false);
  });

  it("empty catalogs do not block create — both selectors stay optional", () => {
    const page = readFileSync(
      "src/features/events/EventCreatePage.tsx",
      "utf8",
    );
    const occasionSelect =
      page.match(/Occasion\s*<select[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(occasionSelect).toContain(
      '<option value="">Select an occasion</option>',
    );
    expect(occasionSelect).not.toContain("required");
    const styleSelect =
      page.match(/Service style\s*<select[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(styleSelect).toContain(
      '<option value="">Select a service style</option>',
    );
    expect(styleSelect).not.toContain("required");
    // Create stays gated on client and venue only, and a built-in catalog
    // code never reaches the command as a serviceStyleId.
    expect(page).toContain("disabled={busy !== null || !clientId || !venueId}");
    expect(persistableServiceStyleId("full-service")).toBe("");
  });
});
