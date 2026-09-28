import type {
  AnswerSource,
  FieldWork,
  FinalLockInput,
  FinalLockResult,
  FinalLockValue,
  NativeRow,
} from "./types";

/** The service style the event was booked with, before the live catalog name. */
export const eventStyleName = (input: FinalLockInput): string | null =>
  input.event.serviceStyleName?.trim() ||
  input.serviceStyle?.name.trim() ||
  null;

/** What one rule decides; evaluate() adds the question and policy facts. */
export interface Draft {
  result: FinalLockResult;
  value: FinalLockValue;
  explanation: string;
  rule: string;
  sources: AnswerSource[];
  missing: string[];
  action: string | null;
  fieldWork?: FieldWork;
}

export const NONE: FinalLockValue = { type: "none" };

export const source = (
  table: string,
  row: NativeRow | null | undefined,
  field?: string,
): AnswerSource[] =>
  row
    ? [{ table, id: row.id, version: row.version, ...(field ? { field } : {}) }]
    : [];

/** An event menu line and the dish record it names. */
export const dishSources = (
  d: NativeRow & { dish: NativeRow | null },
  field?: string,
) => [...source("eventDishes", d, field), ...source("dishes", d.dish)];

/** An equipment reservation and the equipment record it reserves. */
export const equipmentSources = (e: NativeRow & { item: NativeRow | null }) => [
  ...source("equipmentReservations", e),
  ...source("equipments", e.item),
];

/** An accepted proposal line, its proposal and the records it names. */
export const proposalSources = (
  proposal: NativeRow | null,
  line: NativeRow & { table: string; related: AnswerSource[] },
): AnswerSource[] => [
  ...source("proposals", proposal),
  { table: line.table, id: line.id, version: line.version },
  ...line.related,
];

export const answered = (
  value: FinalLockValue,
  explanation: string,
  rule: string,
  sources: AnswerSource[],
): Draft => ({
  result: "answered",
  value,
  explanation,
  rule,
  sources,
  missing: [],
  action: null,
});

/** Not applicable needs a rule that proves why; `rule` names it. */
export const notApplicable = (
  explanation: string,
  rule: string,
  sources: AnswerSource[],
): Draft => ({
  result: "not_applicable",
  value: NONE,
  explanation,
  rule,
  sources,
  missing: [],
  action: null,
});

/** Unresolved names every missing or clashing fact and the one fix. */
export const unresolved = (
  missing: string[],
  action: string,
  rule: string,
  sources: AnswerSource[],
): Draft => ({
  result: "unresolved",
  value: NONE,
  explanation: missing.join(" "),
  rule,
  sources,
  missing,
  action,
});

export type Said =
  | { kind: "empty" }
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "party"; party: "Mangia" | "Client" | "Venue" | "Rental company" }
  | { kind: "other"; text: string };

/**
 * Reads one free-text office answer ("Yes", "No", "Client", "Mangia sets
 * them", "N/A"). Anything else stays `other` so a rule can ask a person
 * instead of guessing.
 */
export function said(text: string | null | undefined): Said {
  const value = (text ?? "").trim();
  if (!value) return { kind: "empty" };
  const lower = value.toLowerCase();
  if (
    /^(no|n|none|not needed|nope|false|n\/a|na|not applicable)\b\.?$/.test(
      lower,
    )
  )
    return { kind: "no" };
  if (/\b(client|customer|host|family)\b/.test(lower))
    return { kind: "party", party: "Client" };
  if (/\bvenue\b/.test(lower)) return { kind: "party", party: "Venue" };
  if (/\b(rental company|vendor|third party|good ?shuffle)\b/.test(lower))
    return { kind: "party", party: "Rental company" };
  if (/\b(mangia|we|us|our team|staff)\b/.test(lower))
    return { kind: "party", party: "Mangia" };
  if (/^(yes|y|true|yep)\b/.test(lower)) return { kind: "yes" };
  return { kind: "other", text: value };
}

export const hasText = (text: string | null | undefined) => !!text?.trim();
