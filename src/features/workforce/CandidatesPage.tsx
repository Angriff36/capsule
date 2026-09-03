import { useState, type FormEvent } from "react";
import {
  useCandidateAdvance,
  useCandidateReject,
  useCreateCandidate,
  useCreateInterview,
  useInterviewRecordOutcome,
  useListCandidate,
  useListInterview,
  useListPerson,
} from "../../lib/manifest-convex-react";
import {
  useHireCandidateIntoTeam,
  useIngestKmCandidates,
  useProvisionStaffSignIn,
} from "../../lib/hiringPipeline";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatCountNoun, formatDate } from "../../lib/format";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

// ponytail: a focused set of hireable operational roles for the create-form
// picker. roleAppliedFor is a free CapsuleRole, so a KM-sourced value outside
// this list still lands correctly (stored verbatim by the ingest seam).
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "kitchen_staff", label: "Kitchen staff" },
  { value: "kitchen_lead", label: "Kitchen lead" },
  { value: "sales_staff", label: "Sales staff" },
  { value: "event_staff", label: "Event staff" },
  { value: "inventory_staff", label: "Inventory staff" },
  { value: "procurement_staff", label: "Procurement staff" },
  { value: "logistics_staff", label: "Logistics staff" },
  { value: "driver", label: "Driver" },
  { value: "manager", label: "Manager" },
];

// advance can target only NON-TERMINAL stages (hired/rejected are reached via
// the dedicated Hire/Reject buttons). Reopening a mistakenly-hired/rejected
// candidate is allowed — Move works from any stage.
const STAGES_MOVE = [
  "application",
  "screening",
  "interview",
  "decision",
] as const;

const STAGE_LABEL: Record<string, string> = {
  application: "Application",
  screening: "Screening",
  interview: "Interview",
  decision: "Decision",
  hired: "Hired",
  rejected: "Rejected",
};

// Mirrors the seam's usability test: a sign-in needs a deliverable address,
// not just a nonempty field.
function hasUsableEmail(email: string | null | undefined): boolean {
  const value = (email ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function localDateEpoch(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "");
  if (!text) return undefined;
  return new Date(`${text}T12:00:00`).getTime();
}

export function CandidatesPage() {
  const candidates = useListCandidate();
  const interviews = useListInterview();
  const people = useListPerson();

  const createCandidate = useCreateCandidate();
  const advance = useCandidateAdvance();
  const reject = useCandidateReject();
  const scheduleInterview = useCreateInterview();
  const recordOutcome = useInterviewRecordOutcome();
  const ingestKm = useIngestKmCandidates();
  const hireIntoTeam = useHireCandidateIntoTeam();
  const provisionSignIn = useProvisionStaffSignIn();

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kmJson, setKmJson] = useState("");
  const [ingestReport, setIngestReport] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    tone: "ok" | "warn";
  } | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const activePeople = (people ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );
  const personName = (id: string | null | undefined) => {
    if (!id) return "—";
    const person = people?.find((row) => row._id === id);
    return person
      ? `${person.givenName} ${person.familyName}`.trim()
      : "Unknown";
  };

  const liveCandidates = (candidates ?? [])
    .filter((row) => row.deletedAt == null)
    .sort((a, b) => (b.appliedAt ?? 0) - (a.appliedAt ?? 0));
  const liveInterviews = (interviews ?? []).filter(
    (row) => row.deletedAt == null,
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFailure(null);
    setBusy(true);
    void (async () => {
      try {
        await createCandidate({
          fullName: String(data.get("fullName") || ""),
          email: String(data.get("email") || "") || undefined,
          phone: String(data.get("phone") || "") || undefined,
          roleAppliedFor: String(data.get("roleAppliedFor") || "staff"),
        });
        form.reset();
        setAdding(false);
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const runIngest = () => {
    if (!kmJson.trim()) return;
    setFailure(null);
    setBusy(true);
    void (async () => {
      try {
        const result = await ingestKm({ json: kmJson });
        setIngestReport(
          `${result.created} created · ${result.updated} updated · ${result.interviewsCreated} interviews added · ${result.interviewsUpdated} interviews updated`,
        );
        setKmJson("");
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const moveStage = async (
    candidateId: string,
    version: number | undefined,
    toStage: string,
  ) => {
    setFailure(null);
    try {
      await advance({ docId: candidateId, toStage, version });
    } catch (error) {
      setFailure(error);
    }
  };

  const rejectCandidate = async (
    candidateId: string,
    version: number | undefined,
    reason: string,
  ) => {
    setFailure(null);
    try {
      await reject({ docId: candidateId, reason, version });
    } catch (error) {
      setFailure(error);
    }
  };

  // Hire for real: team profile from the candidate row, then the sign-in
  // email (Clerk account + password). No email on the candidate still records
  // the hire — the profile has to be made under Team roles by hand.
  const hireCandidate = async (candidate: {
    _id: string;
    fullName: string;
    version: number | undefined;
    hiredPersonId?: string | null;
  }) => {
    setFailure(null);
    setNotice(null);
    setBusy(true);
    const linkedPerson =
      candidate.hiredPersonId != null
        ? people?.find((row) => row._id === candidate.hiredPersonId)
        : undefined;
    try {
      const result = await hireIntoTeam({
        candidateId: candidate._id as never,
        ...(candidate.version !== undefined
          ? { expectedVersion: candidate.version }
          : {}),
        // Reactivation intent: only the "Restore and resend" state sends it.
        ...(linkedPerson?.status === "inactive" ? { restore: true } : {}),
      });
      if (result.kind === "hired_no_email") {
        setNotice({
          text: `Hired ${candidate.fullName}. The candidate has no usable email, so no sign-in could be created — add them under Administration → Permissions → Team roles.`,
          tone: "warn",
        });
        return;
      }
      try {
        const provisioned = await provisionSignIn({
          personId: result.personId as never,
        });
        setNotice({
          text: `Hired ${candidate.fullName}. Emailed ${
            provisioned.passwordIssued
              ? "a sign-in link and password"
              : "a sign-in link"
          } to ${provisioned.email}.`,
          tone: "ok",
        });
      } catch (provisionError) {
        setNotice({
          text: `Hired ${candidate.fullName}, but the sign-in email failed${
            provisionError instanceof Error ? `: ${provisionError.message}` : ""
          }. Use Email sign-in under Administration → Permissions → Team roles.`,
          tone: "warn",
        });
      }
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const addInterview = (
    event: FormEvent<HTMLFormElement>,
    candidateId: string,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFailure(null);
    void (async () => {
      try {
        await scheduleInterview({
          candidateId,
          scheduledFor: localDateEpoch(data.get("scheduledFor")),
          interviewerPersonId:
            String(data.get("interviewerPersonId") || "") || undefined,
        });
        form.reset();
      } catch (error) {
        setFailure(error);
      }
    })();
  };

  const recordInterviewOutcome = async (
    interviewId: string,
    version: number | undefined,
    outcome: "passed" | "failed",
  ) => {
    setFailure(null);
    try {
      await recordOutcome({ docId: interviewId, outcome, version });
    } catch (error) {
      setFailure(error);
    }
  };

  const loading =
    candidates === undefined ||
    interviews === undefined ||
    people === undefined;

  return (
    <div className="operations-stage">
      <header className="training-masthead">
        <div>
          <p className="eyebrow">Staff · Hiring pipeline</p>
          <h1 className="display-title mt-2">
            Track candidates from application to hire.
          </h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Add candidates and move them through application, screening,
            interview, and decision — then hire or reject. Paste a KM
            interview-tool export to bring candidates in; re-importing the same
            export updates the existing candidates instead of duplicating them.
          </p>
        </div>
        <div aria-label="Candidate actions">
          <button
            className="btn btn-primary"
            onClick={() => (adding ? setAdding(false) : setAdding(true))}
          >
            {adding ? "Close" : "New candidate"}
          </button>
        </div>
      </header>

      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}
      {notice ? (
        <output
          className={`banner ${
            notice.tone === "warn" ? "banner-warn" : "banner-ok"
          } block mt-4`}
        >
          {notice.text}
        </output>
      ) : null}

      {/* KM interview-tool import (spec §9.3 "map the KM JSON into the model"). */}
      <section className="working-ledger mt-4">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">KM import</p>
            <h2>Import from KM interview tool</h2>
          </div>
          {ingestReport ? <span>{ingestReport}</span> : null}
        </div>
        <textarea
          className="input"
          rows={4}
          placeholder='Paste KM export JSON, e.g. { "Candidates": [{ "CandidateId": "KM-1", "FullName": "Jane Doe", "Stage": "interview", "Interviews": [] }] }'
          value={kmJson}
          onChange={(e) => setKmJson(e.target.value)}
        />
        <div className="supply-form-actions mt-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !kmJson.trim()}
            onClick={runIngest}
          >
            {busy ? "Importing…" : "Ingest KM export"}
          </button>
        </div>
      </section>

      {adding ? (
        <form className="supply-form mt-4" onSubmit={submit}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Candidate</p>
              <h2>New candidate</h2>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Add candidate"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Full name
              <input
                name="fullName"
                className="input"
                required
                placeholder="Jane Doe"
              />
            </label>
            <label className="field-label">
              Role applied for
              <select
                name="roleAppliedFor"
                className="input"
                defaultValue="staff"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Email (optional)
              <input name="email" className="input" type="email" />
            </label>
            <label className="field-label">
              Phone (optional)
              <input name="phone" className="input" />
            </label>
          </div>
        </form>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : liveCandidates.length === 0 ? (
        <section className="working-ledger">
          <div className="document-empty">
            <p>No candidates yet.</p>
            <span>Add one or ingest a KM export to start the pipeline.</span>
          </div>
        </section>
      ) : (
        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Candidate pipeline</p>
              <h2>All candidates</h2>
            </div>
            <span>{formatCountNoun(liveCandidates.length, "record")}</span>
          </div>
          {liveCandidates.map((candidate) => {
            const candidateInterviews = liveInterviews.filter(
              (row) => row.candidateId === candidate._id,
            );
            const terminal = ["hired", "rejected"].includes(candidate.stage);
            return (
              <div key={candidate._id} className="supply-form mt-4">
                <div className="supply-form-heading">
                  <div>
                    <p className="eyebrow">
                      {STAGE_LABEL[candidate.stage] ?? candidate.stage} ·{" "}
                      {candidate.roleAppliedFor}
                      {candidate.sourceSystem === "km_interview"
                        ? " · KM"
                        : " · Native"}
                    </p>
                    <h2>{candidate.fullName}</h2>
                    <p className="text-ink-2 mt-1">
                      Applied {formatDate(candidate.appliedAt)}
                      {candidate.email ? ` · ${candidate.email}` : ""}
                      {candidate.phone ? ` · ${candidate.phone}` : ""}
                    </p>
                    {candidate.stage === "rejected" &&
                    candidate.rejectionReason ? (
                      <p className="mt-1">
                        <strong>Reason:</strong> {candidate.rejectionReason}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="supply-form-grid">
                  <label className="field-label">
                    Move to stage
                    <select
                      name="toStage"
                      className="input"
                      defaultValue={
                        (STAGES_MOVE as readonly string[]).includes(
                          candidate.stage,
                        )
                          ? candidate.stage
                          : "screening"
                      }
                    >
                      {STAGES_MOVE.map((stage) => (
                        <option key={stage} value={stage}>
                          {STAGE_LABEL[stage]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    <span>&nbsp;</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || candidate.hiredPersonId != null}
                      title={
                        candidate.hiredPersonId != null
                          ? "Reopening is disabled while a team profile is linked (issue #269). Change their status under Administration → Permissions → Team roles."
                          : undefined
                      }
                      onClick={(e) => {
                        const select = e.currentTarget
                          .closest(".supply-form-grid")
                          ?.querySelector<HTMLSelectElement>(
                            'select[name="toStage"]',
                          );
                        if (select) {
                          void moveStage(
                            candidate._id,
                            candidate.version,
                            select.value,
                          );
                        }
                      }}
                    >
                      Move
                    </button>
                    {candidate.hiredPersonId != null ? (
                      <p className="text-sm text-ink-2 mt-2">
                        Reopening is disabled while a team profile is linked
                        (issue #269). Change their status under Administration →
                        Permissions → Team roles.
                      </p>
                    ) : null}
                  </label>
                  <label className="field-label">
                    Rejection note (optional)
                    <input
                      name="rejectReason"
                      className="input"
                      placeholder="Optional"
                      disabled={terminal}
                    />
                  </label>
                  <div className="field-label">
                    <span>&nbsp;</span>
                    <div className="supply-row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={terminal}
                        onClick={(e) => {
                          const input = e.currentTarget
                            .closest(".supply-form-grid")
                            ?.querySelector<HTMLInputElement>(
                              'input[name="rejectReason"]',
                            );
                          void rejectCandidate(
                            candidate._id,
                            candidate.version,
                            (input?.value ?? "").trim(),
                          );
                        }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                          busy ||
                          (candidate.stage === "hired" &&
                            candidate.hiredPersonId == null &&
                            !hasUsableEmail(candidate.email))
                        }
                        onClick={() => void hireCandidate(candidate)}
                      >
                        {candidate.stage !== "hired"
                          ? "Hire into team"
                          : candidate.hiredPersonId == null
                            ? "Finish team setup"
                            : (people?.find(
                                  (row) => row._id === candidate.hiredPersonId,
                                )?.status ?? "active") === "inactive"
                              ? "Restore and resend"
                              : "Resend sign-in"}
                      </button>
                      {candidate.stage === "hired" &&
                      candidate.hiredPersonId == null &&
                      !hasUsableEmail(candidate.email) ? (
                        <p className="text-sm text-ink-2 mt-2">
                          This hire has no usable email, so no sign-in can be
                          set up. Re-import the candidate with an email, or add
                          them under Administration → Permissions → Team roles.
                        </p>
                      ) : null}
                      {candidate.hiredPersonId != null &&
                      people?.find((row) => row._id === candidate.hiredPersonId)
                        ?.status === "inactive" ? (
                        <p className="text-sm text-ink-2 mt-2">
                          Their team profile is inactive. This restores it, then
                          emails the sign-in again.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                {candidateInterviews.length > 0 ? (
                  <div className="supply-table-wrap mt-4">
                    <table className="supply-table">
                      <thead>
                        <tr>
                          <th>Scheduled</th>
                          <th>Interviewer</th>
                          <th>Outcome</th>
                          <th>Notes</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidateInterviews.map((row) => (
                          <tr key={row._id}>
                            <td>{formatDate(row.scheduledFor)}</td>
                            <td>{personName(row.interviewerPersonId)}</td>
                            <td>
                              <StatusChip status={String(row.outcome)} />
                            </td>
                            <td>{row.notes || "—"}</td>
                            <td className="text-right">
                              {row.outcome === "pending" ? (
                                <span className="inline-flex items-center gap-3">
                                  <button
                                    className="btn-link btn-link-compact"
                                    onClick={() =>
                                      void recordInterviewOutcome(
                                        row._id,
                                        row.version,
                                        "passed",
                                      )
                                    }
                                  >
                                    Passed
                                  </button>
                                  <button
                                    className="btn-link btn-link-compact"
                                    onClick={() =>
                                      void recordInterviewOutcome(
                                        row._id,
                                        row.version,
                                        "failed",
                                      )
                                    }
                                  >
                                    Failed
                                  </button>
                                </span>
                              ) : (
                                <span className="text-ink-2">
                                  {formatDate(row.conductedAt)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <form
                  className="supply-form-grid mt-4"
                  onSubmit={(e) => addInterview(e, candidate._id)}
                >
                  <label className="field-label">
                    Interviewer
                    <select name="interviewerPersonId" className="input">
                      <option value="">Unassigned</option>
                      {activePeople.map((person) => (
                        <option key={person._id} value={person._id}>
                          {person.givenName} {person.familyName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Scheduled for (optional)
                    <BoundedDateInput name="scheduledFor" className="input" />
                  </label>
                  <div className="field-label">
                    <span>&nbsp;</span>
                    <button className="btn btn-secondary">
                      Schedule interview
                    </button>
                  </div>
                </form>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
