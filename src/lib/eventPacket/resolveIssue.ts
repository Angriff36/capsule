import {
  canonicalJson,
  fingerprintBytes,
  type EventPacketSnapshot,
  type Fact,
  type FieldValue,
  type ChecklistVerification,
  type Resolution,
  type EvidenceReference,
} from "./model";
import { reconcile } from "./reconcile";
import { canMarkNotApplicable, requirements } from "./requirements";
export interface ResolveDecision {
  issueId: string;
  choice: FieldValue;
  actor: string;
  at: string;
  reason: string;
  observationId?: string;
  answer?: ChecklistVerification["answer"];
  kind?: Resolution["kind"];
  unit?: string;
  evidence?: EvidenceReference[];
}
export async function resolveIssue(
  snapshot: EventPacketSnapshot,
  decision: ResolveDecision,
  currentEvent?: Fact[],
): Promise<EventPacketSnapshot> {
  if (
    !decision.actor.trim() ||
    !decision.reason.trim() ||
    !/^\d{4}-\d{2}-\d{2}T/.test(decision.at) ||
    Number.isNaN(Date.parse(decision.at))
  )
    throw new Error("Decision requires actor, timestamp and reason");
  const packet = await reconcile(snapshot, currentEvent);
  const issue = packet.issues.find((i) => i.id === decision.issueId);
  if (!issue) throw new Error("Unknown issue");
  let selected: string | undefined;
  let unit = decision.unit;
  let checks = packet.checklistVerifications;
  if (issue.key.startsWith("check.")) {
    const requirement = requirements.find((r) => r.key === issue.key);
    if (
      !requirement ||
      !decision.answer ||
      !["yes", "no", "not_applicable"].includes(decision.answer)
    )
      throw new Error("Explicit verification answer is required");
    if (
      decision.answer === "not_applicable" &&
      !canMarkNotApplicable(requirement, packet)
    )
      throw new Error("This required check cannot be not applicable");
    checks = [
      ...checks.filter((c) => c.checkKey !== issue.key),
      {
        checkKey: issue.key,
        answer: decision.answer,
        actor: decision.actor,
        at: decision.at,
        reason: decision.reason,
        evidence: issue.evidence,
      },
    ];
  } else {
    const matching = packet.observations.filter(
      (o) =>
        o.fieldKey === issue.fieldKey &&
        canonicalJson(o.value) === canonicalJson(decision.choice) &&
        (!decision.observationId || o.id === decision.observationId),
    );
    const native = packet.facts.find(
      (f) =>
        f.fieldKey === issue.fieldKey && f.authority === "native_finalized",
    );
    if (
      native &&
      canonicalJson(native.value) !== canonicalJson(decision.choice)
    )
      throw new Error(
        "Change the native domain through its authorized command before accepting a source value",
      );
    const entry = decision.kind === "fact_entry";
    if (
      entry &&
      (!decision.reason.trim() ||
        decision.choice === "" ||
        decision.choice === undefined)
    )
      throw new Error(
        "Firsthand fact entry requires a value and verification reason",
      );
    if (
      !entry &&
      !matching.length &&
      !(
        native && canonicalJson(native.value) === canonicalJson(decision.choice)
      )
    )
      throw new Error(
        "Choice must be supported by a source observation or current native fact",
      );
    if (
      new Set(matching.map((o) => o.unit ?? "")).size > 1 &&
      !decision.observationId &&
      !native &&
      !entry
    )
      throw new Error("Select a specific observation with its original unit");
    selected =
      entry || (native && !decision.observationId)
        ? undefined
        : matching[0]?.id;
    unit = entry
      ? decision.unit
      : native && !decision.observationId
        ? native.unit
        : matching[0]?.unit;
    if (
      native &&
      (unit ?? "").toLowerCase() !== (native.unit ?? "").toLowerCase()
    )
      throw new Error(
        "Update the native quantity unit through its authorized domain command first",
      );
  }
  const id = await fingerprintBytes(
    new TextEncoder().encode(
      canonicalJson({
        decision,
        evidenceFingerprint: issue.evidenceFingerprint,
      }),
    ),
  );
  const resolution: Resolution = {
    id,
    issueId: issue.id,
    choice: decision.answer ?? decision.choice,
    actor: decision.actor,
    at: decision.at,
    reason: decision.reason,
    evidenceFingerprint: issue.evidenceFingerprint,
    kind: issue.key.startsWith("check.")
      ? "verification"
      : decision.kind === "fact_entry"
        ? "fact_entry"
        : "fact_choice",
    ...(selected ? { observationId: selected } : {}),
    ...(unit ? { unit } : {}),
    evidence: decision.evidence ?? issue.evidence,
  };
  for (const e of resolution.evidence ?? [])
    if (
      !packet.artifacts.some(
        (a) =>
          a.fingerprint === e.artifactFingerprint &&
          a.parserVersion === e.parserVersion,
      )
    )
      throw new Error(
        "Verification evidence must reference an imported source",
      );
  return reconcile(
    {
      ...packet,
      checklistVerifications: checks,
      resolutions: [
        ...packet.resolutions.filter((r) => r.id !== resolution.id),
        resolution,
      ],
    },
    currentEvent,
  );
}
