/**
 * One answer to "why is this here, and can I trust it?" for every record
 * Capsule makes by itself (spec BE-18.7, AC-642): proposal lines, timeline
 * milestones, planning answers, prep tasks, purchasing amounts, crew needs
 * and pack lines. Pure: the seam convex/automaticExplanations.ts reads the
 * rows and the last reconcile time and hands them here. The kitchen,
 * purchasing, crew and packing kinds are in ./automaticExplanationOps.ts.
 */
import { EVENT_TIMING_MILESTONES } from "./eventTimingMilestones";
import {
  sameValues,
  type GenerationRecord,
  type LinePlan,
  type LineValues,
} from "./proposalGeneration";

export type AutomaticKind =
  | "proposal_line"
  | "timeline_milestone"
  | "planning_answer"
  | "task"
  | "purchasing"
  | "staffing_need"
  | "pack_line";

/** generated = made by Capsule and untouched; manual = a person added it;
 * overridden = Capsule made it and a person changed or turned it down. */
export type AutomaticOrigin = "generated" | "manual" | "overridden";

export type AutomaticSource = { table: string; id: string };

export type AutomaticExplanation = {
  kind: AutomaticKind;
  id: string;
  version: number;
  label: string;
  /** The amount or time as it stands, in plain words. */
  value: string;
  status: string | null;
  origin: AutomaticOrigin;
  sources: AutomaticSource[];
  /** The rule, template or build version it came from; null for a hand-made one. */
  ruleVersion: string | null;
  why: string;
  stale: boolean;
  staleReason: string | null;
  /** When Capsule last brought this part of the event up to date. */
  lastReconciledAt: number | null;
  blocking: { reason: string; action: string } | null;
};

export const show = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export const src = (table: string, id: unknown): AutomaticSource[] =>
  id == null || String(id).length === 0 ? [] : [{ table, id: String(id) }];

export const clock = (at: number | null | undefined) =>
  at == null
    ? "no time set"
    : new Date(at).toISOString().slice(11, 16) + " UTC";

// ---------------------------------------------------------------- proposal

export type ProposalLineRow = {
  _id: string;
  version: number;
  proposalId: string;
  description: string;
  quantity: number;
  pricingBasis: string;
  unitPrice: number;
  menuDishId?: string | null;
};

export function explainProposalLine(input: {
  line: ProposalLineRow;
  record: GenerationRecord | null;
  plan: LinePlan | null;
  /** Records each generated line was built from, by source key. */
  sourcesByKey: Map<string, AutomaticSource[]>;
  lastReconciledAt: number | null;
}): AutomaticExplanation {
  const { line, record, plan } = input;
  const built = record?.lines.find((entry) => entry.lineId === line._id);
  const values: LineValues = {
    description: line.description,
    pricingBasis: line.pricingBasis,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    menuDishId: line.menuDishId ?? null,
  };
  const origin: AutomaticOrigin = !built
    ? "manual"
    : sameValues(values, built.values)
      ? "generated"
      : "overridden";
  const kept = plan?.kept.find((entry) => entry.lineId === line._id);
  const revised = plan?.revise.some((entry) => entry.lineId === line._id);
  const removed = plan?.remove.includes(line._id);
  const staleReason = kept?.sourceGone
    ? "The dish is no longer on the event, but a person changed this line, so it stays until someone removes it."
    : kept?.sourceChanged
      ? "The event dish changed after a person changed this line. Check it."
      : removed
        ? "The dish left the event menu. The next build takes this line off."
        : revised
          ? "The event menu changed. The next build updates this line."
          : null;
  return {
    kind: "proposal_line",
    id: line._id,
    version: line.version,
    label: line.description,
    value: `${show(line.quantity)} ${line.pricingBasis.replace(/_/g, " ")}`,
    status: null,
    origin,
    sources: [
      ...src("proposals", line.proposalId),
      ...(built ? (input.sourcesByKey.get(built.sourceKey) ?? []) : []),
    ],
    ruleVersion: built ? `proposal build v${record!.v}` : null,
    why: !built
      ? "A person added this line by hand."
      : origin === "overridden"
        ? "Built from the event menu, then changed by a person. A rebuild keeps the person's version."
        : `Built from the event menu: ${line.description}, ${show(line.quantity)} ${line.pricingBasis.replace(/_/g, " ")}.`,
    stale: staleReason != null,
    staleReason,
    lastReconciledAt: input.lastReconciledAt,
    blocking: null,
  };
}

// ---------------------------------------------------------------- timeline

export type TimelineRow = {
  _id: string;
  version: number;
  name: string;
  startsAt?: number | null;
  completedAt?: number | null;
  timingMilestone?: string | null;
  timingManuallyAdjustedAt?: number | null;
};

export function explainTimelineMilestone(input: {
  row: TimelineRow;
  eventId: string;
  /** The event's own time for this milestone now (eventTimingWindows). */
  eventStartsAt: number | null;
  lastReconciledAt: number | null;
  unresolved: string | null;
}): AutomaticExplanation {
  const { row } = input;
  const milestone = EVENT_TIMING_MILESTONES.find(
    (entry) => entry.key === row.timingMilestone,
  );
  const origin: AutomaticOrigin = !milestone
    ? "manual"
    : row.timingManuallyAdjustedAt != null
      ? "overridden"
      : "generated";
  const differs =
    milestone != null &&
    (row.startsAt ?? null) !== (input.eventStartsAt ?? null);
  const staleReason =
    differs && origin === "generated"
      ? `The event now says ${clock(input.eventStartsAt)} for this step.`
      : differs && origin === "overridden"
        ? `A person moved this step. The event's own time is ${clock(input.eventStartsAt)}.`
        : null;
  return {
    kind: "timeline_milestone",
    id: row._id,
    version: row.version,
    label: row.name,
    value: clock(row.startsAt),
    status: row.completedAt != null ? "done" : "open",
    origin,
    sources: src("events", input.eventId),
    ruleVersion: milestone ? `timing step ${milestone.key}` : null,
    why: !milestone
      ? "A person added this step to the timeline."
      : `Comes from the event's ${milestone.name.toLowerCase()} time.${
          origin === "overridden" ? " A person moved it since." : ""
        }`,
    stale: staleReason != null && origin === "generated",
    staleReason,
    lastReconciledAt: input.lastReconciledAt,
    blocking: input.unresolved
      ? {
          reason: input.unresolved,
          action: "EventTimelineActivity.useCalculatedTiming",
        }
      : null,
  };
}

// ---------------------------------------------------------------- planning

export type PlanningReceiptRow = {
  _id: string;
  version: number;
  suggestionKey: string;
  quantity: number;
  declined: boolean;
  basis?: string | null;
  recordedAt?: number | null;
};

export type PlanningRuleRow = {
  _id: string;
  version: number;
  name: string;
  updatedAt?: number | null;
};

/** The rule id inside a rule suggestion key (`rule:<id>:<kind>:<target>`). */
export function planningRuleId(suggestionKey: string): string | null {
  const match = /^rule:([^:]+):/.exec(suggestionKey);
  return match ? match[1] : null;
}

export function explainPlanningAnswer(input: {
  receipt: PlanningReceiptRow;
  rule: PlanningRuleRow | null;
  eventId: string;
  guestsNow: number | null;
}): AutomaticExplanation {
  const { receipt, rule } = input;
  let basisGuests: number | null = null;
  try {
    const parsed = JSON.parse(receipt.basis ?? "null");
    if (Array.isArray(parsed) && typeof parsed[1] === "number")
      basisGuests = parsed[1];
  } catch {
    basisGuests = null;
  }
  const ruleChanged =
    rule?.updatedAt != null &&
    receipt.recordedAt != null &&
    rule.updatedAt > receipt.recordedAt;
  const guestsChanged =
    basisGuests != null &&
    input.guestsNow != null &&
    basisGuests !== input.guestsNow;
  const staleReason = guestsChanged
    ? `Answered for ${basisGuests} guests; the event now has ${input.guestsNow}.`
    : ruleChanged
      ? `The rule "${rule!.name}" changed after this answer.`
      : null;
  const what = rule
    ? `the rule "${rule.name}"`
    : "a part that goes with held equipment";
  return {
    kind: "planning_answer",
    id: receipt._id,
    version: receipt.version,
    label: rule?.name ?? receipt.suggestionKey,
    value: receipt.declined ? "turned down" : `added ${show(receipt.quantity)}`,
    status: receipt.declined ? "declined" : "accepted",
    origin: receipt.declined ? "overridden" : "generated",
    sources: [
      ...src("events", input.eventId),
      ...src("planningRules", rule?._id),
    ],
    ruleVersion: rule ? `rule version ${rule.version}` : null,
    why: receipt.declined
      ? `Suggested by ${what}; a person turned it down. It comes back if the amounts change.`
      : `Suggested by ${what} and accepted: ${show(receipt.quantity)} added.`,
    stale: staleReason != null,
    staleReason,
    lastReconciledAt: receipt.recordedAt ?? null,
    blocking: null,
  };
}
