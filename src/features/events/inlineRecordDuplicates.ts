/**
 * Look-alike detection for the New Event inline "Create client" / "Create
 * venue" forms. The Ewing Wedding build (#368) produced two "Kamini Singh"
 * clients and booked against an imported, capacity-0 "Singh Campsite" instead
 * of the freshly typed one — nothing ever said "this already exists".
 *
 * Pure: takes the typed name (+ optional email) and the live rows, returns the
 * rows that are the same record in all likelihood. Never blocks — the caller
 * offers "use existing" or "create anyway".
 */

export type NamedRecord = {
  _id: string;
  name: string;
  email?: string | null;
};

export function normalizeRecordName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string): number {
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 0; i < left.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < right.length; j += 1) {
      current.push(
        Math.min(
          current[j] + 1,
          previous[j + 1] + 1,
          previous[j] + (left[i] === right[j] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  return 1 - editDistance(left, right) / Math.max(left.length, right.length);
}

export function findLikelyDuplicates<T extends NamedRecord>(
  input: { name: string; email?: string | null },
  rows: readonly T[],
): T[] {
  const wanted = normalizeRecordName(input.name);
  const wantedEmail = normalizeRecordName(input.email);
  if (!wanted && !wantedEmail) return [];
  return rows.filter((row) => {
    const rowName = normalizeRecordName(row.name);
    if (wantedEmail && normalizeRecordName(row.email) === wantedEmail) {
      return true;
    }
    if (!wanted || !rowName) return false;
    // Exact after normalization, or a one-or-two-letter slip on a real name.
    return similarity(wanted, rowName) >= 0.88;
  });
}
