import { describe, expect, it } from "vitest";
import { nativelyAnswered } from "../src/lib/eventPacket/requirements";

// Issue #418: workbook checks the event's own records already answer tick
// themselves; a check with no matching record stays open.
const fact = (fieldKey: string) => ({
  fieldKey,
  value: "x",
  status: "confirmed" as const,
  authority: "native_finalized" as const,
  confidence: 1,
  evidence: [],
});

describe("workbook checks answered by the event's own records", () => {
  it.each([
    ["check.assignment.crew", ["crew.native-a"]],
    ["check.assignment.vehicle", ["vehicle.native-a"]],
    ["check.live.goodshuffle", ["equipment.native-a"]],
    ["check.live.dropbox", ["layouts.native-a"]],
    ["check.live.tracker", ["crew.native-a", "packlist.native-b"]],
    [
      "check.timeline.load-travel",
      [
        "timeline.event_staff_on.1.time",
        "timeline.nlt.1.time",
        "timeline.arrive_onsite.1.time",
      ],
    ],
  ])("%s ticks when the event holds the records", (key, keys) => {
    expect(nativelyAnswered(key, keys.map(fact) as never)).toBe(true);
  });

  it("stays open when only part of what it needs is there", () => {
    expect(
      nativelyAnswered("check.timeline.load-travel", [
        fact("timeline.event_staff_on.1.time"),
      ] as never),
    ).toBe(false);
    expect(
      nativelyAnswered("check.live.tracker", [fact("crew.native-a")] as never),
    ).toBe(false);
  });

  it("does not tick a check from a source-file value", () => {
    expect(
      nativelyAnswered("check.assignment.crew", [
        { ...fact("crew.native-a"), authority: "source" },
      ] as never),
    ).toBe(false);
  });

  it("never ticks the sign-offs", () => {
    expect(
      nativelyAnswered("check.signature.event-lead", [
        fact("crew.native-a"),
      ] as never),
    ).toBe(false);
  });
});
