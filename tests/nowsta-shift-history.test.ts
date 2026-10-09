/**
 * Nowsta Time & Attendance export (PL-REPLACEMENT-PROOF, Nowsta history):
 * the reader keeps the shape of the real export the owner saved (same
 * headings, MM/DD/YYYY, "3:30 PM", a blank line and a Totals line), and the
 * plan says what each row will do. Names and numbers here are made up.
 */
import { describe, expect, it } from "vitest";
import {
  NOWSTA_TIME_ATTENDANCE_COLUMNS,
  isNowstaTimeAttendance,
  planNowstaShifts,
  readNowstaShifts,
} from "../src/lib/nowstaShiftHistory";
import { parseCsv } from "../src/lib/tppMenuCsv";

const HEADINGS =
  "Date,Event Name,Employee ID,First Name,Last Name,Phone Number,Email,Position,Scheduled In,Scheduled Out,Actual In,Breaks,Actual Out,Scheduled Hours,Actual Hours,Rate,Scheduled Cost,Actual Cost,Bill Rate,Bill Total,Notes,Approved";

const FILE = [
  HEADINGS,
  "06/20/2026,Park Wedding,,Ana ,Reyes,509-555-0101,ana@example.test,Catering - BOH,3:30 PM,11:30 PM,,,,8.000,,$19.00,$152.00,,$225.00,,,",
  "06/20/2026,Park Wedding,,Ben,Ortiz,509-555-0102,BEN@example.test,Catering - FOH,6:00 PM,10:00 PM,6:05 PM,0:30,10:15 PM,4.000,4.17,$25.00,$100.00,$104.25,$225.00,,Stayed late,Yes",
  "06/21/2026,Late Party,,Cal,Diaz,,,Catering - FOH,8:00 PM,1:00 AM,,,,5.000,,$25.00,$125.00,,$225.00,,,",
  "13/40/2026,Park Wedding,,Dee,Fox,,,Catering - FOH,6:00 PM,10:00 PM,,,,4.000,,,,,,,,",
  ",,,,,,,,,,,,,,,,,,,,,",
  ",Totals,,,,,,,,,,,,21.000,,,$377.00,,,,,",
].join("\n");

describe("Nowsta Time & Attendance export", () => {
  const grid = parseCsv(FILE);

  it("is told apart from other files and every column has a home", () => {
    expect(isNowstaTimeAttendance(grid)).toBe(true);
    expect(isNowstaTimeAttendance([["Staff Member", "Email"]])).toBe(false);
    expect(NOWSTA_TIME_ATTENDANCE_COLUMNS.map((c) => c.column).join(",")).toBe(
      HEADINGS,
    );
    // Pay and billing figures are never kept.
    for (const column of [
      "Rate",
      "Scheduled Cost",
      "Actual Cost",
      "Bill Rate",
      "Bill Total",
    ]) {
      expect(
        NOWSTA_TIME_ATTENDANCE_COLUMNS.find((c) => c.column === column)?.goesTo,
      ).toBe("not kept");
    }
  });

  it("reads planned and worked times, overnight ends and bad rows", () => {
    const read = readNowstaShifts(grid);
    expect(read.rows).toHaveLength(3);
    expect(read.problems).toEqual([
      { line: 5, reason: '"13/40/2026" is not a date.' },
    ]);
    const [ana, ben, cal] = read.rows;
    expect(ana).toMatchObject({
      date: "2026-06-20",
      eventName: "Park Wedding",
      givenName: "Ana",
      familyName: "Reyes",
      email: "ana@example.test",
      position: "Catering - BOH",
      startsAt: new Date(2026, 5, 20, 15, 30).getTime(),
      endsAt: new Date(2026, 5, 20, 23, 30).getTime(),
      kept: {},
    });
    expect(ana!.actualStartsAt).toBeUndefined();
    expect(ben).toMatchObject({
      email: "ben@example.test",
      actualStartsAt: new Date(2026, 5, 20, 18, 5).getTime(),
      actualEndsAt: new Date(2026, 5, 20, 22, 15).getTime(),
      kept: { Breaks: "0:30", Notes: "Stayed late", Approved: "Yes" },
    });
    // 8 PM to 1 AM ends the next day.
    expect(cal!.endsAt).toBe(new Date(2026, 5, 22, 1, 0).getTime());
    expect(new Set(read.rows.map((row) => row.externalId)).size).toBe(3);
    // No pay figure travels with a row.
    expect(JSON.stringify(read.rows)).not.toMatch(/\$|Rate|Cost|Bill/);
    // A second read gives the same ids.
    expect(readNowstaShifts(grid).rows.map((r) => r.externalId)).toEqual(
      read.rows.map((r) => r.externalId),
    );
  });

  it("plans each row: save, add the worker, wait, ahead, already in", () => {
    const { rows } = readNowstaShifts(grid);
    const [ana, ben, cal] = rows;
    const people = [
      {
        _id: "p-ben",
        givenName: "Benjamin",
        familyName: "Ortiz",
        email: "ben@example.test",
        status: "active",
      },
      {
        _id: "p-left",
        givenName: "Ana",
        familyName: "Reyes",
        email: "old@example.test",
        status: "terminated",
      },
    ];
    const matches = [
      { externalId: ana!.externalId, imported: false, eventIds: ["e-park"] },
      { externalId: ben!.externalId, imported: false, eventIds: ["e-park"] },
      { externalId: cal!.externalId, imported: false, eventIds: [] },
    ];
    const july = new Date(2026, 6, 1).getTime();
    const steps = planNowstaShifts(rows, people, matches, july);
    expect(steps.map((step) => step.kind)).toEqual(["save", "save", "noEvent"]);
    // Ana is new (the left person is not matched); Ben matches by email.
    expect(steps[0]).toMatchObject({ eventId: "e-park" });
    expect((steps[0] as { personId?: string }).personId).toBeUndefined();
    expect(steps[1]).toMatchObject({ personId: "p-ben", eventId: "e-park" });

    // Same phone, no email match: found by phone.
    const byPhone = planNowstaShifts(
      [ana!],
      [
        {
          _id: "p-ana",
          givenName: "A",
          familyName: "R",
          email: "x@example.test",
          phone: "(509) 555-0101",
          status: "active",
        },
      ],
      matches,
      july,
    );
    expect(byPhone[0]).toMatchObject({ kind: "save", personId: "p-ana" });

    expect(
      planNowstaShifts(
        rows,
        people,
        [{ ...matches[0]!, imported: true }],
        july,
      )[0]!.kind,
    ).toBe("done");
    expect(
      planNowstaShifts(
        rows,
        people,
        matches,
        new Date(2026, 5, 20, 12).getTime(),
      )[0]!.kind,
    ).toBe("ahead");
    expect(
      planNowstaShifts(
        rows,
        people,
        [{ ...matches[0]!, eventIds: ["a", "b"] }],
        july,
      )[0]!.kind,
    ).toBe("twoEvents");
    // No email and not on the team: cannot be added.
    expect(
      planNowstaShifts(
        [cal!],
        [],
        [
          {
            externalId: cal!.externalId,
            imported: false,
            eventIds: ["e-late"],
          },
        ],
        july,
      )[0]!.kind,
    ).toBe("noPerson");
  });
});
