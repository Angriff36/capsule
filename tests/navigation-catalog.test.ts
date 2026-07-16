import { describe, expect, it } from "vitest";
import { NAV_AREAS } from "../src/app/nav";
import { NavigationCatalog } from "../src/app/navigation/NavigationCatalog";

describe("NavigationCatalog", () => {
  const catalog = new NavigationCatalog(NAV_AREAS);

  it("exposes shipped operator workspaces in the shell", () => {
    const paths = catalog.availableAreas().map((a) => a.path);
    expect(paths).toEqual(
      expect.arrayContaining(["/", "/events", "/kitchen", "/inventory"]),
    );
  });

  it("keeps unshipped systems in planned areas", () => {
    const planned = catalog.plannedAreas().map((a) => a.path);
    expect(planned).toEqual(expect.arrayContaining(["/admin", "/finance"]));
    expect(planned).not.toContain("/inventory");
  });

  it("resolves area from pathname prefixes", () => {
    expect(catalog.areaForPath("/events/abc")?.label).toBe("Events");
    expect(catalog.areaForPath("/")?.label).toBe("Home");
  });
});
