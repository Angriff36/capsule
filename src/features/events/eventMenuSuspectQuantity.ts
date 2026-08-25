export type SuspectQuantityInput = {
  name: string;
  unit: string;
  quantity: number;
  servings?: number;
  suspect?: boolean;
};

export type SuspectRecipeLine = {
  name: string;
  unit: string;
  quantity: number;
  suspect?: boolean;
  prepNotes?: string | null;
};

export type SuspectPrepRow = {
  name: string;
  quantity: number;
  unit: string;
  flag: string;
};

function lineLooksSuspect(line: SuspectRecipeLine): boolean {
  if (line.suspect === true) return true;
  return /tpp unit looks wrong|keep 196/i.test(String(line.prepNotes ?? ""));
}

/**
 * Keep TPP numbers even when they look wrong. Flag sliced radish at
 * ~2 lb/guest (196 lb for 98) instead of silently converting the unit.
 * `suspect: true` flags a line even when the task/template name is
 * "Garnish kit" rather than "Sliced radish".
 */
export function suspectPrepQuantityFlag(
  input: SuspectQuantityInput,
): string | null {
  const displayName = String(input.name ?? "");
  const name = displayName.toLowerCase();
  const unit = String(input.unit ?? "").toLowerCase();
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const servings = Number(input.servings);
  const perGuest =
    Number.isFinite(servings) && servings > 0 ? quantity / servings : quantity;
  const isRadish = name.includes("radish");
  const isPound = unit === "pound" || unit === "lb" || unit === "lbs";
  const flagged =
    input.suspect === true || (isRadish && isPound && perGuest >= 1);
  if (!flagged) return null;
  return `TPP unit looks wrong: ${quantity} ${input.unit} of ${displayName} (~${perGuest.toFixed(2)} per guest). The number is kept; it is not converted.`;
}

/** Scale per-serving recipe lines and flag TPP-suspect quantities. */
export function suspectRowsFromRecipeLines(
  lines: readonly SuspectRecipeLine[],
  servings: number,
): SuspectPrepRow[] {
  const headcount = Number(servings);
  const rows: SuspectPrepRow[] = [];
  for (const line of lines) {
    const perServing = Number(line.quantity);
    if (!Number.isFinite(perServing) || perServing <= 0) continue;
    const quantity =
      Number.isFinite(headcount) && headcount > 0
        ? perServing * headcount
        : perServing;
    const flag = suspectPrepQuantityFlag({
      name: line.name,
      unit: line.unit,
      quantity,
      servings: headcount,
      suspect: lineLooksSuspect(line),
    });
    if (flag) {
      rows.push({
        name: line.name,
        quantity,
        unit: line.unit,
        flag,
      });
    }
  }
  return rows;
}
