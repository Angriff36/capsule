import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eventCreateDisabledReason } from "../../../src/features/events/eventCreateGuards";
import {
  SERVICE_STYLE_CATALOG,
  persistableServiceStyleId,
  serviceStyleSelectOptions,
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

  it("EventCreatePage shows Client is required when Create is disabled for a missing client", () => {
    const page = readFileSync(
      "src/features/events/EventCreatePage.tsx",
      "utf8",
    );
    expect(page).toContain("disabled={busy !== null || !clientId || !venueId}");
    expect(page).toContain("Client is required");
    expect(page).toContain("eventCreateDisabledReason");
  });
});

describe("create event required Name marker", () => {
  it("marks primary contact Name as required on the create form", () => {
    const page = readFileSync(
      "src/features/events/EventCreatePage.tsx",
      "utf8",
    );
    expect(page).toMatch(/Name \*[\s\S]{0,80}name="primaryContactName"/);
    expect(page).toContain('name="primaryContactName"');
    expect(page).toContain("required");
  });
});

describe("create form uses the shared service style vocabulary", () => {
  it("EventCreatePage populates the picker from serviceStyleSelectOptions", () => {
    const page = readFileSync(
      "src/features/events/EventCreatePage.tsx",
      "utf8",
    );
    expect(page).toContain("serviceStyleSelectOptions");
    expect(page).toContain("Select a service style");
    const seed = readFileSync("scripts/seed-catalogs.ts", "utf8");
    expect(seed).toContain("SERVICE_STYLE_CATALOG");
    expect(seed).toContain("serviceStyleCatalog");
  });
});

describe("events index is not a Test Event deep-link", () => {
  it("create-form back link and App list route stay on /events", () => {
    const page = readFileSync(
      "src/features/events/EventCreatePage.tsx",
      "utf8",
    );
    expect(page).toContain("eventsIndexPath()");
    expect(page).not.toContain(TEST_EVENT_ID);
    const app = readFileSync("src/app/App.tsx", "utf8");
    expect(app).not.toContain(TEST_EVENT_ID);
    const list = readFileSync("src/features/events/EventsListPage.tsx", "utf8");
    expect(list).not.toContain(TEST_EVENT_ID);
    expect(list).not.toMatch(/useEffect\([\s\S]{0,200}navigate\(/);
  });
});
