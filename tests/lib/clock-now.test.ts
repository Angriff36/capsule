import { afterEach, describe, expect, it, vi } from "vitest";
import { clockNow } from "../../convex/lib/clockNow";

describe("query clock (release review 2026-09-29)", () => {
  afterEach(() => vi.useRealTimers());

  it("a later page minute moves the query clock forward; an older one never moves it back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const server = Date.now();
    expect(clockNow()).toBe(server);
    expect(clockNow(server + 60_000)).toBe(server + 60_000);
    // An old minute cannot keep an expired link open.
    expect(clockNow(server - 86_400_000)).toBe(server);
    expect(clockNow(Number.NaN)).toBe(server);
  });
});
