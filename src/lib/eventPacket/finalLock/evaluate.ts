import { canonicalJson, type Section } from "../model";
import type { Draft } from "./answer";
import { dessertBarBuffetAnswers } from "./dessertBarBuffet";
import { identityAnswers, menuAnswers } from "./identityMenu";
import { fieldAnswers, operationsAnswers, readinessAnswer } from "./operations";
import { POLICY_VERSION, QUESTIONS, type Question } from "./policy";
import { roomServiceAnswers } from "./roomService";
import { setupAnswers, timelineAnswers } from "./timelineSetup";
import type {
  AnswerOverride,
  AnswerSource,
  FinalLockAnswer,
  FinalLockInput,
  FinalLockOutcome,
  FinalLockValue,
} from "./types";

/** A manager's recorded decision; it holds only for the facts it saw. */
export interface StoredOverride extends AnswerOverride {
  questionKey: string;
  /** Fingerprint of the derived answer the manager overrode. */
  basedOn: string;
}

/** What a packet revision printed: one fingerprint per question. */
export interface PrintedAnswers {
  revisionId: string;
  policyVersion: string;
  answers: Record<string, string>;
  lines?: FinalLockPrintLine[];
}

export interface FinalLockOptions {
  policy?: readonly Question[];
  policyVersion?: string;
  overrides?: StoredOverride[];
  printed?: PrintedAnswers | null;
}

export interface FinalLockReport {
  policyVersion: string;
  outcome: FinalLockOutcome;
  answers: FinalLockAnswer[];
  staleQuestions: string[];
  staleSections: Section[];
}

/** Short stable hash (cyrb53) so fingerprints fit on a revision row. */
function hash(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * What one source contributes to an answer's basis. A named Event field is
 * pinned by its value, so an edit to another Event field does not undo a
 * manager's decision; every other record is pinned by its version.
 */
function sourceBasis(input: FinalLockInput, s: AnswerSource) {
  if (s.table === "events" && s.field === "primaryContactName")
    return {
      table: s.table,
      id: s.id,
      field: s.field,
      value: [
        input.event.contactName,
        input.event.contactPhone,
        input.event.contactEmail,
      ],
    };
  if (s.table === "events" && s.field) {
    const row = input.event as unknown as Record<string, unknown>;
    if (s.field in input.event.text)
      return {
        table: s.table,
        id: s.id,
        field: s.field,
        value: input.event.text[s.field] ?? null,
      };
    if (s.field in row)
      return {
        table: s.table,
        id: s.id,
        field: s.field,
        value: row[s.field] ?? null,
      };
  }
  return {
    table: s.table,
    id: s.id,
    field: s.field ?? null,
    version: s.version,
  };
}

/** The full material basis: rule, result, value and every source read. */
const derivedFingerprint = (
  input: FinalLockInput,
  question: Question,
  draft: Draft,
) =>
  hash(
    canonicalJson({
      key: question.key,
      ruleVersion: question.ruleVersion,
      rule: draft.rule,
      result: draft.result,
      value: draft.value,
      missing: draft.missing,
      confirmed: draft.fieldWork?.confirmedAt ?? null,
      sources: [
        ...new Set(
          draft.sources.map((s) => canonicalJson(sourceBasis(input, s))),
        ),
      ].sort(),
    }),
  );

/**
 * The Final Lock answer engine: deterministic policy over native records.
 * No model output reaches an answer; a person's decision enters only as an
 * override with reason, actor and time, tied to the facts it overrode.
 */
export function evaluateFinalLock(
  input: FinalLockInput,
  options: FinalLockOptions = {},
): FinalLockReport {
  const policy = options.policy ?? QUESTIONS;
  const policyVersion = options.policyVersion ?? POLICY_VERSION;
  const drafts: Record<string, Draft> = {
    ...identityAnswers(input),
    ...menuAnswers(input),
    ...timelineAnswers(input),
    ...setupAnswers(input),
    ...roomServiceAnswers(input),
    ...dessertBarBuffetAnswers(input),
    ...operationsAnswers(input),
    ...fieldAnswers(input, policy),
  };

  const build = (question: Question, draft: Draft): FinalLockAnswer => {
    const derived = derivedFingerprint(input, question, draft);
    const override = question.form
      ? undefined
      : options.overrides
          ?.filter(
            (o) => o.questionKey === question.key && o.basedOn === derived,
          )
          .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    const value: FinalLockValue = override ? override.value : draft.value;
    return {
      questionKey: question.key,
      group: question.group,
      section: question.section,
      label: question.label,
      policyVersion,
      ruleVersion: question.ruleVersion,
      result: override ? "answered" : draft.result,
      value,
      explanation: override
        ? `Manager decision: ${override.reason}`
        : draft.explanation,
      sources: draft.sources,
      rule: override ? `${draft.rule}+authorized-override` : draft.rule,
      missing: override ? [] : draft.missing,
      action: override ? null : draft.action,
      resolver: question.resolver,
      override: override
        ? {
            value: override.value,
            reason: override.reason,
            actor: override.actor,
            at: override.at,
          }
        : null,
      fieldWork: draft.fieldWork ?? null,
      displayedInRevision: null,
      fingerprint: override
        ? hash(canonicalJson({ derived, override: override.value }))
        : derived,
      basis: derived,
    };
  };

  const office = policy.filter(
    (q) => !q.form && q.key !== "readiness.dispatch",
  );
  const answers = office.map((q) => {
    const draft = drafts[q.key];
    if (!draft) throw new Error(`No rule answers ${q.key}`);
    return build(q, draft);
  });
  const officeUnresolved = answers.some((a) => a.result === "unresolved");

  // Derived fingerprints the revision printed; the version is in each hash.
  // Readiness follows the packet itself and field work happens after the
  // print, so only office answers can make a printed packet stale.
  const printed = options.printed ?? null;
  const staleQuestions = printed
    ? [
        ...answers
          .filter((a) => printed.answers[a.questionKey] !== a.fingerprint)
          .map((a) => a.questionKey),
        ...Object.keys(printed.answers).filter(
          (key) =>
            !policy.some((q) => q.key === key) &&
            !key.startsWith("field.") &&
            key !== "readiness.dispatch",
        ),
      ]
    : [];
  // With the print known, the printed packet is out of date when its answers
  // or policy changed, or it printed no answers at all (an older print).
  const answersStale =
    options.printed !== undefined &&
    input.packet.latestRevisionId != null &&
    (printed == null ||
      printed.policyVersion !== policyVersion ||
      staleQuestions.length > 0);

  const readiness = policy.find((q) => q.key === "readiness.dispatch");
  let readinessOfficeOpen = false;
  let readinessOpen = false;
  if (readiness) {
    const ready = readinessAnswer(
      input,
      answers.filter((a) => a.result === "unresolved").map((a) => a.label),
      answersStale,
    );
    const answer = build(readiness, ready.draft);
    readinessOpen = answer.result === "unresolved";
    readinessOfficeOpen = readinessOpen && ready.officeOpen;
    answers.push(answer);
  }
  for (const q of policy.filter((item) => item.form))
    answers.push(build(q, drafts[q.key]!));
  for (const answer of answers)
    if (printed?.answers[answer.questionKey] === answer.fingerprint)
      answer.displayedInRevision = printed.revisionId;
  const staleSections = [
    ...new Set(
      staleQuestions.flatMap((key) =>
        answers.filter((a) => a.questionKey === key).map((a) => a.section),
      ),
    ),
  ];

  // Needs review: an office question or office-side readiness is open.
  // Field work pending: only packing, signatures and day-of forms remain.
  const outcome: FinalLockOutcome =
    officeUnresolved || readinessOfficeOpen
      ? "needs_review"
      : answersStale ||
          staleQuestions.length ||
          input.packet.latestRevisionStale
        ? "stale"
        : readinessOpen ||
            answers.some((a) => a.fieldWork && !a.fieldWork.confirmedAt)
          ? "field_work_pending"
          : "clear";
  return { policyVersion, outcome, answers, staleQuestions, staleSections };
}

/** One printed Final Lock line: what the packet page says for a question. */
export interface FinalLockPrintLine {
  questionKey: string;
  section: Section;
  label: string;
  result: FinalLockAnswer["result"];
  text: string;
}

/**
 * The Final Lock answers exactly as a packet prints them. The browser renders
 * these lines into the PDF and uploads them inside the snapshot; the revision
 * stores the same payload, so it names only what the PDF showed.
 */
export interface FinalLockPrint {
  policyVersion: string;
  answers: Record<string, string>;
  lines: FinalLockPrintLine[];
}

const valueText = (value: FinalLockValue): string => {
  switch (value.type) {
    case "text":
      return value.text;
    case "yes_no":
      return value.yes ? "Yes" : "No";
    case "choice":
      return value.choice;
    case "count":
      return String(value.count);
    case "list":
      return value.items.join(", ");
    default:
      return "";
  }
};

const lineText = (a: FinalLockAnswer) =>
  a.override
    ? `${valueText(a.override.value)} (manager decision: ${a.override.reason})`
    : a.result === "unresolved"
      ? `NEEDS REVIEW: ${a.explanation} ${a.action ?? ""}`.trim()
      : a.result === "not_applicable"
        ? `Not needed: ${a.explanation}`
        : a.result === "field_confirmation"
          ? `Done on the day by the person who does it${a.fieldWork?.confirmedAt ? ` - confirmed ${a.fieldWork.confirmedAt}` : ""}.`
          : a.explanation;

/**
 * The part of a print that can go stale: office answers only. Readiness
 * follows the packet itself and field work happens after the print.
 */
const isOfficeKey = (key: string) =>
  !key.startsWith("field.") && key !== "readiness.dispatch";
export const officePrint = (print: FinalLockPrint): FinalLockPrint => ({
  policyVersion: print.policyVersion,
  answers: Object.fromEntries(
    Object.entries(print.answers).filter(([key]) => isOfficeKey(key)),
  ),
  lines: print.lines.filter((l) => isOfficeKey(l.questionKey)),
});

export const finalLockPrint = (report: FinalLockReport): FinalLockPrint => ({
  policyVersion: report.policyVersion,
  answers: Object.fromEntries(
    report.answers.map((a) => [a.questionKey, a.fingerprint]),
  ),
  lines: report.answers.map((a) => ({
    questionKey: a.questionKey,
    section: a.section,
    label: a.label,
    result: a.result,
    text: lineText(a),
  })),
});
