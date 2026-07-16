import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function commandBlock(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0)
    throw new Error(`Missing generated command block: ${start}`);
  return source.slice(from, to);
}

describe("Event lifecycle reaction projection", () => {
  it("keeps approval and cancellation fan-out payload access flat", () => {
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    const approve = commandBlock(
      mutations,
      "export const Event_approve = mutation({",
      "export const Event_assignOwner = mutation({",
    );
    const cancel = commandBlock(
      mutations,
      "export const Event_cancel = mutation({",
      "export const Event_changeHeadcount = mutation({",
    );
    expect(approve).toContain("payload.eventId");
    expect(cancel).toContain("payload.reason");
    expect(`${approve}\n${cancel}`).not.toContain("payload.payload");
  });
});
