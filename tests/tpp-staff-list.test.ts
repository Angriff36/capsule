/**
 * The old system's Staff Address & Phone List (PL-SOURCE-DATASETS, AC-057
 * "staff directory"). The sample is the real report's layout and its real
 * faults: an email under the Home heading, and a space the line wrapping
 * left inside an email.
 */
import { describe, expect, it } from "vitest";
import {
  TPP_STAFF_LIST_COLUMNS,
  isTppStaffList,
  planStaffList,
  readTppStaffList,
  type StaffListPerson,
} from "../src/lib/tppStaffList";

const blank = Array.from({ length: 13 }, () => "");
const row = (...cells: string[]) => [...cells, ...blank].slice(0, 13);

const GRID: string[][] = [
  row("Active Staff Address & Phone List"),
  row(),
  row(
    "Staff Member",
    "Home",
    "",
    "",
    "Work",
    "",
    "Mobile",
    "",
    "Email",
    "",
    "Address",
  ),
  row(
    "Mitchell, Tim",
    "(208) 819-4501",
    "",
    "",
    "",
    "",
    "",
    "",
    "tim@mangiacatering co.com",
  ),
  row("Mitchell, Joshua", "josh@mangiacatering co.com"),
  row(
    "Ruhter, Kayden",
    "208.952.8941",
    "",
    "",
    "",
    "",
    "",
    "",
    "kayden@mangiacater ingco.com",
  ),
  row(),
  row(),
];

describe("old staff list", () => {
  it("names a home for every column of the report", () => {
    const heading = GRID[2]!.filter(Boolean);
    expect(TPP_STAFF_LIST_COLUMNS.map((c) => c.column).sort()).toEqual(
      [...heading].sort(),
    );
    expect(isTppStaffList(GRID)).toBe(true);
    expect(isTppStaffList([row("Inventory Item", "Stock #")])).toBe(false);
  });

  it("reads each value by its shape, wherever the report put it", () => {
    expect(readTppStaffList(GRID)).toEqual([
      {
        givenName: "Tim",
        familyName: "Mitchell",
        email: "tim@mangiacateringco.com",
        phone: "(208) 819-4501",
        otherPhones: [],
      },
      {
        givenName: "Joshua",
        familyName: "Mitchell",
        email: "josh@mangiacateringco.com",
        otherPhones: [],
      },
      {
        givenName: "Kayden",
        familyName: "Ruhter",
        email: "kayden@mangiacateringco.com",
        phone: "208.952.8941",
        otherPhones: [],
      },
    ]);
  });

  it("uses the mobile number first and keeps an address", () => {
    const [one] = readTppStaffList([
      GRID[2]!,
      row(
        "Lee, Ana",
        "555-111-2222",
        "",
        "",
        "",
        "",
        "555-333-4444",
        "",
        "ana@x.com",
        "",
        "12 Main St, Boise ID",
      ),
    ]);
    expect(one).toMatchObject({
      phone: "555-333-4444",
      otherPhones: ["555-111-2222"],
      address: "12 Main St, Boise ID",
    });
  });

  it("adds new people, fills only blanks of people already here, and never doubles", () => {
    const people: StaffListPerson[] = [
      {
        _id: "p1",
        givenName: "Tim",
        familyName: "Mitchell",
        email: "TIM@mangiacateringco.com",
        status: "active",
        phone: null,
      },
      {
        _id: "p2",
        givenName: "Kayden",
        familyName: "Ruhter",
        email: "other@example.com",
        status: "active",
        phone: "208-000-0000",
      },
    ];
    const steps = planStaffList(readTppStaffList(GRID), people);
    expect(steps.map((step) => step.kind)).toEqual(["fill", "add", "same"]);
    expect(steps[0]).toMatchObject({ phone: "(208) 819-4501" });
    expect(
      planStaffList(
        [{ givenName: "No", familyName: "Email", otherPhones: [] }],
        [],
      )[0]!.kind,
    ).toBe("cannotAdd");
  });
});
