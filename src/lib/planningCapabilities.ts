/**
 * What equipment gives and what it needs, for the planning board.
 *
 * "Gives" is a list of supplies with an amount: a generator gives
 * power:240v x 2, a propane cylinder gives fuel:propane x 1. The site can
 * give supplies too (the venue has two 240 volt outlets).
 *
 * "Needs" is a list of requirements; each one is met by ANY of its supplies:
 * an oven needs 1 of power:240v OR fuel:propane.
 *
 * The names are the company's own words. A need is met only by a supply with
 * the same name, so "power:240v" and "240v" are two different things.
 *
 * Pure. Saved as JSON on Equipment (providesJson, needsJson) and on
 * EventPlanNeeds (siteProvidesJson).
 */

export type Supply = { key: string; amount: number };
export type Need = { label: string; anyOf: string[]; amount: number };

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const positive = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

/** Supply names compare in lower case with single spaces. */
export function supplyKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseSupplies(json: string | null | undefined): Supply[] {
  if (!json) return [];
  try {
    const rows: unknown = JSON.parse(json);
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => {
        const entry = row as Record<string, unknown>;
        return {
          key: supplyKey(text(entry.key)),
          amount: positive(entry.amount),
        };
      })
      .filter((row) => row.key !== "" && row.amount > 0);
  } catch {
    return [];
  }
}

export function parseNeeds(json: string | null | undefined): Need[] {
  if (!json) return [];
  try {
    const rows: unknown = JSON.parse(json);
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => {
        const entry = row as Record<string, unknown>;
        const anyOf = Array.isArray(entry.anyOf)
          ? entry.anyOf.map((key) => supplyKey(text(key))).filter(Boolean)
          : [];
        return {
          label: text(entry.label) || anyOf.join(" or "),
          anyOf,
          amount: positive(entry.amount),
        };
      })
      .filter((row) => row.anyOf.length > 0 && row.amount > 0);
  } catch {
    return [];
  }
}

export const suppliesJson = (rows: Supply[]) =>
  rows.length > 0 ? JSON.stringify(rows) : undefined;
export const needsJson = (rows: Need[]) =>
  rows.length > 0 ? JSON.stringify(rows) : undefined;

/** "power:240v x 2, water x 1" as typed in a form, and back. */
export function suppliesFromText(raw: string): Supply[] {
  return raw
    .split(/[\n,]/)
    .map((part) => {
      const match = part.trim().match(/^(.*?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?$/i);
      return {
        key: supplyKey(match?.[1] ?? ""),
        amount: match?.[2] ? Number(match[2]) : 1,
      };
    })
    .filter((row) => row.key !== "" && row.amount > 0);
}

export function suppliesToText(rows: Supply[]): string {
  return rows.map((row) => `${row.key} x ${row.amount}`).join(", ");
}

/** "power:240v or fuel:propane x 1" per line, and back. */
export function needsFromText(raw: string): Need[] {
  return raw
    .split("\n")
    .map((line) => {
      const match = line.trim().match(/^(.*?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?$/i);
      const anyOf = (match?.[1] ?? "")
        .split(/\s+or\s+/i)
        .map(supplyKey)
        .filter(Boolean);
      return {
        label: anyOf.join(" or "),
        anyOf,
        amount: match?.[2] ? Number(match[2]) : 1,
      };
    })
    .filter((row) => row.anyOf.length > 0 && row.amount > 0);
}

export function needsToText(rows: Need[]): string {
  return rows
    .map((row) => `${row.anyOf.join(" or ")} x ${row.amount}`)
    .join("\n");
}

/** Above this many units, a hold's need is matched as one amount. */
const UNIT_LIMIT = 24;

export type PlannedPiece = {
  /** Stable id of the hold on the event. */
  id: string;
  name: string;
  quantity: number;
  provides: Supply[];
  needs: Need[];
};

export type UnmetNeed = {
  pieceId: string;
  name: string;
  label: string;
  anyOf: string[];
  needed: number;
};

/**
 * Which needs on one event are not met. Every supply is an amount that is
 * used up: one 240 volt outlet runs one oven, not two.
 *
 * A piece only gives its supplies once its own needs are met (a generator
 * with no fuel gives no power), so two pieces cannot feed each other from
 * nothing. Needs with fewer choices are matched first, then every way of
 * choosing is tried, so a need is reported only when no choice works.
 */
export function unmetNeeds(
  pieces: readonly PlannedPiece[],
  site: readonly Supply[],
): UnmetNeed[] {
  const supply = new Map<string, number>();
  for (const row of site)
    supply.set(row.key, (supply.get(row.key) ?? 0) + row.amount);

  // Pieces whose own needs can be met come online and add their supplies.
  const online = new Set<string>();
  for (let pass = 0; pass <= pieces.length; pass += 1) {
    let changed = false;
    for (const piece of pieces) {
      if (online.has(piece.id) || piece.quantity <= 0) continue;
      const met = piece.needs.every((need) =>
        need.anyOf.some(
          (key) => (supply.get(key) ?? 0) >= need.amount * piece.quantity,
        ),
      );
      if (!met) continue;
      online.add(piece.id);
      changed = true;
      for (const row of piece.provides)
        supply.set(
          row.key,
          (supply.get(row.key) ?? 0) + row.amount * piece.quantity,
        );
    }
    if (!changed) break;
  }

  // One demand per unit, so two ovens can run one on power and one on
  // propane. A large pooled amount stays one demand to keep the search small.
  const demands = pieces
    .flatMap((piece) =>
      piece.needs.flatMap((need) => {
        const units =
          Number.isInteger(piece.quantity) && piece.quantity <= UNIT_LIMIT
            ? piece.quantity
            : 1;
        const each = (need.amount * piece.quantity) / units;
        return Array.from({ length: units }, () => ({ piece, need, each }));
      }),
    )
    .sort((a, b) => a.need.anyOf.length - b.need.anyOf.length);

  // A piece never feeds its own need.
  const ownGive = (piece: PlannedPiece, key: string) =>
    online.has(piece.id)
      ? (piece.provides.find((row) => row.key === key)?.amount ?? 0) *
        piece.quantity
      : 0;

  const left = new Map(supply);
  let tries = 0;
  const place = (index: number): boolean => {
    if (index === demands.length) return true;
    tries += 1;
    if (tries > 10_000) return false;
    const { piece, need, each: needed } = demands[index]!;
    for (const key of need.anyOf) {
      if ((left.get(key) ?? 0) - ownGive(piece, key) >= needed) {
        left.set(key, (left.get(key) ?? 0) - needed);
        if (place(index + 1)) return true;
        left.set(key, (left.get(key) ?? 0) + needed);
      }
    }
    return false;
  };
  if (place(0)) return [];

  // No full match: fill greedily and report what is left over.
  const rest = new Map(supply);
  const unmet: UnmetNeed[] = [];
  for (const { piece, need, each: needed } of demands) {
    const key = need.anyOf.find(
      (candidate) =>
        (rest.get(candidate) ?? 0) - ownGive(piece, candidate) >= needed,
    );
    if (key) {
      rest.set(key, (rest.get(key) ?? 0) - needed);
      continue;
    }
    const same = unmet.find(
      (row) => row.pieceId === piece.id && row.label === need.label,
    );
    if (same) same.needed += needed;
    else
      unmet.push({
        pieceId: piece.id,
        name: piece.name,
        label: need.label,
        anyOf: need.anyOf,
        needed,
      });
  }
  return unmet;
}
