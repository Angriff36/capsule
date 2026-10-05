import { describe, expect, it } from "vitest";
import {
  CONFIRMED_PREFIX,
  JOINT_VISIT_PREFIX,
  handoffDraft,
  handoffStatus,
  handoffText,
  ownerProblem,
} from "../../src/features/facilities/venueHandoff";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 5);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("venue hand-over (playbook section 02)", () => {
  it("writes who to whom, the reason, then the filled-in brief parts in order", () => {
    expect(
      handoffText({
        from: "Josh  Smith",
        to: "Kayden Lee",
        reason: "Workload balance",
        answers: {
          upcoming: "2026-11-01 Ewing Wedding",
          history: " Pilot venue since May ",
          quirks: "",
        },
      }),
    ).toBe(
      "Handed over from Josh Smith to Kayden Lee\nReason: Workload balance\nHistory: Pilot venue since May\nUpcoming events: 2026-11-01 Ewing Wedding",
    );
    expect(handoffText({ from: "", to: "Kayden", answers: {} })).toBe(
      "Handed over from no owner to Kayden",
    );
  });

  it("starts the brief with booked events here and problems of the last 90 days", () => {
    const draft = handoffDraft({
      venueId: "v1",
      now,
      formatDate: day,
      events: [
        {
          venueId: "v1",
          title: "Late",
          stage: "planning",
          startsAt: now + 9 * DAY,
          eventNumber: "7",
        },
        {
          venueId: "v1",
          title: "Soon",
          stage: "confirmed",
          startsAt: now + 2 * DAY,
        },
        {
          venueId: "v1",
          title: "Gone",
          stage: "cancelled",
          startsAt: now + 3 * DAY,
        },
        {
          venueId: "v1",
          title: "Past",
          stage: "completed",
          startsAt: now - DAY,
        },
        {
          venueId: "v2",
          title: "Other",
          stage: "planning",
          startsAt: now + DAY,
        },
      ],
      notes: [
        {
          venueId: "v1",
          category: "incident",
          content: "Broken chafer",
          postedAt: now - 5 * DAY,
        },
        {
          venueId: "v1",
          category: "incident",
          content: "Old one",
          postedAt: now - 120 * DAY,
        },
        {
          venueId: "v1",
          category: "check_in",
          content: "Call",
          postedAt: now - DAY,
        },
      ],
    });
    expect(draft.upcoming).toBe("2026-10-07 Soon; 2026-10-14 Late (#7)");
    expect(draft.issues).toBe("2026-09-30 Broken chafer");
  });

  it("follows the newest hand-over through joint visit, 30 days and confirmation", () => {
    const at = now - 10 * DAY;
    const brief = {
      venueId: "v1",
      category: "handoff",
      content: "Handed over from Josh to Kayden\nHistory: pilot",
      postedAt: at,
    };
    const open = handoffStatus({ venueId: "v1", notes: [brief], now });
    expect(open).toMatchObject({
      from: "Josh",
      to: "Kayden",
      shadowDaysLeft: 20,
      done: false,
    });
    expect(open?.reminders).toEqual([
      "Visit the venue together with Josh and introduce Kayden",
    ]);

    const visited = handoffStatus({
      venueId: "v1",
      now: at + 31 * DAY,
      notes: [
        brief,
        {
          venueId: "v1",
          category: "check_in",
          content: `${JOINT_VISIT_PREFIX}met Sarah`,
          postedAt: at + DAY,
        },
        // A confirmation from before this hand-over does not count.
        {
          venueId: "v1",
          category: "check_in",
          content: `${CONFIRMED_PREFIX}old`,
          postedAt: at - DAY,
        },
      ],
    });
    expect(visited?.jointVisitAt).toBe(at + DAY);
    expect(visited?.shadowDaysLeft).toBe(0);
    expect(visited?.reminders).toEqual([
      "30 days are over: ask the venue if they are comfortable with Kayden and report back",
    ]);

    const done = handoffStatus({
      venueId: "v1",
      now: at + 32 * DAY,
      notes: [
        brief,
        {
          venueId: "v1",
          category: "check_in",
          content: `${CONFIRMED_PREFIX}all good`,
          postedAt: at + 31 * DAY,
        },
      ],
    });
    expect(done).toMatchObject({
      done: true,
      confirmedAt: at + 31 * DAY,
      reminders: [],
    });
    expect(handoffStatus({ venueId: "v2", notes: [brief], now })).toBeNull();
  });

  it("flags a partner venue with no owner or an owner who left", () => {
    const ids = new Set(["p1"]);
    const base = { isPartner: true, activeStaffIds: ids, staffLoaded: true };
    expect(ownerProblem({ ...base, ownerId: "p1" })).toBeNull();
    expect(ownerProblem({ ...base, ownerId: undefined })).toMatch(/No owner/);
    expect(ownerProblem({ ...base, ownerId: "p9" })).toMatch(
      /no longer on the staff list/,
    );
    expect(
      ownerProblem({ ...base, isPartner: false, ownerId: undefined }),
    ).toBeNull();
    expect(
      ownerProblem({ ...base, staffLoaded: false, ownerId: "p9" }),
    ).toBeNull();
  });
});
