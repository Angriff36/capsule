import { describe, expect, it } from "vitest";

import { proposalFollowUps } from "../src/lib/proposalFollowUps";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 9, 12);

describe("proposal follow-ups", () => {
  const rows = proposalFollowUps(
    [
      { _id: "draft", status: "draft", sentAt: null, title: "Draft" },
      { _id: "taken", status: "accepted", sentAt: NOW - 30 * DAY },
      { _id: "fresh", status: "sent", sentAt: NOW - 1 * DAY, title: "Fresh" },
      {
        _id: "late",
        status: "viewed",
        sentAt: NOW - 12 * DAY,
        title: "Late",
        followUpStep: 1,
        followUpAt: NOW - 8 * DAY,
      },
      {
        _id: "closed",
        status: "sent",
        sentAt: NOW - 40 * DAY,
        title: "Closed",
        followUpStep: 3,
        followUpAt: NOW - 18 * DAY,
      },
      {
        _id: "gone",
        status: "sent",
        sentAt: NOW - 5 * DAY,
        deletedAt: NOW,
      },
    ],
    NOW,
  );

  it("lists only live sent or opened proposals, due ones first, all-done last", () => {
    expect(rows.map((row) => row.proposalId)).toEqual([
      "late",
      "fresh",
      "closed",
    ]);
  });

  it("names the next step and when it is due", () => {
    const [late, fresh, closed] = rows;
    expect(late).toMatchObject({
      opened: true,
      done: { step: 1 },
      doneAt: NOW - 8 * DAY,
      next: { step: 2, label: "Day 10 check-in" },
      nextDueAt: NOW - 2 * DAY,
      due: true,
    });
    expect(fresh).toMatchObject({
      next: { step: 1 },
      nextDueAt: NOW + 2 * DAY,
      due: false,
    });
    expect(closed?.next).toBeUndefined();
    expect(closed?.due).toBe(false);
  });

  it("keeps the owner's day 21 words as written", () => {
    expect(rows[0]!.next!.note("Chris", "Late")).toContain("Chris");
    const last = rows[2]!.done!.note("Chris", "Closed");
    expect(last).toContain(
      "we'd love to chat before we clear the kitchen. Dates are booking up.",
    );
  });
});
