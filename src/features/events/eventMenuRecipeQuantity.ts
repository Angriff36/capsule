/**
 * Event-menu / kitchen recipe qty persist.
 * Save qty was Number() on a type="number" field — nearby floats (0.02 to
 * 0.02002) and caret-jump digit reorder (0.062 to ~0.082). Keep the typed
 * decimal via a text+decimal field and decimal(10, 4) scale.
 */

export const RECIPE_QUANTITY_SCALE = 4;
export const RECIPE_QUANTITY_INPUT_TYPE = "text" as const;
export const RECIPE_QUANTITY_INPUT_MODE = "decimal" as const;
export const RECIPE_QUANTITY_COMMIT_ERROR =
  "Recipe quantity must be greater than 0.";

const TYPED_DECIMAL = /^(?:\d+|\d+\.\d*|\.\d+)$/;
const SCALE = 10 ** RECIPE_QUANTITY_SCALE;

export type RecipeQuantityCommit =
  { ok: true; quantity: number } | { ok: false; error: string };

function formatScaledInt(scaled: number): string {
  const whole = Math.trunc(scaled / SCALE);
  const frac = String(scaled % SCALE)
    .padStart(RECIPE_QUANTITY_SCALE, "0")
    .replace(/0+$/, "");
  return frac.length === 0 ? String(whole) : `${whole}.${frac}`;
}

function scaledIntFromDecimalText(text: string): number | null {
  if (!TYPED_DECIMAL.test(text)) return null;
  const [wholeRaw, fracRaw = ""] = text.split(".");
  const whole = wholeRaw === "" ? 0 : Number(wholeRaw);
  if (!Number.isInteger(whole) || whole < 0) return null;
  if (String(whole).length > 10 - RECIPE_QUANTITY_SCALE) return null;
  const keep = fracRaw.slice(0, RECIPE_QUANTITY_SCALE);
  const rest = fracRaw.slice(RECIPE_QUANTITY_SCALE);
  let frac = Number(keep.padEnd(RECIPE_QUANTITY_SCALE, "0"));
  if (rest !== "" && Number(rest[0] ?? "0") >= 5) {
    frac += 1;
  }
  if (frac >= SCALE) {
    return (whole + 1) * SCALE;
  }
  return whole * SCALE + frac;
}

/** Persist the typed decimal at decimal(10, 4). 0.02 stays 0.02. */
export function persistRecipeQuantity(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  const scaled = scaledIntFromDecimalText(text);
  if (scaled == null || scaled <= 0) return null;
  return scaled / SCALE;
}

/** Paint the field without float junk. 0.02002 -> "0.02", 0.062 -> "0.062". */
export function formatRecipeQuantity(value: unknown): string {
  if (typeof value === "string") {
    const persisted = persistRecipeQuantity(value);
    return persisted == null
      ? ""
      : formatScaledInt(Math.round(persisted * SCALE));
  }
  const next = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(next) || next <= 0) return "";
  const scaled = Math.round(next * SCALE);
  if (scaled <= 0) return "";
  return formatScaledInt(scaled);
}

export function recipeQuantityCommitError(
  raw: unknown,
  message = RECIPE_QUANTITY_COMMIT_ERROR,
): string | null {
  return persistRecipeQuantity(raw) == null ? message : null;
}

export function commitRecipeQuantity(
  raw: unknown,
  message = RECIPE_QUANTITY_COMMIT_ERROR,
): RecipeQuantityCommit {
  const quantity = persistRecipeQuantity(raw);
  if (quantity == null) return { ok: false, error: message };
  return { ok: true, quantity };
}

export type RecipeQuantityDraftMap = Record<string, string>;

/**
 * Saved 0.082 must not replace an in-progress "0.062". Init from saved once;
 * only overwrite the draft after a successful Save.
 */
export function recipeQuantityDraftText(
  drafts: Readonly<RecipeQuantityDraftMap>,
  lineId: string,
  savedQuantity: unknown,
): string {
  if (Object.hasOwn(drafts, lineId)) return drafts[lineId] ?? "";
  return formatRecipeQuantity(savedQuantity);
}

export function recipeQuantityDraftAfterType(
  drafts: Readonly<RecipeQuantityDraftMap>,
  lineId: string,
  text: string,
): RecipeQuantityDraftMap {
  return { ...drafts, [lineId]: text };
}

export function recipeQuantityDraftAfterSave(
  drafts: Readonly<RecipeQuantityDraftMap>,
  lineId: string,
  committed: number,
): RecipeQuantityDraftMap {
  return { ...drafts, [lineId]: formatRecipeQuantity(committed) };
}

/**
 * Once the reactive line quantity catches up with a saved draft, drop the
 * draft so the field resumes syncing with later server-side updates instead
 * of pinning stale text forever.
 */
export function pruneSyncedRecipeQuantityDrafts(
  drafts: Readonly<RecipeQuantityDraftMap>,
  rows: ReadonlyArray<{ _id: string; quantity: unknown }>,
): RecipeQuantityDraftMap {
  let changed = false;
  const next: RecipeQuantityDraftMap = { ...drafts };
  for (const row of rows) {
    const id = String(row._id);
    if (
      Object.hasOwn(next, id) &&
      next[id] === formatRecipeQuantity(row.quantity)
    ) {
      delete next[id];
      changed = true;
    }
  }
  return changed ? next : (drafts as RecipeQuantityDraftMap);
}
