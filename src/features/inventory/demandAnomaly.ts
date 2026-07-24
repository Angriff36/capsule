import type {
  useListEvent,
  useListIngredientDemand,
} from "../../lib/manifest-convex-react";

// ponytail: anomaly detection is a read-side derivation. IngredientDemand has no
// hasMany edge to its own history, so Manifest computeds/aggregates can't express
// "average for this dish at this headcount tier" (demand.manifest defers exactly
// this to app code). A flat mean over committed history is enough to flag review;
// swap in a weighted/robust stat if flat means prove too noisy.

export const DEFAULT_ANOMALY_THRESHOLD = 0.4;
// Below this many historical samples a mean is too noisy to flag against.
const MIN_SAMPLE = 2;

export type DemandAnomaly = {
  expectedQuantity: number;
  deviation: number; // fractional, e.g. 0.55 = 55% off the historical mean
  direction: "over" | "under";
  sampleSize: number;
  tier: string;
};

// Coarse headcount bands so a 48-guest event compares against similar-scale
// history instead of a 500-guest gala.
export function headcountTier(headcount: number): string {
  if (headcount < 25) return "0-24";
  if (headcount < 50) return "25-49";
  if (headcount < 100) return "50-99";
  if (headcount < 250) return "100-249";
  return "250+";
}

const COMMITTED = new Set(["confirmed", "fulfilled"]);
const CANDIDATE = new Set(["pending", "calculated"]);

// Flags freshly calculated demand lines whose quantity deviates from the mean of
// committed history for the same dish + unit + headcount tier by more than
// `threshold`. Returns only the flagged lines, keyed by demand _id.
export function computeDemandAnomalies(
  demands: ReturnType<typeof useListIngredientDemand>,
  events: ReturnType<typeof useListEvent>,
  threshold: number = DEFAULT_ANOMALY_THRESHOLD,
): Map<string, DemandAnomaly> {
  const flagged = new Map<string, DemandAnomaly>();
  if (!demands || !events) return flagged;

  const tierOf = new Map<string, string>();
  for (const event of events) {
    if (event.deletedAt != null) continue;
    tierOf.set(event._id, headcountTier(Number(event.expectedHeadcount ?? 0)));
  }

  // key: `${dishId}::${unit}::${tier}`
  const history = new Map<string, { sum: number; count: number }>();
  for (const demand of demands) {
    if (demand.deletedAt != null) continue;
    if (demand.dishId == null) continue;
    if (!COMMITTED.has(String(demand.status))) continue;
    if (demand.requiredQuantity <= 0) continue;
    const tier = tierOf.get(demand.eventId);
    if (tier == null) continue;
    const key = `${demand.dishId}::${demand.unit}::${tier}`;
    const bucket = history.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += Number(demand.requiredQuantity);
    bucket.count += 1;
    history.set(key, bucket);
  }

  for (const demand of demands) {
    if (demand.deletedAt != null) continue;
    if (demand.dishId == null) continue;
    if (!CANDIDATE.has(String(demand.status))) continue;
    const tier = tierOf.get(demand.eventId);
    if (tier == null) continue;
    const bucket = history.get(`${demand.dishId}::${demand.unit}::${tier}`);
    if (!bucket || bucket.count < MIN_SAMPLE) continue;
    const expected = bucket.sum / bucket.count;
    if (expected <= 0) continue;
    const deviation =
      Math.abs(Number(demand.requiredQuantity) - expected) / expected;
    if (deviation <= threshold) continue;
    flagged.set(demand._id, {
      expectedQuantity: expected,
      deviation,
      direction: Number(demand.requiredQuantity) >= expected ? "over" : "under",
      sampleSize: bucket.count,
      tier,
    });
  }

  return flagged;
}
