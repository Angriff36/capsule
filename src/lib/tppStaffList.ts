// Reading the old system's "Staff Address & Phone List" report
// (PL-SOURCE-DATASETS, AC-057 "staff directory"). Built against the real
// report (.artifacts/tpp-migration-20260905/tpp_migration/reports/
// company_wide/Staff_Address_&_Phone_List.xlsx): a title line, a blank line,
// the heading row (Staff Member, Home, Work, Mobile, Email, Address), then
// one row per active staff member as "Last, First".
//
// The report does not keep values under their headings (one real row has
// the email under Home), and its line wrapping leaves a space inside an
// email ("tim@mangiacatering co.com"). So each value is read by its shape:
// a value with "@" is the email, a value with 7 or more digits is a phone,
// and any other value is the address.

/** Where every column of the report goes. */
export const TPP_STAFF_LIST_COLUMNS: ReadonlyArray<{
  column: string;
  goesTo: "person" | "not kept";
  note: string;
}> = [
  {
    column: "Staff Member",
    goesTo: "person",
    note: '"Last, First" is the last name and first name; a person with the same email or name is the same person',
  },
  {
    column: "Mobile",
    goesTo: "person",
    note: "phone (used first, because Capsule sends text alerts to it)",
  },
  {
    column: "Home",
    goesTo: "person",
    note: "phone when there is no mobile number",
  },
  {
    column: "Work",
    goesTo: "person",
    note: "phone when there is no mobile or home number",
  },
  {
    column: "Email",
    goesTo: "person",
    note: "email; spaces the report's line wrapping left inside it are taken out",
  },
  {
    column: "Address",
    goesTo: "person",
    note: "address, as one line (the report prints it as one text)",
  },
];

export type TppStaffRow = {
  givenName: string;
  familyName: string;
  email?: string;
  phone?: string;
  /** Other phone numbers of the row; Capsule keeps one phone per person. */
  otherPhones: string[];
  address?: string;
};

const HEADING_FIRST = "staff member";
const PHONE_ORDER = ["mobile", "home", "work"] as const;

const clean = (value: string | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

function headingIndex(grid: readonly (readonly string[])[]): number {
  return grid.findIndex(
    (row) =>
      clean(row[0]).toLowerCase() === HEADING_FIRST &&
      row.some((cell) => clean(cell).toLowerCase() === "email"),
  );
}

/** True when the sheet is the old system's staff address and phone list. */
export function isTppStaffList(grid: readonly (readonly string[])[]): boolean {
  return headingIndex(grid) >= 0;
}

function splitName(text: string): { givenName: string; familyName: string } {
  const comma = text.indexOf(",");
  if (comma >= 0) {
    return {
      familyName: text.slice(0, comma).trim(),
      givenName: text.slice(comma + 1).trim(),
    };
  }
  const space = text.lastIndexOf(" ");
  return space > 0
    ? {
        givenName: text.slice(0, space).trim(),
        familyName: text.slice(space + 1).trim(),
      }
    : { givenName: text, familyName: "" };
}

const isEmail = (value: string) => value.includes("@");
const isPhone = (value: string) => value.replace(/\D/g, "").length >= 7;

/** Read every staff row of the report. */
export function readTppStaffList(
  grid: readonly (readonly string[])[],
): TppStaffRow[] {
  const at = headingIndex(grid);
  if (at < 0) return [];
  const heading = grid[at]!.map((cell) => clean(cell).toLowerCase());
  const rows: TppStaffRow[] = [];
  for (const row of grid.slice(at + 1)) {
    const name = clean(row[0]);
    if (!name || /^printed date/i.test(name)) continue;
    let email: string | undefined;
    const phones: { value: string; column: string }[] = [];
    const addressParts: string[] = [];
    row.forEach((cell, index) => {
      if (index === 0) return;
      const value = clean(cell);
      if (!value) return;
      if (isEmail(value) && email === undefined) {
        email = value.replace(/\s+/g, "");
      } else if (isPhone(value) && !/[a-z]{3,}/i.test(value)) {
        phones.push({ value, column: heading[index] ?? "" });
      } else {
        addressParts.push(value);
      }
    });
    const ordered = [
      ...PHONE_ORDER.flatMap((column) =>
        phones.filter((phone) => phone.column === column),
      ),
      ...phones.filter(
        (phone) => !(PHONE_ORDER as readonly string[]).includes(phone.column),
      ),
    ].map((phone) => phone.value);
    rows.push({
      ...splitName(name),
      ...(email ? { email } : {}),
      ...(ordered[0] ? { phone: ordered[0] } : {}),
      otherPhones: ordered.slice(1),
      ...(addressParts.length > 0 ? { address: addressParts.join(", ") } : {}),
    });
  }
  return rows;
}

/** The part of a Capsule person the staff list is matched against. */
export type StaffListPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  email: string;
  status: string;
  phone?: string | null;
  addressLine1?: string | null;
  deletedAt?: unknown;
};

export type StaffListStep =
  | { kind: "add"; row: TppStaffRow }
  | {
      kind: "fill";
      row: TppStaffRow;
      person: StaffListPerson;
      phone?: string;
      address?: string;
    }
  | { kind: "same"; row: TppStaffRow; person: StaffListPerson }
  | { kind: "cannotAdd"; row: TppStaffRow };

const key = (value: string | null | undefined) =>
  clean(value ?? "").toLowerCase();

/**
 * What saving the list does for each row. A person already in Capsule (same
 * email, else same first and last name) keeps what Capsule has; only a blank
 * phone or address is filled from the list. A row with no person is added,
 * unless it has no email (Capsule needs one to add a person).
 */
export function planStaffList(
  rows: readonly TppStaffRow[],
  people: readonly StaffListPerson[],
): StaffListStep[] {
  const current = people.filter(
    (person) => person.deletedAt == null && person.status !== "terminated",
  );
  return rows.map((row): StaffListStep => {
    // A name match counts only when one person has that name; with two, the
    // row could fill the wrong person's phone or address.
    const sameName = current.filter(
      (one) =>
        key(one.givenName) === key(row.givenName) &&
        key(one.familyName) === key(row.familyName),
    );
    const person =
      (row.email
        ? current.find((one) => key(one.email) === key(row.email))
        : undefined) ?? (sameName.length === 1 ? sameName[0] : undefined);
    if (!person) {
      return row.email && row.givenName && row.familyName
        ? { kind: "add", row }
        : { kind: "cannotAdd", row };
    }
    // correctIdentity only runs on an active person; a paused one keeps its phone.
    const phone =
      row.phone && !key(person.phone) && person.status === "active"
        ? row.phone
        : undefined;
    const address =
      row.address && !key(person.addressLine1) ? row.address : undefined;
    return phone || address
      ? {
          kind: "fill",
          row,
          person,
          ...(phone ? { phone } : {}),
          ...(address ? { address } : {}),
        }
      : { kind: "same", row, person };
  });
}
