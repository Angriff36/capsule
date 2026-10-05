import { describe, expect, it } from "vitest";
import {
  ESCALATION_CASES,
  problemStatus,
} from "../../src/features/facilities/venueEscalation";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 9, 10, 12);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const problem = (
  id: string,
  level: number | null,
  hoursAgo: number,
  extra: Record<string, unknown> = {},
) => ({
  _id: id,
  venueId: "v1",
  category: "incident",
  content: id,
  escalationLevel: level,
  postedAt: now - hoursAgo * HOUR,
  ...extra,
});

describe("venue problem levels (playbook section 14)", () => {
  it("lists open problems worst first, with the time each must be settled by", () => {
    const status = problemStatus({
      venueId: "v1",
      now,
      formatDate: day,
      contacts: [],
      notes: [
        problem("routine", 1, 30),
        problem("serious", 3, 10),
        problem("closed", 4, 5, { resolvedAt: now - HOUR }),
        problem("old note", null, 500),
        { ...problem("other venue", 4, 1), venueId: "v2" },
        { ...problem("check-in", null, 1), category: "check_in" },
      ],
    });
    expect(status.open.map((row) => row.note._id)).toEqual([
      "serious",
      "routine",
      "old note",
    ]);
    expect(status.open[0]).toMatchObject({
      dueAt: now - 10 * HOUR + 72 * HOUR,
      overdue: false,
    });
    expect(status.open[1]).toMatchObject({ overdue: true });
    expect(status.open[2]).toMatchObject({ dueAt: null, overdue: false });
    expect(status.reminders[0]).toBe(
      "Level 1 problem “routine” from 2026-10-09 is not closed: settle the same day",
    );
  });

  it("wants a check with the venue within 7 days after a closed level 3 or 4 problem", () => {
    const closedAt = now - 2 * DAY;
    const notes = [
      problem("serious", 3, 100, { resolvedAt: closedAt }),
      problem("routine", 1, 100, { resolvedAt: closedAt }),
    ];
    const owed = problemStatus({
      venueId: "v1",
      now,
      formatDate: day,
      notes,
      contacts: [
        { venueId: "v1", category: "check_in", postedAt: closedAt - HOUR },
      ],
    });
    expect(owed.reminders).toEqual([
      "Check with the venue that all is well after the level 3 problem “serious” (by 2026-10-15)",
    ]);
    const done = problemStatus({
      venueId: "v1",
      now,
      formatDate: day,
      notes,
      contacts: [
        { venueId: "v1", category: "check_in", postedAt: closedAt + HOUR },
      ],
    });
    expect(done.reminders).toEqual([]);
  });

  it("gives every common case a level and what to do", () => {
    expect(ESCALATION_CASES).toHaveLength(7);
    for (const item of ESCALATION_CASES) {
      expect([1, 2, 3, 4]).toContain(item.level);
      expect(item.todo.length).toBeGreaterThan(10);
    }
  });
});
