import { describe, expect, it } from "vitest";
import { EventCreateServiceStyleResolver } from "../../../src/features/events/EventCreateServiceStyleResolver";
import { eventCreateDisabledReason } from "../../../src/features/events/eventCreateGuards";
import {
  SERVICE_STYLE_CATALOG,
  persistableServiceStyleId,
  serviceStyleSelectOptions,
  usingBuiltInServiceStyles,
} from "../../../src/features/events/serviceStyleCatalog";

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

  it("treats an inactive catalog row as missing so ensure can reactivate it", () => {
    const resolver = new EventCreateServiceStyleResolver(async () => ({
      docId: "new-id",
    }));
    expect(
      resolver.missing([
        {
          _id: "ss-old",
          name: "Full Service",
          code: "full-service",
          status: "inactive",
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "full-service" }),
      ]),
    );
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
});
