/**
 * Runtime proof (AC-508, PL-SCHEDULE-CORRECTION, spec §12 mobile schedule).
 * A re-sent week asks the person to confirm again and shows them what it said
 * before; re-sending the same week does not claim a change. The person reads
 * their own week (the My Day screen's read) with the change on it.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { stubTimingEnv } from "./timing-rules.runtime.helpers";

const TENANT = "tenant-schedule-ack";
const WEEK_START = Date.UTC(2030, 6, 15);
const WEEK_END = WEEK_START + 7 * 24 * 60 * 60_000;

beforeEach(() => stubTimingEnv());
afterEach(() => vi.unstubAllEnvs());

describe("schedule change acknowledgement (AC-508)", () => {
  it("a republished schedule requires a fresh acknowledgement and shows the change", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      subject: "ack-owner",
      org_id: TENANT,
      role: "owner",
    });
    const person = (await owner.mutation(api.mutations.Person_createViaHire, {
      givenName: "Dana",
      familyName: "Crew",
      email: "dana.ack@proof.example",
      role: "event_staff",
      employmentType: "part_time",
      authSubjectId: "ack-dana",
    })) as { docId: Id<"people"> };
    const dana = t.withIdentity({
      subject: "ack-dana",
      org_id: TENANT,
      role: "event_staff",
    });
    const notice = (await owner.mutation(
      api.mutations.WeeklyScheduleNotice_createViaPublishSchedule,
      {
        personId: person.docId,
        recipientAuthSubjectId: "ack-dana",
        weekStartsAt: WEEK_START,
        weekEndsAt: WEEK_END,
        shiftCount: 2,
        shiftSummary: "Tue 4 PM Server · Sat 2 PM Server",
      },
    )) as { docId: Id<"weeklyScheduleNotices"> };
    const read = async () =>
      (await dana.query(api.queries.listWeeklyScheduleNotice, {})).find(
        (row: { _id: string }) => row._id === notice.docId,
      );
    await dana.mutation(api.mutations.WeeklyScheduleNotice_acknowledge, {
      docId: notice.docId,
    });
    expect((await read()).acknowledgedAt).toEqual(expect.any(Number));
    expect((await read()).changedAt ?? null).toBeNull();

    // The manager re-sends a changed week.
    const version = (await t.run((ctx) => ctx.db.get(notice.docId)))!.version;
    await owner.mutation(api.mutations.WeeklyScheduleNotice_republishSchedule, {
      docId: notice.docId,
      version,
      shiftCount: 2,
      shiftSummary: "Tue 4 PM Server · Sat 12 PM Server",
    });
    const changed = await read();
    expect(changed.acknowledgedAt ?? null).toBeNull();
    expect(changed.shiftSummary).toContain("Sat 12 PM");
    expect(changed.previousShiftSummary).toContain("Sat 2 PM");
    expect(changed.changedAt).toEqual(expect.any(Number));

    // Dana confirms again.
    await dana.mutation(api.mutations.WeeklyScheduleNotice_acknowledge, {
      docId: notice.docId,
    });
    expect((await read()).acknowledgedAt).toEqual(expect.any(Number));

    // Re-sending the same week asks again but claims no new change.
    const again = (await t.run((ctx) => ctx.db.get(notice.docId)))!;
    await owner.mutation(api.mutations.WeeklyScheduleNotice_republishSchedule, {
      docId: notice.docId,
      version: again.version,
      shiftCount: 2,
      shiftSummary: "Tue 4 PM Server · Sat 12 PM Server",
    });
    const same = await read();
    expect(same.acknowledgedAt ?? null).toBeNull();
    expect(same.changedAt).toBe(changed.changedAt);
    expect(same.previousShiftSummary).toBe(changed.previousShiftSummary);
  });
});
