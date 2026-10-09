import { describe, expect, it } from "vitest";
import { lostDeals, priceObjections, replyTimes } from "../src/lib/salesHabits";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 9, 12);

describe("sales habits", () => {
  it("counts first-reply times of recent inquiries and the ones still waiting", () => {
    const result = replyTimes(
      [
        {
          _id: "a",
          capturedAt: NOW - 5 * DAY,
          firstRepliedAt: NOW - 5 * DAY + 2 * HOUR,
        },
        {
          _id: "b",
          capturedAt: NOW - 4 * DAY,
          firstRepliedAt: NOW - 4 * DAY + 6 * HOUR,
        },
        {
          _id: "c",
          capturedAt: NOW - 3 * DAY,
          firstRepliedAt: NOW - 3 * DAY + 3 * HOUR,
        },
        { _id: "waiting", capturedAt: NOW - 1 * DAY },
        { _id: "closed", capturedAt: NOW - 1 * DAY, closedAt: NOW },
        { _id: "proposal", capturedAt: NOW - 1 * DAY, proposalId: "p" },
        { _id: "imported", capturedAt: NOW - 1 * DAY, sourceStage: "Lost" },
        {
          _id: "old",
          capturedAt: NOW - 200 * DAY,
          firstRepliedAt: NOW - 100 * DAY,
        },
      ],
      NOW,
    );
    expect(result).toEqual({
      replied: 3,
      withinGoal: 2,
      medianHours: 3,
      waiting: 1,
    });
  });

  it("shares sent proposals called too expensive over the last 12 months", () => {
    expect(
      priceObjections(
        [
          { _id: "1", sentAt: NOW - 10 * DAY, priceObjectionAt: NOW - 9 * DAY },
          { _id: "2", sentAt: NOW - 20 * DAY },
          {
            _id: "3",
            sentAt: NOW - 400 * DAY,
            priceObjectionAt: NOW - 399 * DAY,
          },
          { _id: "draft" },
        ],
        NOW,
      ),
    ).toEqual({ sent: 2, objected: 1 });
  });

  it("logs declined, expired and 30-day cold proposals with value, last touch and why", () => {
    const rows = lostDeals(
      [
        {
          _id: "cold",
          status: "viewed",
          total: 4000,
          sentAt: NOW - 50 * DAY,
          followUpAt: NOW - 35 * DAY,
          title: "Cold",
        },
        { _id: "warm", status: "sent", total: 900, sentAt: NOW - 10 * DAY },
        {
          _id: "declined",
          status: "declined",
          total: 3500,
          sentAt: NOW - 20 * DAY,
          declinedAt: NOW - 15 * DAY,
          priceObjectionAt: NOW - 18 * DAY,
        },
        {
          _id: "expired",
          status: "expired",
          total: 1200,
          sentAt: NOW - 60 * DAY,
          expiredAt: NOW - 30 * DAY,
        },
        { _id: "won", status: "accepted", total: 8000, sentAt: NOW - 60 * DAY },
        {
          _id: "long-ago",
          status: "declined",
          total: 100,
          sentAt: NOW - 500 * DAY,
          declinedAt: NOW - 450 * DAY,
        },
      ],
      NOW,
    );
    expect(
      rows.map((row) => [row.proposalId, row.value, row.reason, row.cold]),
    ).toEqual([
      ["declined", 3500, "Said too expensive", false],
      ["cold", 4000, "No answer for 35 days", true],
      ["expired", 1200, "Ran out with no answer", false],
    ]);
    expect(rows[1].lastTouch).toBe(NOW - 35 * DAY);
  });
});
