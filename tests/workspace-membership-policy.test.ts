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
  const authLink = readFileSync("convex/authLink.ts", "utf8");
  const authContext = readFileSync("convex/lib/authContext.ts", "utf8");

  it("does not send the duplicate-email wall only to Team roles", () => {
    const ambiguous = source.slice(source.indexOf("ambiguous:"));
    expect(ambiguous).toContain("Open the workspace you want");
    expect(ambiguous.split("\n")[0]).not.toContain("Team roles");
  });

  it("source-guards linkBySubjectEmail and getAuthContext call pickLivePerson", () => {
    const linkFn = authLink.slice(
      authLink.indexOf("export const linkBySubjectEmail"),
      authLink.indexOf("export const catalogScope"),
    );
    const loadFn = authContext.slice(
      authContext.indexOf("async function loadPersonBySubject"),
    );
    expect(linkFn).toContain("pickLivePerson");
    expect(linkFn).toContain("decidePersonEmailLink");
    expect(loadFn).toContain("pickLivePerson");
  });

  it("openWorkspace awaits setActive then attempt only after JWT tenant matches", () => {
    const start = source.indexOf("const openWorkspace");
    const end = source.indexOf("const who =");
    const fn = source.slice(start, end);
    const setActiveAt = fn.indexOf("await setActive");
    const waitAt = fn.indexOf("waitForSessionTenantClaim");
    const attemptAt = fn.lastIndexOf("attempt()");
    expect(setActiveAt).toBeGreaterThan(-1);
    expect(waitAt).toBeGreaterThan(setActiveAt);
    expect(attemptAt).toBeGreaterThan(waitAt);
    expect(fn.slice(0, waitAt)).not.toMatch(/\battempt\s*\(/);
    expect(fn).toMatch(
      /await setActive[\s\S]*waitForSessionTenantClaim[\s\S]*organizationId[\s\S]*attempt\s*\(/,
    );
    const catchBlock = fn.slice(
      fn.indexOf("catch"),
      fn.indexOf("waitForSessionTenantClaim"),
    );
    expect(catchBlock).toContain("return");
    expect(catchBlock).not.toMatch(/\battempt\s*\(/);
  });
});
