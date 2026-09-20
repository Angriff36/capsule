// src/lib/releaseBackendScope.ts — does a release need the self-hosted Convex
// backend deploy, and which new queries can that deploy verify?
// Pure unit test over synthetic inputs — no git, no network.
import { describe, expect, it } from "vitest";
import {
  releaseBackendScope,
  zeroArgListQueries,
} from "../src/lib/releaseBackendScope";

const QUERIES_BEFORE = `
export const listEvent = query({
  args: {},
  handler: async (ctx) => [],
});
export const getEvent = query({
  args: { id: v.id("events") },
  handler: async (ctx) => null,
});
`;
const QUERIES_AFTER = `${QUERIES_BEFORE}
export const listServiceStyleKitItem = query({
  args: {},
  handler: async (ctx) => [],
});
export const listServiceStyleKitItemByTenantId = query({
  args: { tenantId: v.string() },
  handler: async (ctx) => [],
});
export const getServiceStyleKitItem = query({
  args: {},
  handler: async (ctx) => null,
});
`;

function scope(changedPaths: string[], convexImportedPaths: string[] = []) {
  return releaseBackendScope({
    changedPaths,
    convexImportedPaths,
    queriesBefore: QUERIES_BEFORE,
    queriesAfter: QUERIES_AFTER,
  });
}

describe("releaseBackendScope", () => {
  it("frontend, docs, scripts and tests alone leave the backend unchanged", () => {
    const result = scope([
      "src/features/events/EventPage.tsx",
      "docs/operations/commands.md",
      "scripts/release.sh",
      "tests/release-backend-scope.test.ts",
      "src/lib/manifest-convex-react.ts",
    ]);
    expect(result.backendRequired).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.verifyQueries).toEqual([]);
  });

  it("the documented paths need the backend deploy", () => {
    for (const path of [
      "src/operations/event.manifest",
      "convex/queries.ts",
      "convex/lib/eventNumbering.ts",
      "convex/_generated/api.d.ts",
      "convex.json",
      "package.json",
      "bun.lock",
    ]) {
      const result = scope(["README.md", path]);
      expect(result.backendRequired).toBe(true);
      expect(result.reasons).toEqual([path]);
    }
  });

  it("a src/ module that convex/ imports needs the backend deploy", () => {
    const imported = ["src/lib/pricing/quote.ts"];
    expect(scope(["src/lib/pricing/quote.ts"], imported).backendRequired).toBe(
      true,
    );
    expect(scope(["src/lib/pricing/other.ts"], imported).backendRequired).toBe(
      false,
    );
  });

  it("verifies only NEW zero-argument list queries", () => {
    expect(zeroArgListQueries(QUERIES_AFTER)).toEqual([
      "listEvent",
      "listServiceStyleKitItem",
    ]);
    expect(zeroArgListQueries(null)).toEqual([]);
    expect(scope(["convex/queries.ts"]).verifyQueries).toEqual([
      "listServiceStyleKitItem",
    ]);
  });
});
