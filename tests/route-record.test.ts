import { describe, expect, it, vi } from "vitest";
import { isPlausibleConvexId, useRouteRecord } from "../src/lib/routeRecord";

// A real Convex document id shape: 32 lowercase base32 characters.
const PLAUSIBLE_ID = "j570xjfxqrgv9dxdwqvxjxrghd7n8sez";

describe("isPlausibleConvexId", () => {
  it("accepts a Convex-shaped id", () => {
    expect(isPlausibleConvexId(PLAUSIBLE_ID)).toBe(true);
  });

  it("rejects human-typed junk like /events/does-not-exist", () => {
    expect(isPlausibleConvexId("does-not-exist")).toBe(false);
  });

  it("rejects a missing param", () => {
    expect(isPlausibleConvexId(undefined)).toBe(false);
  });

  it("rejects uppercase, spaces, and too-short values", () => {
    expect(isPlausibleConvexId("J570XJFXQRGV9DXDWQVXJXRGHD7N8SEZ")).toBe(false);
    expect(isPlausibleConvexId("two words")).toBe(false);
    expect(isPlausibleConvexId("abc123")).toBe(false);
    expect(isPlausibleConvexId("")).toBe(false);
  });
});

describe("useRouteRecord", () => {
  it("skips the query for an implausible id and resolves null (the page's not-found UI), never loading", () => {
    const useGetRecord = vi.fn(() => undefined);
    const result = useRouteRecord(useGetRecord, "does-not-exist");
    expect(useGetRecord).toHaveBeenCalledWith("skip");
    expect(useGetRecord).not.toHaveBeenCalledWith("does-not-exist");
    expect(result).toBeNull();
  });

  it("skips when the param is absent", () => {
    const useGetRecord = vi.fn(() => undefined);
    expect(useRouteRecord(useGetRecord, undefined)).toBeNull();
    expect(useGetRecord).toHaveBeenCalledWith("skip");
  });

  it("passes a plausible id through and preserves loading (undefined)", () => {
    const useGetRecord = vi.fn(() => undefined);
    const result = useRouteRecord(useGetRecord, PLAUSIBLE_ID);
    expect(useGetRecord).toHaveBeenCalledWith(PLAUSIBLE_ID);
    expect(result).toBeUndefined();
  });

  it("passes through null for a plausible id the server does not know (missing record)", () => {
    const useGetRecord = vi.fn(() => null);
    expect(useRouteRecord(useGetRecord, PLAUSIBLE_ID)).toBeNull();
  });

  it("passes through the document when found", () => {
    const doc = { _id: PLAUSIBLE_ID, title: "Tasting dinner" };
    const useGetRecord = vi.fn(() => doc);
    expect(useRouteRecord(useGetRecord, PLAUSIBLE_ID)).toBe(doc);
  });
});
