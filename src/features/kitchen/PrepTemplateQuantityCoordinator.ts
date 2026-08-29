/**
 * Converts prep-sheet batch totals into stored per-guest template quantities.
 * Sheets print "97.50 lb for 260 servings"; storage stays per-guest for event
 * fan-out (defaultQuantity × quantityServings).
 *
 * The add-form toggle can show Total-for-batch, but DishTask.defaultQuantity
 * is always the derived per-guest rate. Persist that rate — never a default 1.
 */

export type PrepQuantityEntryMode = "per_guest" | "batch_total";

export const PREP_QUANTITY_SCALE = 4;

export type PrepQuantityCommit =
  { ok: true; perGuest: number } | { ok: false; error: string };

export type PrepTemplateQuantityPersist =
  { ok: true; defaultQuantity?: number } | { ok: false; error: string };

const SCALE = 10 ** PREP_QUANTITY_SCALE;
const MAX_SCALED = 10 ** 12 - 1;
const TYPED_DECIMAL = /^(?:\d+|\d+\.\d*|\.\d+)$/;

function scaledIntFromDecimalText(text: string): number | null {
  if (!TYPED_DECIMAL.test(text)) return null;
  const [wholeRaw, fracRaw = ""] = text.split(".");
  const whole = wholeRaw === "" ? 0 : Number(wholeRaw);
  if (!Number.isInteger(whole) || whole < 0) return null;
  if (String(whole).length > 12 - PREP_QUANTITY_SCALE) return null;
  const keep = fracRaw.slice(0, PREP_QUANTITY_SCALE);
  const rest = fracRaw.slice(PREP_QUANTITY_SCALE);
  let frac = Number(keep.padEnd(PREP_QUANTITY_SCALE, "0"));
  if (rest !== "" && Number(rest[0] ?? "0") >= 5) {
    frac += 1;
  }
  const scaled = frac >= SCALE ? (whole + 1) * SCALE : whole * SCALE + frac;
  // decimal(12, 4): 8 integer digits at most, also after a rounding carry.
  if (scaled > MAX_SCALED) return null;
  return scaled;
}

function decimalFromRaw(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const scaled = scaledIntFromDecimalText(text);
  if (scaled == null || scaled <= 0) return null;
  return scaled / SCALE;
}

function positiveIntFromRaw(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function fieldText(raw: unknown): string {
  return String(raw ?? "").trim();
}

/** Whether the add form is trying to persist a quantity (vs omit / one-each). */
export function prepTemplateWantsQuantity(
  mode: PrepQuantityEntryMode,
  perGuestRaw: unknown,
  batchTotalRaw: unknown,
  batchServingsRaw: unknown,
): boolean {
  if (mode === "per_guest") {
    const text = fieldText(perGuestRaw);
    return text !== "" && Number(text) !== 0;
  }
  return fieldText(batchTotalRaw) !== "" || fieldText(batchServingsRaw) !== "";
}

/**
 * Exact stored per-guest rate for the dish template row.
 * Cook-sheet labels ceil whole units (0.375 each → 1); the catalog row must
 * not, or a 97.50/260 save looks like a default 1 each/guest.
 */
export function prepTemplateQuantityMeta(
  quantity: number | undefined | null,
  unit: string | undefined | null,
): string | null {
  if (quantity == null || quantity <= 0) return null;
  const unitLabel = String(unit ?? "");
  return `${String(Number(quantity.toFixed(PREP_QUANTITY_SCALE)))} ${unitLabel}/guest`;
}

export class PrepTemplateQuantityCoordinator {
  /** Per-guest rate from a sheet total ÷ serving count, at decimal(12, 4). */
  static perGuestFromBatch(total: number, servings: number): number | null {
    if (total <= 0 || servings <= 0) return null;
    const totalScaled = Math.round(total * SCALE);
    const perGuestScaled = Math.round(totalScaled / servings);
    if (perGuestScaled <= 0) return null;
    return perGuestScaled / SCALE;
  }

  static commit(
    mode: PrepQuantityEntryMode,
    perGuestRaw: unknown,
    batchTotalRaw: unknown,
    batchServingsRaw: unknown,
  ): PrepQuantityCommit {
    if (mode === "per_guest") {
      const perGuest = decimalFromRaw(perGuestRaw);
      if (perGuest == null) {
        return {
          ok: false,
          error: "Per-guest quantity must be greater than zero.",
        };
      }
      return { ok: true, perGuest };
    }

    const total = decimalFromRaw(batchTotalRaw);
    const servings = positiveIntFromRaw(batchServingsRaw);
    if (total == null) {
      return {
        ok: false,
        error: "Batch total must be greater than zero.",
      };
    }
    if (servings == null) {
      return {
        ok: false,
        error: "Serving count must be a whole number greater than zero.",
      };
    }
    const perGuest = PrepTemplateQuantityCoordinator.perGuestFromBatch(
      total,
      servings,
    );
    if (perGuest == null) {
      return {
        ok: false,
        error:
          "Could not derive a per-guest rate from that total and serving count.",
      };
    }
    return { ok: true, perGuest };
  }

  /**
   * Mutation payload for Add prep template. Total-for-batch writes
   * batch_total ÷ servings, never a default 1.
   */
  static persist(
    mode: PrepQuantityEntryMode,
    perGuestRaw: unknown,
    batchTotalRaw: unknown,
    batchServingsRaw: unknown,
  ): PrepTemplateQuantityPersist {
    const commit = PrepTemplateQuantityCoordinator.commit(
      mode,
      perGuestRaw,
      batchTotalRaw,
      batchServingsRaw,
    );
    const wants = prepTemplateWantsQuantity(
      mode,
      perGuestRaw,
      batchTotalRaw,
      batchServingsRaw,
    );
    if (wants && !commit.ok) return commit;
    return {
      ok: true,
      defaultQuantity: commit.ok ? commit.perGuest : undefined,
    };
  }
}
