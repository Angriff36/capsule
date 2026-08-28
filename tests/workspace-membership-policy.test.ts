import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAuthConfigured } from "../src/app/AuthGate";
import { WorkspaceMembershipPolicy } from "../src/app/auth/WorkspaceMembershipPolicy";

describe("WorkspaceMembershipPolicy", () => {
  const policy = new WorkspaceMembershipPolicy();

  it("requires both role and tenant before the shell unlocks", () => {
    expect(
      policy.isReady({
        authenticated: true,
        hasRole: true,
        hasTenant: true,
        role: "staff",
      }),
    ).toBe(true);
    expect(
      policy.isReady({
        authenticated: true,
        hasRole: true,
        hasTenant: false,
        role: "staff",
      }),
    ).toBe(false);
    expect(
      policy.isReady({
        authenticated: true,
        hasRole: false,
        hasTenant: true,
        role: "anonymous",
      }),
    ).toBe(false);
  });

  it("names missing workspace requirements for the setup screen", () => {
    expect(
      policy.missingRequirements({
        authenticated: true,
        hasRole: false,
        hasTenant: false,
        role: "anonymous",
      }),
    ).toContain("workspace");
    expect(
      policy.missingRequirements({
        authenticated: true,
        hasRole: false,
        hasTenant: false,
        role: "anonymous",
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

describe("AuthGate duplicate-email recovery", () => {
  const source = readFileSync("src/app/AuthGate.tsx", "utf8");

  it("does not send the duplicate-email wall only to Team roles", () => {
    const ambiguous = source.slice(source.indexOf("ambiguous:"));
    expect(ambiguous).toContain("oldest live profile");
    expect(ambiguous.split("\n")[0]).not.toContain("Team roles");
  });

  it("activates the chosen workspace instead of only opening the Clerk popover", () => {
    expect(source).toContain("setActive");
    expect(source).toContain("openWorkspace");
  });
});
