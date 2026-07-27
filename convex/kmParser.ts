// AUTHOR SEAM support — KM interview-tool export parser (spec §9.3).
//
// There is no KM sample in the repo (it is an external interview-scheduling
// tool); this parser accepts the common KM export shape and is deliberately
// liberal about key casing (PascalCase / camelCase / snake_case), mirroring
// parseTppPackList. Unknown stages/roles map to safe Capsule defaults so a
// re-import never crashes; the verbatim KM record is preserved on `raw` (which
// the ingest seam stores on `rawSourceData`) so §9.3's "preserve source IDs
// and raw response references" holds even for fields Capsule does not model.

/** A single interview parsed from a KM candidate record. */
export type ParsedKmInterview = {
  externalInterviewId: string | null;
  scheduledFor: number | null;
  interviewerName: string | null;
  outcome: "pending" | "passed" | "failed";
  notes: string | null;
  raw: string;
};

/** A single candidate parsed from a KM export. */
export type ParsedKmCandidate = {
  externalCandidateId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** CapsuleRole literal (validated against the person.manifest vocab). */
  roleAppliedFor: string;
  /** CandidateStage literal. */
  stage: string;
  interviews: ParsedKmInterview[];
  raw: string;
};

const CAPSULE_ROLES = new Set([
  "staff",
  "kitchen_staff",
  "kitchen_lead",
  "sales_staff",
  "event_staff",
  "inventory_staff",
  "procurement_staff",
  "logistics_staff",
  "driver",
  "workforce_staff",
  "finance_staff",
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "logistics_manager",
  "workforce_manager",
  "finance_manager",
  "admin",
  "owner",
  "system",
]);

/** First non-empty string among the given keys (varied casing passed by caller). */
function pick(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim() !== "")
      return String(value).trim();
  }
  return null;
}

/** ISO string or epoch ms → epoch ms; unparseable → null. */
function parseEpoch(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
}

/** Freeform KM role text → a valid CapsuleRole literal (default `staff`). */
export function mapKmRole(text: string | null): string {
  if (!text) return "staff";
  const t = text.toLowerCase();
  if (CAPSULE_ROLES.has(t)) return t;
  if (t.includes("chef") || t.includes("cook") || t.includes("kitchen"))
    return "kitchen_staff";
  if (t.includes("bartend") || t.includes("dish") || t.includes("prep"))
    return "kitchen_staff";
  if (t.includes("sales")) return "sales_staff";
  if (t.includes("server") || t.includes("event") || t.includes("captain"))
    return "event_staff";
  if (t.includes("driver")) return "driver";
  if (t.includes("inventory") || t.includes("stock")) return "inventory_staff";
  if (t.includes("procure") || t.includes("purchas"))
    return "procurement_staff";
  if (t.includes("logistic") || t.includes("warehouse"))
    return "logistics_staff";
  if (t.includes("manager")) return "manager";
  if (t.includes("admin") || t.includes("owner")) return "admin";
  return "staff";
}

/** Freeform KM stage text → a CandidateStage literal (default `application`). */
export function mapKmStage(text: string | null): string {
  if (!text) return "application";
  const t = text.toLowerCase();
  if (t.includes("hire") || t.includes("onboard")) return "hired";
  if (t.includes("reject") || t.includes("declin")) return "rejected";
  if (t.includes("offer") || t.includes("decision")) return "decision";
  if (t.includes("interview") || t.includes("onsite")) return "interview";
  if (t.includes("screen") || t.includes("phone")) return "screening";
  return "application";
}

/** Freeform KM outcome text → pending/passed/failed (default pending). */
export function mapKmOutcome(
  text: string | null,
): "pending" | "passed" | "failed" {
  if (!text) return "pending";
  const t = text.toLowerCase();
  if (
    t.includes("fail") ||
    t.includes("reject") ||
    t.includes("declin") ||
    t === "no hire" ||
    t === "no"
  ) {
    return "failed";
  }
  if (
    t.includes("pass") ||
    t.includes("success") ||
    t.includes("strong") ||
    t.includes("offer") ||
    t.includes("hire")
  ) {
    return "passed";
  }
  return "pending";
}

function parseInterview(raw: unknown): ParsedKmInterview | null {
  if (typeof raw !== "object" || raw == null) return null;
  const rec = raw as Record<string, unknown>;
  return {
    externalInterviewId: pick(
      rec,
      "InterviewId",
      "interviewId",
      "interview_id",
      "Id",
      "id",
      "ExternalId",
    ),
    scheduledFor: parseEpoch(
      rec.ScheduledAt ??
        rec.scheduledAt ??
        rec.scheduled_at ??
        rec.Date ??
        rec.date,
    ),
    interviewerName: pick(
      rec,
      "Interviewer",
      "interviewer",
      "InterviewerName",
      "interviewerName",
      "ConductedBy",
    ),
    outcome: mapKmOutcome(
      pick(
        rec,
        "Outcome",
        "outcome",
        "Result",
        "result",
        "Decision",
        "decision",
      ),
    ),
    notes: pick(rec, "Notes", "notes", "Feedback", "feedback", "Comments"),
    raw: JSON.stringify(rec),
  };
}

/**
 * Parse a KM interview-tool export. Accepts a bare array, `{ Candidates: [...] }`,
 * or `{ candidates: [...] }`. Records with neither a name nor an external id are
 * dropped (nothing to anchor a Capsule Candidate on); a nameless but id-bearing
 * record keeps its external id as the display name.
 */
export function parseKmCandidates(json: string): {
  candidates: ParsedKmCandidate[];
} {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new Error("KM JSON could not be parsed — paste a valid KM export.");
  }

  const arr = Array.isArray(doc)
    ? doc
    : Array.isArray((doc as { Candidates?: unknown[] })?.Candidates)
      ? (doc as { Candidates: unknown[] }).Candidates
      : Array.isArray((doc as { candidates?: unknown[] })?.candidates)
        ? (doc as { candidates: unknown[] }).candidates
        : null;
  if (!arr) {
    throw new Error("KM JSON has no Candidates array.");
  }

  const candidates: ParsedKmCandidate[] = [];
  for (const entry of arr) {
    if (typeof entry !== "object" || entry == null) continue;
    const rec = entry as Record<string, unknown>;

    const externalCandidateId = pick(
      rec,
      "CandidateId",
      "candidateId",
      "candidate_id",
      "Id",
      "id",
      "ExternalId",
    );
    const name = pick(
      rec,
      "FullName",
      "fullName",
      "full_name",
      "Name",
      "name",
      "CandidateName",
    );
    if (!name && !externalCandidateId) continue; // nothing to anchor on
    const fullName = name ?? `Candidate ${externalCandidateId}`;

    const interviewsRaw =
      rec.Interviews ??
      rec.interviews ??
      rec.interview_list ??
      rec.interviews_list ??
      [];
    const interviews: ParsedKmInterview[] = Array.isArray(interviewsRaw)
      ? interviewsRaw
          .map(parseInterview)
          .filter((row): row is ParsedKmInterview => row != null)
      : [];

    candidates.push({
      externalCandidateId,
      fullName,
      email: pick(rec, "Email", "email", "EmailAddress", "email_address"),
      phone: pick(
        rec,
        "Phone",
        "phone",
        "PhoneNumber",
        "phone_number",
        "Mobile",
      ),
      roleAppliedFor: mapKmRole(
        pick(
          rec,
          "RoleAppliedFor",
          "roleAppliedFor",
          "role_applied_for",
          "Role",
          "role",
          "Position",
          "position",
        ),
      ),
      stage: mapKmStage(
        pick(rec, "Stage", "stage", "PipelineStage", "Status", "status"),
      ),
      interviews,
      raw: JSON.stringify(rec),
    });
  }

  return { candidates };
}
