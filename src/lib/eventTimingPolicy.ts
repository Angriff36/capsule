/**
 * Company event timing rules (spec §8.4, PL-TIMING). Pure: no Convex.
 *
 * Setup before serve comes from the service style (full service 180 minutes,
 * limited service 90, both company settings). Load time comes from the first
 * company load rule that matches the event's service style, guest count, pack
 * list size and truck count; when none matches, the company's standard load
 * time is used and marked for a look instead of pretending it was worked out.
 */

export type LoadRule = {
  id: string;
  label: string;
  /** Service style name, matched without case; unset matches any style. */
  serviceStyle?: string | null;
  minGuests?: number | null;
  maxGuests?: number | null;
  minPackItems?: number | null;
  maxPackItems?: number | null;
  minVehicles?: number | null;
  maxVehicles?: number | null;
  minutes: number;
};

export type TimingPolicy = {
  fullServiceSetupMinutes: number;
  limitedServiceSetupMinutes: number;
  briefingMinutes: number;
  loadBaselineMinutes: number;
  loadRules: LoadRule[];
};

export const DEFAULT_TIMING_POLICY: TimingPolicy = {
  fullServiceSetupMinutes: 180,
  limitedServiceSetupMinutes: 90,
  briefingMinutes: 0,
  loadBaselineMinutes: 60,
  loadRules: [],
};

const whole = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const optionalWhole = (value: unknown): number | null =>
  whole(value) ? value : null;

/** Reads the stored load rules; a row that is not a usable rule is dropped. */
export function parseLoadRules(json: string | null | undefined): LoadRule[] {
  if (!json || !json.trim()) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const rules: LoadRule[] = [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const raw = row as Record<string, unknown>;
    if (!whole(raw.minutes)) return;
    const style =
      typeof raw.serviceStyle === "string" && raw.serviceStyle.trim()
        ? raw.serviceStyle.trim()
        : null;
    rules.push({
      id:
        typeof raw.id === "string" && raw.id.trim()
          ? raw.id.trim()
          : `rule-${index + 1}`,
      label:
        typeof raw.label === "string" && raw.label.trim()
          ? raw.label.trim()
          : `Load rule ${index + 1}`,
      serviceStyle: style,
      minGuests: optionalWhole(raw.minGuests),
      maxGuests: optionalWhole(raw.maxGuests),
      minPackItems: optionalWhole(raw.minPackItems),
      maxPackItems: optionalWhole(raw.maxPackItems),
      minVehicles: optionalWhole(raw.minVehicles),
      maxVehicles: optionalWhole(raw.maxVehicles),
      minutes: raw.minutes,
    });
  });
  return rules;
}

export function readTimingPolicy(
  organization: {
    timingFullServiceSetupMinutes?: number | null;
    timingLimitedServiceSetupMinutes?: number | null;
    timingBriefingMinutes?: number | null;
    timingLoadBaselineMinutes?: number | null;
    timingLoadRulesJson?: string | null;
  } | null,
): TimingPolicy {
  const pick = (value: unknown, fallback: number) =>
    whole(value) ? value : fallback;
  return {
    fullServiceSetupMinutes: pick(
      organization?.timingFullServiceSetupMinutes,
      DEFAULT_TIMING_POLICY.fullServiceSetupMinutes,
    ),
    limitedServiceSetupMinutes: pick(
      organization?.timingLimitedServiceSetupMinutes,
      DEFAULT_TIMING_POLICY.limitedServiceSetupMinutes,
    ),
    briefingMinutes: pick(
      organization?.timingBriefingMinutes,
      DEFAULT_TIMING_POLICY.briefingMinutes,
    ),
    loadBaselineMinutes: pick(
      organization?.timingLoadBaselineMinutes,
      DEFAULT_TIMING_POLICY.loadBaselineMinutes,
    ),
    loadRules: parseLoadRules(organization?.timingLoadRulesJson),
  };
}

const styleKey = (name: string | null | undefined) =>
  (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");

/** Styles that are full or limited service, as the service style list groups them. */
const FULL_SERVICE_STYLES = [
  "plated",
  "buffet cook onsite",
  "action station",
  "family style",
  "private chef",
  "bar",
];
const LIMITED_SERVICE_STYLES = ["buffet bring hot", "ready to heat"];

/** Setup before serve for the booked service style; unknown for any other
 * style (drop-off and the like have no company setup rule). */
export function policySetupMinutes(
  serviceStyleName: string | null | undefined,
  policy: TimingPolicy,
): number | null {
  const key = styleKey(serviceStyleName)
    .replace(/[–—]/g, " ")
    .replace(/\s+/g, " ");
  if (key === "full service" || FULL_SERVICE_STYLES.includes(key))
    return policy.fullServiceSetupMinutes;
  if (key === "limited service" || LIMITED_SERVICE_STYLES.includes(key))
    return policy.limitedServiceSetupMinutes;
  return null;
}

export type LoadFacts = {
  serviceStyleName: string | null;
  guestCount: number | null;
  packItemCount: number;
  vehicleCount: number;
};

export type LoadChoice = {
  minutes: number;
  /** The rule that matched; null means the standard load time was used. */
  ruleId: string | null;
  ruleLabel: string | null;
  needsReview: boolean;
};

const inRange = (
  value: number | null,
  min: number | null | undefined,
  max: number | null | undefined,
) => {
  if (min == null && max == null) return true;
  if (value == null) return false;
  return (min == null || value >= min) && (max == null || value <= max);
};

/** The first matching company load rule, else the standard load time
 * marked for review. */
export function chooseLoadMinutes(
  facts: LoadFacts,
  policy: TimingPolicy,
): LoadChoice {
  const style = styleKey(facts.serviceStyleName);
  const rule = policy.loadRules.find(
    (row) =>
      (row.serviceStyle == null || styleKey(row.serviceStyle) === style) &&
      inRange(facts.guestCount, row.minGuests, row.maxGuests) &&
      inRange(facts.packItemCount, row.minPackItems, row.maxPackItems) &&
      inRange(facts.vehicleCount, row.minVehicles, row.maxVehicles),
  );
  if (rule) {
    return {
      minutes: rule.minutes,
      ruleId: rule.id,
      ruleLabel: rule.label,
      needsReview: false,
    };
  }
  return {
    minutes: policy.loadBaselineMinutes,
    ruleId: null,
    ruleLabel: null,
    needsReview: true,
  };
}
