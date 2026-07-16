import { describe, expect, it } from "vitest";
import { NavigationCatalog } from "../src/app/navigation/NavigationCatalog";
import { NAV_AREAS } from "../src/app/nav";

describe("NavigationCatalog", () => {
  const catalog = new NavigationCatalog(NAV_AREAS);

  it("exposes Home, Events, and Kitchen as available shell areas", () => {
    const paths = catalog.availableAreas().map((a) => a.path);
    expect(paths).toEqual(expect.arrayContaining(["/", "/events", "/kitchen"]));
    expect(paths).not.toContain("/inventory");
  });

  it("keeps inventory and admin in planned areas", () => {
    const planned = catalog.plannedAreas().map((a) => a.path);
    expect(planned).toEqual(
      expect.arrayContaining(["/inventory", "/admin", "/finance"]),
    );
  });

  it("resolves area from pathname prefixes", () => {
    expect(catalog.areaForPath("/events/abc")?.label).toBe("Events");
    expect(catalog.areaForPath("/")?.label).toBe("Home");
  });
});
