/**
 * Converts prep-sheet batch totals into stored per-guest template quantities.
 * Sheets print "97.50 lb for 260 servings"; storage stays per-guest for event
 * fan-out (defaultQuantity × quantityServings).
 */

export type PrepQuantityEntryMode = "per_guest" | "batch_total";

export const PREP_QUANTITY_SCALE = 4;

export type PrepQuantityCommit =
  { ok: true; perGuest: number } | { ok: false; error: string };

const SCALE = 10 ** PREP_QUANTITY_SCALE;
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
  if (frac >= SCALE) {
    return (whole + 1) * SCALE;
  }
  return whole * SCALE + frac;
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
}
