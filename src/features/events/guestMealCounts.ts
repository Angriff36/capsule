import { guestTableLabel } from "./guestTableLabel";

/** The guest fields plated service reads. */
export interface PlatedGuest {
  name: string;
  rsvpStatus: string;
  tableAssignment?: string | null;
  seatNumber?: number | null;
  placeCardName?: string | null;
  entreeEventDishId?: string | null;
  dietaryRestrictions?: string[] | null;
  allergenRestrictions?: string[] | null;
  specialMealRequired?: boolean;
}

/** One event-menu line a guest can pick as an entrée. */
export interface EntreeLine {
  id: string;
  name: string;
  course?: string | null;
  quantityServings: number;
  version?: number;
}

export interface EntreeCount {
  line: EntreeLine;
  count: number;
  /** Menu servings differ from the guest picks. */
  outOfSync: boolean;
}

export interface GuestMealCounts {
  rows: EntreeCount[];
  /** Guests who will eat (not declined) with no entrée picked yet. */
  unchosen: number;
  /** Guests who will eat. */
  eating: number;
}

const ENTREE_COURSE = /entr|main|plated/i;

/** Declined guests eat nothing; pending and confirmed guests are planned for. */
export function isEatingGuest(guest: PlatedGuest): boolean {
  return guest.rsvpStatus !== "declined";
}

/**
 * Entrée lines are main-course lines plus any line a guest already picked,
 * so a pick on a mis-coursed line still counts and can still be reset to zero.
 */
export function countGuestMeals(
  guests: readonly PlatedGuest[],
  lines: readonly EntreeLine[],
): GuestMealCounts {
  const counts = new Map<string, number>();
  let unchosen = 0;
  let eating = 0;
  for (const guest of guests) {
    if (!isEatingGuest(guest)) continue;
    eating += 1;
    if (!guest.entreeEventDishId) {
      unchosen += 1;
      continue;
    }
    counts.set(
      guest.entreeEventDishId,
      (counts.get(guest.entreeEventDishId) ?? 0) + 1,
    );
  }
  const rows = lines
    .filter(
      (line) => ENTREE_COURSE.test(line.course ?? "") || counts.has(line.id),
    )
    .map((line) => {
      const count = counts.get(line.id) ?? 0;
      return { line, count, outOfSync: count !== line.quantityServings };
    });
  return { rows, unchosen, eating };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

/** Kitchen count sheet: one row per entrée, then guests with special needs. */
export function kitchenCountSheetCsv(
  counts: GuestMealCounts,
  guests: readonly PlatedGuest[],
  lines: readonly EntreeLine[],
): string {
  const names = new Map(lines.map((line) => [line.id, line.name]));
  const rows: (string | number)[][] = [["Entrée", "Course", "Count"]];
  for (const row of counts.rows)
    rows.push([row.line.name, row.line.course ?? "", row.count]);
  rows.push(["No entrée picked", "", counts.unchosen]);
  rows.push(["Total guests", "", counts.eating]);
  const special = guests.filter(
    (guest) =>
      isEatingGuest(guest) &&
      (guest.specialMealRequired ||
        (guest.allergenRestrictions ?? []).length > 0 ||
        (guest.dietaryRestrictions ?? []).length > 0),
  );
  if (special.length) {
    rows.push([]);
    rows.push(["Guest", "Table", "Seat", "Entrée", "Dietary", "Allergens"]);
    for (const guest of special) rows.push(guestCells(guest, names));
  }
  return toCsv(rows);
}

function guestCells(
  guest: PlatedGuest,
  names: Map<string, string>,
): (string | number)[] {
  return [
    guest.placeCardName?.trim() || guest.name,
    guest.tableAssignment ? guestTableLabel(guest.tableAssignment) : "",
    guest.seatNumber ?? "",
    guest.entreeEventDishId ? (names.get(guest.entreeEventDishId) ?? "") : "",
    (guest.dietaryRestrictions ?? []).join("; "),
    (guest.allergenRestrictions ?? []).join("; "),
  ];
}

/** Place cards in table, then seat, then name order. */
export function placeCardListCsv(
  guests: readonly PlatedGuest[],
  lines: readonly EntreeLine[],
): string {
  const names = new Map(lines.map((line) => [line.id, line.name]));
  const sorted = guests
    .filter(isEatingGuest)
    .sort(
      (left, right) =>
        (left.tableAssignment ?? "￿").localeCompare(
          right.tableAssignment ?? "￿",
          undefined,
          { numeric: true },
        ) ||
        (left.seatNumber ?? Infinity) - (right.seatNumber ?? Infinity) ||
        left.name.localeCompare(right.name),
    );
  return toCsv([
    ["Name on card", "Table", "Seat", "Entrée", "Dietary", "Allergens"],
    ...sorted.map((guest) => guestCells(guest, names)),
  ]);
}
