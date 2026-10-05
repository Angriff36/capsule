/**
 * AC-124 (PR09-03): roster conflicts name the worker, the event(s) and the
 * time; an optional or unrelated certificate never shows as a problem.
 */
import { describe, expect, it } from "vitest";
import {
  findRosterConflicts,
  formatWindow,
} from "../../../src/features/workforce/rosterConflicts";
import { deriveNotifications } from "../../../src/features/notifications/deriveNotifications";
import type { Doc } from "../../../src/lib/api";

const HOUR = 3_600_000;
const T = Date.UTC(2026, 9, 18, 16, 0);
const titles: Record<string, string> = {
  e1: "Garden lunch",
  e2: "Board dinner",
};
const names: Record<string, string> = { p1: "Sam Rivera", p2: "Kim Lee" };

function shift(
  id: string,
  personId: string,
  eventId: string | null,
  startsAt: number,
  endsAt: number,
  extra: Record<string, unknown> = {},
) {
  return {
    _id: id,
    personId,
    eventId,
    startsAt,
    endsAt,
    status: "scheduled",
    deletedAt: null,
    ...extra,
  };
}

const find = (input: {
  shifts: ReturnType<typeof shift>[];
  timeOff?: Parameters<typeof findRosterConflicts>[0]["timeOff"];
  qualifications?: Parameters<typeof findRosterConflicts>[0]["qualifications"];
}) =>
  findRosterConflicts({
    shifts: input.shifts,
    timeOff: input.timeOff ?? [],
    qualifications: input.qualifications ?? [],
    eventTitle: (id) => (id ? titles[id]! : "no event"),
    personName: (id) => names[id]!,
  });

describe("roster conflicts", () => {
  it("a double-booked shift names the worker, both events and the overlapping window", () => {
    const conflicts = find({
      shifts: [
        shift("s1", "p1", "e1", T, T + 5 * HOUR),
        shift("s2", "p1", "e2", T + 3 * HOUR, T + 8 * HOUR),
        // Same times, different person: no clash.
        shift("s3", "p2", "e2", T + 3 * HOUR, T + 8 * HOUR),
      ],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: "overlap",
      personId: "p1",
      eventIds: ["e1", "e2"],
      startsAt: T + 3 * HOUR,
      endsAt: T + 5 * HOUR,
    });
    expect(conflicts[0]!.message).toBe(
      `Sam Rivera is booked on Garden lunch and Board dinner at the same time (${formatWindow(T + 3 * HOUR, T + 5 * HOUR)}).`,
    );
  });

  it("finds a clash with a longer shift that is not the neighbour", () => {
    const conflicts = find({
      shifts: [
        shift("s1", "p1", "e1", T, T + 10 * HOUR),
        shift("s2", "p1", "e2", T + HOUR, T + 2 * HOUR),
        shift("s3", "p1", "e2", T + 4 * HOUR, T + 5 * HOUR),
      ],
    });
    expect(conflicts.map((row) => row.id)).toEqual([
      "overlap:s1:s2",
      "overlap:s1:s3",
    ]);
  });

  it("back-to-back, cancelled and finished shifts are not clashes", () => {
    expect(
      find({
        shifts: [
          shift("s1", "p1", "e1", T, T + 2 * HOUR),
          shift("s2", "p1", "e2", T + 2 * HOUR, T + 4 * HOUR),
          shift("s3", "p1", "e2", T, T + 4 * HOUR, { status: "cancelled" }),
          shift("s4", "p1", "e2", T, T + 4 * HOUR, { status: "completed" }),
        ],
      }),
    ).toEqual([]);
  });

  it("approved time off on booked work names the person, event and time", () => {
    const conflicts = find({
      shifts: [shift("s1", "p2", "e1", T, T + 5 * HOUR)],
      timeOff: [
        {
          _id: "t1",
          personId: "p2",
          startsAt: T + 2 * HOUR,
          endsAt: T + 30 * HOUR,
          status: "approved",
        },
        {
          _id: "t2",
          personId: "p2",
          startsAt: T,
          endsAt: T + 5 * HOUR,
          status: "pending",
        },
      ],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: "time_off",
      personId: "p2",
      startsAt: T + 2 * HOUR,
      endsAt: T + 5 * HOUR,
    });
    expect(conflicts[0]!.message).toContain("Kim Lee");
    expect(conflicts[0]!.message).toContain("Garden lunch");
  });

  it("only a certificate the work needs is checked for expiry", () => {
    const qualifications = [
      {
        _id: "q1",
        name: "Food handler",
        expiresAt: T + HOUR,
        status: "active",
      },
      { _id: "q2", name: "Forklift", expiresAt: T - HOUR, status: "active" },
    ];
    const needed = find({
      shifts: [
        shift("s1", "p1", "e1", T, T + 5 * HOUR, {
          requiredQualificationId: "q1",
        }),
      ],
      qualifications,
    });
    expect(needed).toHaveLength(1);
    expect(needed[0]).toMatchObject({ kind: "certificate_expiry" });
    expect(needed[0]!.message).toContain("Food handler");
    expect(needed[0]!.message).toContain("Garden lunch");

    // The expired Forklift card is not needed by this work: nothing shown.
    expect(
      find({
        shifts: [shift("s1", "p1", "e1", T, T + 5 * HOUR)],
        qualifications,
      }),
    ).toEqual([]);
  });

  it("the staffing notification uses the same wording", () => {
    const notifications = deriveNotifications({
      now: T,
      currentAuthSubjectId: undefined,
      events: [
        { _id: "e1", title: "Garden lunch", stage: "planning" },
        { _id: "e2", title: "Board dinner", stage: "planning" },
      ] as unknown as Doc<"events">[],
      people: [
        { _id: "p1", givenName: "Sam", familyName: "Rivera" },
      ] as unknown as Doc<"people">[],
      shifts: [
        shift("s1", "p1", "e1", T, T + 5 * HOUR),
        shift("s2", "p1", "e2", T + 3 * HOUR, T + 8 * HOUR),
      ] as unknown as Doc<"shifts">[],
      incidents: [],
      invoices: [],
      inventoryItems: [],
      ingredients: [],
      qualifications: [],
      timeOffRequests: [],
      vendorOrders: [],
      staffMessages: [],
      prepTaskComments: [],
    }).filter((row) => row.kind === "shift_conflict");
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      id: "shift-conflict:s1:s2",
      link: "/staff/roster",
    });
    expect(notifications[0]!.message).toContain(
      "Garden lunch and Board dinner",
    );
  });
});
