import { describe, expect, it } from "vitest";
import { isAuthConfigured } from "../src/app/AuthGate";
import { workspaceMembershipPolicy } from "../src/app/auth/WorkspaceMembershipPolicy";
import { NavigationCatalog } from "../src/app/navigation/NavigationCatalog";
import { NAV_AREAS } from "../src/app/nav";

/**
 * Highest-value product path without a browser:
 * Clerk key present → membership ready → Operate nav exposes Events.
 */
describe("smoke: signed-in workspace path", () => {
  it("unlocks the shell only when auth + membership claims are complete", () => {
    expect(
      isAuthConfigured({ VITE_CLERK_PUBLISHABLE_KEY: "pk_test_smoke" }),
    ).toBe(true);

    expect(
      workspaceMembershipPolicy.isReady({
        authenticated: true,
        hasRole: true,
        hasTenant: true,
        role: "staff",
      }),
    ).toBe(true);

    const catalog = new NavigationCatalog(NAV_AREAS);
    const events = catalog.areaForPath("/events");
    expect(events?.label).toBe("Events");
    expect(events?.planned).toBeUndefined();
    expect(catalog.availableAreas().some((a) => a.path === "/events")).toBe(
      true,
    );
  });
});
