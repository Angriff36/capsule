import { useState, type FormEvent } from "react";
import {
  useCandidateAdvance,
  useCandidateHire,
  useCandidateReject,
  useCreateCandidate,
  useCreateInterview,
  useInterviewRecordOutcome,
  useListCandidate,
  useListInterview,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { useIngestKmCandidates } from "../../lib/hiringPipeline";
import { TableSkeleton } from "../../ui/primitives";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";

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

const STAGES = [
  "application",
  "screening",
  "interview",
  "decision",
  "hired",
  "rejected",
] as const;

const STAGE_LABEL: Record<string, string> = {
  application: "Application",
  screening: "Screening",
  interview: "Interview",
  decision: "Decision",
  hired: "Hired",
  rejected: "Rejected",
};

function localDateEpoch(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "");
  if (!text) return undefined;
  return new Date(`${text}T12:00:00`).getTime();
}

function formatEpoch(value: number | null | undefined): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export function CandidatesPage() {
  const candidates = useListCandidate();
  const interviews = useListInterview();
  const people = useListPerson();

  const createCandidate = useCreateCandidate();
  const advance = useCandidateAdvance();
  const reject = useCandidateReject();
  const hire = useCandidateHire();
  const scheduleInterview = useCreateInterview();
  const recordOutcome = useInterviewRecordOutcome();
  const ingestKm = useIngestKmCandidates();

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kmJson, setKmJson] = useState("");
  const [ingestReport, setIngestReport] = useState<string | null>(null);
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

  const hireCandidate = async (
    candidateId: string,
    version: number | undefined,
  ) => {
    setFailure(null);
    try {
      await hire({ docId: candidateId, version });
    } catch (error) {
      setFailure(error);
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
            interview-tool export to import candidates idempotently;
            re-importing the same export updates source-linked records without
            duplicating them.
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
            <span>{liveCandidates.length} records</span>
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
                      Applied {formatEpoch(candidate.appliedAt)}
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
                      defaultValue={candidate.stage}
                      disabled={candidate.stage === "hired"}
                    >
                      {STAGES.map((stage) => (
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
                      disabled={candidate.stage === "hired"}
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
                  </label>
                  <label className="field-label">
                    Rejection reason
                    <input
                      name="rejectReason"
                      className="input"
                      placeholder="Required to reject"
                      disabled={terminal}
                    />
                  </label>
                  <div className="field-label">
                    <span>&nbsp;</span>
                    <div className="checkbox-group">
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
                        disabled={candidate.stage === "hired"}
                        onClick={() =>
                          void hireCandidate(candidate._id, candidate.version)
                        }
                      >
                        Hire
                      </button>
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
                            <td>{formatEpoch(row.scheduledFor)}</td>
                            <td>{personName(row.interviewerPersonId)}</td>
                            <td>
                              <span className="badge">{row.outcome}</span>
                            </td>
                            <td>{row.notes || "—"}</td>
                            <td className="text-right">
                              {row.outcome === "pending" ? (
                                <span className="checkbox-group">
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
                                  {formatEpoch(row.conductedAt)}
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
                    <input name="scheduledFor" className="input" type="date" />
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
