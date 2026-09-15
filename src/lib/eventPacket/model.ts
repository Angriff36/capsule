export type SourceKind =
  | "worksheet"
  | "beo"
  | "event_menu"
  | "menu_production"
  | "packlist_csv"
  | "packlist_item_type"
  | "packlist_category"
  | "event_tracker"
  | "ops_final_lock"
  | "quartermaster"
  | "event_forms"
  | "training"
  | "nowsta_event_timesheet"
  | "kitchen_shift"
  | "unknown";
export type Section =
  | "venue"
  | "staffing"
  | "timeline"
  | "menu"
  | "vehicles"
  | "layouts"
  | "equipment"
  | "contacts"
  | "packlist";
export type FieldValue = string | number | boolean | string[];
/** Original operational unit; comparisons must not coerce unlike units. */
export type Unit = string;
export interface EventIdentity {
  tenantId: string;
  invoiceNumber: string;
  eventDate: string;
  eventId?: string;
}
export interface SourceArtifact {
  fingerprint: string;
  name: string;
  mimeType: string;
  kind: SourceKind;
  parserVersion: string;
  recognitionEvidence: string[];
  importedAt: string;
  sourceTime?: string;
  sourceId?: string;
}
export interface EvidenceReference {
  artifactFingerprint: string;
  parserVersion: string;
  page?: number;
  row?: number;
  cell?: string;
  sourceTime?: string;
}
export interface Observation {
  id: string;
  fieldKey: string;
  value: FieldValue;
  unit?: Unit;
  evidence: EvidenceReference[];
  observedAt: string;
}
export interface Fact {
  fieldKey: string;
  value?: FieldValue;
  unit?: Unit;
  status:
    "confirmed" | "candidate" | "conflicted" | "missing" | "not_applicable";
  evidence: EvidenceReference[];
  confidence: number;
  authority?: "source_agreement" | "native_finalized" | "human_verified";
}
export interface PacketIssue {
  id: string;
  key: string;
  fieldKey: string;
  required: boolean;
  severity: "info" | "warning" | "blocking";
  section: Section;
  printSection: string;
  owner: string;
  message: string;
  status: "open" | "resolved";
  evidence: EvidenceReference[];
  evidenceFingerprint: string;
  verifiedAt?: string;
}
export interface Resolution {
  id: string;
  issueId: string;
  choice: FieldValue;
  actor: string;
  at: string;
  reason: string;
  evidenceFingerprint: string;
  kind?: "fact_choice" | "fact_entry" | "verification";
  observationId?: string;
  unit?: Unit;
  evidence?: EvidenceReference[];
}
export interface ChecklistVerification {
  checkKey: string;
  answer: "yes" | "no" | "not_applicable";
  actor: string;
  at: string;
  reason: string;
  evidence: EvidenceReference[];
}
export interface RevisionReference {
  id: string;
  snapshotFingerprint: string;
  createdAt: string;
  stage: PacketStage;
  supersededBy?: string;
}
export type PacketStage = "draft" | "review" | "ready";
export interface EventPacketSnapshot {
  schemaVersion: 1;
  identity: EventIdentity;
  artifacts: SourceArtifact[];
  observations: Observation[];
  facts: Fact[];
  issues: PacketIssue[];
  resolutions: Resolution[];
  checklistVerifications: ChecklistVerification[];
  revisions: RevisionReference[];
  stage: PacketStage;
}
export interface StoredRevision {
  id: string;
  identityKey: string;
  snapshotFingerprint: string;
  inputSnapshot: EventPacketSnapshot;
  pdfBytes: Uint8Array;
  createdAt: string;
  stage: PacketStage;
}
export function identityKey(identity: EventIdentity): string {
  return [identity.tenantId, identity.invoiceNumber, identity.eventDate]
    .map(encodeURIComponent)
    .join(":");
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function fingerprintBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function fingerprintSnapshot(
  snapshot: EventPacketSnapshot,
): Promise<string> {
  return fingerprintBytes(
    new TextEncoder().encode(canonicalJson({ ...snapshot, revisions: [] })),
  );
}
