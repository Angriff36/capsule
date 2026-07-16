import { describe, expect, it } from "vitest";
import { isAuthConfigured } from "../src/app/AuthGate";
import { WorkspaceMembershipPolicy } from "../src/app/auth/WorkspaceMembershipPolicy";

describe("WorkspaceMembershipPolicy", () => {
  const policy = new WorkspaceMembershipPolicy();

  it("requires both role and tenant before the shell unlocks", () => {
    expect(
      policy.isReady({ authenticated: true, hasRole: true, hasTenant: true }),
    ).toBe(true);
    expect(
      policy.isReady({ authenticated: true, hasRole: true, hasTenant: false }),
    ).toBe(false);
    expect(
      policy.isReady({ authenticated: true, hasRole: false, hasTenant: true }),
    ).toBe(false);
  });

  it("names missing workspace requirements for the setup screen", () => {
    expect(
      policy.missingRequirements({
        authenticated: true,
        hasRole: false,
        hasTenant: false,
      }),
    ).toContain("workspace");
    expect(
      policy.missingRequirements({
        authenticated: true,
        hasRole: false,
        hasTenant: false,
      }),
    ).toContain("role");
  });
});

describe("isAuthConfigured", () => {
  it("requires the Clerk publishable key", () => {
    expect(isAuthConfigured({})).toBe(false);
    expect(isAuthConfigured({ VITE_CLERK_PUBLISHABLE_KEY: "pk_test_x" })).toBe(
      true,
    );
  });
});
