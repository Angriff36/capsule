// AUTHOR SEAM support — KM interview-tool export parser (spec §9.3).
//
// There is no KM sample in the repo (it is an external interview-scheduling
// tool); this parser accepts the common KM export shape and is deliberately
// liberal about key casing (PascalCase / camelCase / snake_case), mirroring
// parseTppPackList. Unknown stages/roles map to safe Capsule defaults so a
// re-import never crashes; the verbatim KM record is preserved on `raw` (which
// the ingest seam stores on `rawSourceData`) so §9.3's "preserve source IDs
// and raw response references" holds for fields Capsule does not model.
//
// Idempotency: every parsed record carries an `external*Id`. If the KM record
// has no native id, a deterministic synthetic id (`synth:<hash>`) is derived
// from its content so re-importing the SAME export still dedupes (the §9.3
// "re-import updates without duplication" requirement). Caveat: two genuinely
// distinct KM records with identical content would share a synth id and merge
// — acceptable for id-less imports, and real KM ids always win.

/** A single interview parsed from a KM candidate record. */
export type ParsedKmInterview = {
  externalInterviewId: string;
  scheduledFor: number | null;
  interviewerName: string | null;
  outcome: "pending" | "passed" | "failed";
  notes: string | null;
  raw: string;
};

/** A single candidate parsed from a KM export. */
export type ParsedKmCandidate = {
  externalCandidateId: string;
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

/** djb2 — deterministic, no crypto import; good enough for dedup keys. */
function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

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

/**
 * Freeform KM role text → a valid CapsuleRole literal (default `staff`).
 * Normalizes spacing/punctuation so "Kitchen Manager" → `kitchen_manager`
 * (exact-vocab match) before falling back to department keywords.
 */
export function mapKmRole(text: string | null): string {
  if (!text) return "staff";
  const norm = text
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if (CAPSULE_ROLES.has(norm)) return norm;
  const isLead =
    norm.includes("lead") ||
    norm.includes("supervisor") ||
    norm.includes("director");
  const isMgr = norm.includes("manager") || norm.includes("mgr") || isLead;
  if (isMgr) {
    if (
      norm.includes("kitchen") ||
      norm.includes("cook") ||
      norm.includes("chef")
    ) {
      return isLead ? "kitchen_lead" : "kitchen_manager";
    }
    if (norm.includes("sales")) return "sales_manager";
    if (norm.includes("event")) return "event_manager";
    if (norm.includes("inventory") || norm.includes("stock"))
      return "inventory_manager";
    if (norm.includes("logistic") || norm.includes("warehouse")) {
      return "logistics_manager";
    }
    if (norm.includes("finance")) return "finance_manager";
    return "manager";
  }
  if (
    norm.includes("kitchen") ||
    norm.includes("cook") ||
    norm.includes("chef") ||
    norm.includes("dish") ||
    norm.includes("prep") ||
    norm.includes("bartend")
  ) {
    return "kitchen_staff";
  }
  if (norm.includes("sales")) return "sales_staff";
  if (
    norm.includes("server") ||
    norm.includes("event") ||
    norm.includes("captain")
  ) {
    return "event_staff";
  }
  if (norm.includes("driver")) return "driver";
  if (norm.includes("inventory") || norm.includes("stock"))
    return "inventory_staff";
  if (norm.includes("procure") || norm.includes("purchas"))
    return "procurement_staff";
  if (norm.includes("logistic") || norm.includes("warehouse"))
    return "logistics_staff";
  return "staff";
}

/**
 * Freeform KM stage text → a CandidateStage literal (default `application`).
 * Rejection/decline phrases are checked BEFORE "hire" so "not hired" / "no
 * hire" / "declined" map to `rejected`, not `hired`.
 */
export function mapKmStage(text: string | null): string {
  if (!text) return "application";
  const t = text.toLowerCase();
  if (
    t.includes("reject") ||
    t.includes("declin") ||
    t.includes("not hir") ||
    t.includes("no hire") ||
    t.includes("unsuccess")
  ) {
    return "rejected";
  }
  if (t.includes("hire") || t.includes("onboard")) return "hired";
  if (t.includes("offer") || t.includes("decision")) return "decision";
  if (t.includes("interview") || t.includes("onsite")) return "interview";
  if (t.includes("screen") || t.includes("phone")) return "screening";
  return "application";
}

/**
 * Freeform KM outcome text → pending/passed/failed (default pending).
 * Negative phrases are checked FIRST so "unsuccessful" (contains "success"),
 * "not hired", and "no hire" map to `failed`, not `passed`.
 */
export function mapKmOutcome(
  text: string | null,
): "pending" | "passed" | "failed" {
  if (!text) return "pending";
  const t = text.toLowerCase();
  if (
    t.includes("unsuccess") ||
    t.includes("not hir") ||
    t.includes("no hire") ||
    t.includes("fail") ||
    t.includes("reject") ||
    t.includes("declin") ||
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

function parseInterview(
  raw: unknown,
  candidateExtId: string,
): ParsedKmInterview | null {
  if (typeof raw !== "object" || raw == null) return null;
  const rec = raw as Record<string, unknown>;
  const scheduledFor = parseEpoch(
    rec.ScheduledAt ??
      rec.scheduledAt ??
      rec.scheduled_at ??
      rec.Date ??
      rec.date,
  );
  const interviewerName = pick(
    rec,
    "Interviewer",
    "interviewer",
    "InterviewerName",
    "interviewerName",
    "ConductedBy",
  );
  const notes = pick(rec, "Notes", "notes", "Feedback", "feedback", "Comments");
  const realId = pick(
    rec,
    "InterviewId",
    "interviewId",
    "interview_id",
    "Id",
    "id",
    "ExternalId",
  );
  const outcome = mapKmOutcome(
    pick(rec, "Outcome", "outcome", "Result", "result", "Decision", "decision"),
  );
  // Synthesize a deterministic id when KM provides none, so re-import dedupes.
  const externalInterviewId =
    realId ??
    `synth:${hashString(
      `${candidateExtId}|${interviewerName ?? ""}|${scheduledFor ?? ""}|${notes ?? ""}|${outcome}`,
    )}`;
  return {
    externalInterviewId,
    scheduledFor,
    interviewerName,
    outcome,
    notes,
    raw: JSON.stringify(rec),
  };
}

/**
 * Parse a KM interview-tool export. Accepts a bare array, `{ Candidates: [...] }`,
 * or `{ candidates: [...] }`. Records with neither a name nor an external id are
 * dropped (nothing to anchor a Capsule Candidate on).
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

    const realId = pick(
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
    if (!name && !realId) continue; // nothing to anchor on
    const fullName = name ?? `Candidate ${realId}`;
    const roleAppliedFor = mapKmRole(
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
    );
    // Synthesize a deterministic id when KM provides none, so re-import dedupes.
    const externalCandidateId =
      realId ?? `synth:${hashString(`${fullName}|${roleAppliedFor}`)}`;

    const interviewsRaw =
      rec.Interviews ??
      rec.interviews ??
      rec.interview_list ??
      rec.interviews_list ??
      [];
    const interviews: ParsedKmInterview[] = Array.isArray(interviewsRaw)
      ? interviewsRaw
          .map((iv) => parseInterview(iv, externalCandidateId))
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
      roleAppliedFor,
      stage: mapKmStage(
        pick(rec, "Stage", "stage", "PipelineStage", "Status", "status"),
      ),
      interviews,
      raw: JSON.stringify(rec),
    });
  }

  return { candidates };
}
