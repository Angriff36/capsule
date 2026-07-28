import { describe, expect, it } from "vitest";
import { NAV_AREAS } from "../src/app/nav";
import { NavigationCatalog } from "../src/app/navigation/NavigationCatalog";
import { orgCapabilityNavPolicy } from "../src/app/navigation/OrgCapabilityNavPolicy";

describe("NavigationCatalog", () => {
  const catalog = new NavigationCatalog(NAV_AREAS);

  it("exposes shipped operator workspaces in the shell", () => {
    const paths = catalog.availableAreas().map((a) => a.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/events",
        "/kitchen",
        "/inventory",
        "/logistics",
        "/staff",
        "/finance",
      ]),
    );
  });

  it("exposes every area — the planned/unshipped concept is retired", () => {
    // 2026-07-28: every area has shipped; the shell no longer renders a
    // "Future workspaces" drawer or planned-area placeholder pages.
    expect(catalog.availableAreas()).toHaveLength(NAV_AREAS.length);
  });

  it("resolves area from pathname prefixes", () => {
    expect(catalog.areaForPath("/events/abc")?.label).toBe("Events");
    expect(catalog.areaForPath("/")?.label).toBe("Home");
  });
});

describe("OrgCapabilityNavPolicy", () => {
  it("maps domain paths and leaves admin/home/unknown ungated", () => {
    expect(orgCapabilityNavPolicy.capabilityForPath("/kitchen/dishes")).toBe(
      "kitchen",
    );
    expect(orgCapabilityNavPolicy.capabilityForPath("/reports")).toBe(
      "reports",
    );
    expect(orgCapabilityNavPolicy.capabilityForPath("/facilities")).toBeNull();
    expect(
      orgCapabilityNavPolicy.capabilityForPath("/unknown-area"),
    ).toBeNull();
  });

  it("hides a path only when its capability is disabled", () => {
    expect(orgCapabilityNavPolicy.isPathEnabled("/events", ["kitchen"])).toBe(
      true,
    );
    expect(orgCapabilityNavPolicy.isPathEnabled("/events", ["events"])).toBe(
      false,
    );
    expect(orgCapabilityNavPolicy.isPathEnabled("/admin", ["events"])).toBe(
      true,
    );
  });
});
