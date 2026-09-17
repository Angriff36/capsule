import { z } from "zod";
import { canonicalJson, type EventPacketSnapshot } from "./model";
const text = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.string().datetime({ offset: true });
const value = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);
const unit = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);
const evidence = z
  .object({
    artifactFingerprint: hash,
    parserVersion: text,
    page: z.number().int().positive().optional(),
    row: z.number().int().positive().optional(),
    cell: text.optional(),
    sourceTime: time.optional(),
  })
  .strict();
export const artifactSchema = z
  .object({
    fingerprint: hash,
    name: text,
    mimeType: text,
    kind: z.enum([
      "worksheet",
      "beo",
      "event_menu",
      "menu_production",
      "packlist_csv",
      "packlist_item_type",
      "packlist_category",
      "event_tracker",
      "ops_final_lock",
      "quartermaster",
      "event_forms",
      "training",
      "nowsta_event_timesheet",
      "kitchen_shift",
      "unknown",
    ]),
    parserVersion: text,
    recognitionEvidence: z.array(z.string()),
    importedAt: time,
    sourceTime: time.optional(),
    sourceId: text.optional(),
  })
  .strict();
const stage = z.enum(["draft", "review", "ready"]);
export const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: z
      .object({
        tenantId: text,
        invoiceNumber: text,
        eventDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine(
            (v) =>
              !Number.isNaN(Date.parse(v)) &&
              new Date(v).toISOString().startsWith(v),
          ),
        eventId: text.optional(),
      })
      .strict(),
    artifacts: z.array(artifactSchema),
    observations: z.array(
      z
        .object({
          id: text,
          fieldKey: text,
          value,
          unit: unit.optional(),
          evidence: z.array(evidence).min(1),
          observedAt: time,
        })
        .strict(),
    ),
    facts: z.array(
      z
        .object({
          fieldKey: text,
          value: value.optional(),
          unit: unit.optional(),
          status: z.enum([
            "confirmed",
            "candidate",
            "conflicted",
            "missing",
            "not_applicable",
          ]),
          evidence: z.array(evidence),
          confidence: z.number().min(0).max(1),
          authority: z
            .enum(["source_agreement", "native_finalized", "human_verified"])
            .optional(),
        })
        .strict(),
    ),
    issues: z.array(
      z
        .object({
          id: text,
          key: text,
          fieldKey: text,
          required: z.boolean(),
          severity: z.enum(["info", "warning", "blocking"]),
          section: z.enum([
            "venue",
            "staffing",
            "timeline",
            "menu",
            "vehicles",
            "layouts",
            "equipment",
            "contacts",
            "packlist",
          ]),
          printSection: text,
          owner: text,
          message: text,
          status: z.enum(["open", "resolved"]),
          evidence: z.array(evidence),
          evidenceFingerprint: hash,
          verifiedAt: time.optional(),
        })
        .strict(),
    ),
    resolutions: z.array(
      z
        .object({
          id: text,
          issueId: text,
          choice: value,
          actor: text,
          at: time,
          reason: text,
          evidenceFingerprint: hash,
          kind: z
            .enum(["fact_choice", "fact_entry", "verification"])
            .optional(),
          observationId: text.optional(),
          unit: unit.optional(),
          evidence: z.array(evidence).optional(),
        })
        .strict(),
    ),
    checklistVerifications: z.array(
      z
        .object({
          checkKey: text,
          answer: z.enum(["yes", "no", "not_applicable"]),
          actor: text,
          at: time,
          reason: text,
          evidence: z.array(evidence),
        })
        .strict(),
    ),
    revisions: z.array(
      z
        .object({
          id: text,
          snapshotFingerprint: hash,
          createdAt: time,
          stage,
          supersededBy: text.optional(),
        })
        .strict(),
    ),
    stage,
  })
  .strict();
export function validateSnapshot(input: unknown): EventPacketSnapshot {
  const packet = snapshotSchema.parse(input) as EventPacketSnapshot;
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new Error("Duplicate " + label);
  };
  unique(
    packet.artifacts.map((a) => a.fingerprint),
    "artifact",
  );
  unique(
    packet.observations.map((a) => a.id),
    "observation",
  );
  unique(
    packet.facts.map((a) => a.fieldKey),
    "fact",
  );
  unique(
    packet.issues.map((a) => a.id),
    "issue",
  );
  unique(
    packet.issues.map((a) => a.key),
    "issue key",
  );
  unique(
    packet.resolutions.map((a) => a.id),
    "resolution",
  );
  unique(
    packet.revisions.map((a) => a.id),
    "revision",
  );
  unique(
    packet.checklistVerifications.map((a) => a.checkKey),
    "check",
  );
  const artifacts = new Map(packet.artifacts.map((a) => [a.fingerprint, a]));
  for (const entry of [
    ...packet.observations,
    ...packet.facts,
    ...packet.issues,
    ...packet.checklistVerifications,
  ])
    for (const ref of entry.evidence) {
      const artifact = artifacts.get(ref.artifactFingerprint);
      if (!artifact || artifact.parserVersion !== ref.parserVersion)
        throw new Error("Dangling or mismatched artifact evidence");
    }
  for (const resolution of packet.resolutions) {
    if (!packet.issues.some((issue) => issue.id === resolution.issueId))
      throw new Error("Dangling resolution");
    for (const ref of resolution.evidence ?? []) {
      const artifact = artifacts.get(ref.artifactFingerprint);
      if (!artifact || artifact.parserVersion !== ref.parserVersion)
        throw new Error("Dangling resolution evidence");
    }
    if (resolution.observationId) {
      const observation = packet.observations.find(
        (o) => o.id === resolution.observationId,
      );
      const issue = packet.issues.find((i) => i.id === resolution.issueId)!;
      if (observation && observation.fieldKey !== issue.fieldKey)
        throw new Error("Resolution observation does not match issue field");
      if (
        issue.status === "resolved" &&
        issue.evidenceFingerprint === resolution.evidenceFingerprint &&
        (!observation ||
          canonicalJson(observation.value) !==
            canonicalJson(resolution.choice) ||
          observation.unit !== resolution.unit)
      )
        throw new Error(
          "Resolution choice or unit does not match its observation",
        );
    }
  }
  for (const issue of packet.issues)
    if (
      issue.status === "resolved" &&
      !packet.resolutions.some(
        (r) =>
          r.issueId === issue.id &&
          r.evidenceFingerprint === issue.evidenceFingerprint,
      )
    )
      throw new Error("Resolved issue lacks a matching evidence decision");
  for (const fact of packet.facts)
    if (
      fact.status === "confirmed" &&
      (fact.value === undefined ||
        !fact.authority ||
        (fact.authority === "source_agreement" &&
          new Set(fact.evidence.map((e) => e.artifactFingerprint)).size < 2))
    )
      throw new Error("Confirmed fact lacks supporting authority");
  if (
    packet.stage === "ready" &&
    packet.issues.some((i) => i.required && i.status === "open")
  )
    throw new Error("Open required issue prevents readiness");
  return packet;
}
