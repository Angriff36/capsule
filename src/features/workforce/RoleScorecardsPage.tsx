import { useState, type FormEvent } from "react";
import {
  useListRoleScorecard,
  useRoleScorecardArchive,
  useRoleScorecardDefine,
  useRoleScorecardReactivate,
} from "../../lib/manifest-convex-react";
import { PersonRoleDirectory } from "../admin/PersonRoleDirectory";
import { TableSkeleton } from "../../ui/primitives";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  archived: "Archived",
} as const;

// A measurable expectation row — serialized to a JSON string on the
// `expectations` property (additive shape; no schema migration to extend).
type Expectation = { metric: string; target: string };

function parseExpectations(value: string | null | undefined): Expectation[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is Expectation =>
          typeof row === "object" &&
          row !== null &&
          typeof (row as { metric: unknown }).metric === "string" &&
          typeof (row as { target: unknown }).target === "string",
      )
      .map((row) => ({ metric: row.metric, target: row.target }));
  } catch {
    return [];
  }
}

function localDateEpoch(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  if (!text) return undefined;
  return new Date(`${text}T12:00:00`).getTime();
}

function formatEpoch(value: number | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export function RoleScorecardsPage() {
  const scorecards = useListRoleScorecard();
  const define = useRoleScorecardDefine();
  const archive = useRoleScorecardArchive();
  const reactivate = useRoleScorecardReactivate();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [expectations, setExpectations] = useState<Expectation[]>([
    { metric: "", target: "" },
  ]);

  const rows = (scorecards ?? []).filter((row) => row.deletedAt == null);
  const editing =
    editingId != null ? rows.find((r) => r._id === editingId) : null;

  const startDefine = () => {
    setEditingId(null);
    setExpectations([{ metric: "", target: "" }]);
    setOpen(true);
  };

  const startRevise = (id: string) => {
    const row = rows.find((r) => r._id === id);
    setEditingId(id);
    setExpectations(
      parseExpectations(row?.expectations).length
        ? parseExpectations(row?.expectations)
        : [{ metric: "", target: "" }],
    );
    setOpen(true);
  };

  const updateExpectation = (
    index: number,
    field: keyof Expectation,
    value: string,
  ) => {
    setExpectations((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const addExpectation = () => {
    setExpectations((prev) => [...prev, { metric: "", target: "" }]);
  };

  const removeExpectation = (index: number) => {
    setExpectations((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFailure(null);
    setBusy(true);
    void (async () => {
      try {
        const payload = {
          role: String(data.get("role")),
          title: String(data.get("title")),
          expectations: JSON.stringify(
            expectations.filter(
              (row) => row.metric.trim() || row.target.trim(),
            ),
          ),
          effectiveFrom: localDateEpoch(data.get("effectiveFrom")),
        };
        if (editingId) {
          // Supersede: define a new immutable version, then close the prior
          // (archive stamps effectiveTo). The old row stays intact so reviews
          // and one-on-ones referencing it remain historically interpretable.
          await define(payload);
          await archive({ id: editingId, reason: "Superseded by new version" });
        } else {
          await define(payload);
        }
        form.reset();
        setOpen(false);
        setExpectations([{ metric: "", target: "" }]);
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleArchive = async (id: string) => {
    const reason = window.prompt(
      "Archive reason (this scorecard stays in history):",
    );
    if (!reason?.trim()) return;
    setFailure(null);
    try {
      await archive({ id, reason });
    } catch (error) {
      setFailure(error);
    }
  };

  const handleReactivate = async (id: string) => {
    setFailure(null);
    try {
      await reactivate({ id });
    } catch (error) {
      setFailure(error);
    }
  };

  const loading = scorecards === undefined;

  return (
    <div className="operations-stage">
      <header className="training-masthead">
        <div>
          <p className="eyebrow">Staff · Role Scorecards</p>
          <h1 className="display-title mt-2">
            Measurable expectations for every role.
          </h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Define the current scorecard for each staff role — the metrics and
            targets reviews and one-on-ones measure against. Each revision is a
            new version; prior versions stay intact so historical assessments
            stay interpretable.
          </p>
        </div>
        <div aria-label="Scorecard actions">
          <button
            className="btn btn-primary"
            onClick={() => (open ? setOpen(false) : startDefine())}
          >
            {open ? "Close" : "New scorecard"}
          </button>
        </div>
      </header>

      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      {open ? (
        <form className="supply-form" onSubmit={submit}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Role scorecard</p>
              <h2>
                {editingId
                  ? "Define new version (supersedes prior)"
                  : "Define a new scorecard"}
              </h2>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy
                ? "Saving…"
                : editingId
                  ? "Create new version"
                  : "Create scorecard"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Role
              <select
                name="role"
                className="input"
                defaultValue={editing?.role ?? "staff"}
                required
              >
                {PersonRoleDirectory.ASSIGNABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {PersonRoleDirectory.label(role)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Title
              <input
                name="title"
                className="input"
                placeholder="e.g. Lead Server — 2026 standard"
                defaultValue={editing?.title ?? ""}
                required
              />
            </label>
            <label className="field-label">
              Effective from (optional)
              <input
                name="effectiveFrom"
                className="input"
                type="date"
                defaultValue={
                  editing?.effectiveFrom
                    ? new Date(editing.effectiveFrom).toISOString().slice(0, 10)
                    : ""
                }
              />
            </label>
            <div className="field-label col-span-2">
              Expectations (metric · target)
              <div className="checkbox-group">
                {expectations.map((row, index) => (
                  <div key={index} className="supply-form-grid">
                    <input
                      className="input"
                      placeholder="Metric (e.g. On-time arrival)"
                      value={row.metric}
                      onChange={(e) =>
                        updateExpectation(index, "metric", e.target.value)
                      }
                    />
                    <input
                      className="input"
                      placeholder="Target (e.g. ≥ 95%)"
                      value={row.target}
                      onChange={(e) =>
                        updateExpectation(index, "target", e.target.value)
                      }
                    />
                    {expectations.length > 1 ? (
                      <button
                        type="button"
                        className="btn-link btn-link-compact text-ink-2"
                        onClick={() => removeExpectation(index)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-link"
                  onClick={addExpectation}
                >
                  + Add expectation
                </button>
              </div>
            </div>
          </div>
          <div className="supply-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setOpen(false);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Scorecard ledger</p>
              <h2>Defined scorecards</h2>
            </div>
            <span>{rows.length} records</span>
          </div>
          {rows.length === 0 ? (
            <div className="document-empty">
              <p>No role scorecards defined yet.</p>
              <span>
                Define a scorecard to give reviews and one-on-ones a baseline.
              </span>
            </div>
          ) : (
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Title</th>
                    <th>Expectations</th>
                    <th>Effective</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows]
                    .sort((a, b) => a.role.localeCompare(b.role))
                    .map((row) => {
                      const parsed = parseExpectations(row.expectations);
                      return (
                        <tr key={row._id}>
                          <td>
                            <strong>
                              {PersonRoleDirectory.label(row.role)}
                            </strong>
                          </td>
                          <td>{row.title}</td>
                          <td className="text-ink-2">
                            {parsed.length
                              ? parsed
                                  .map((e) => `${e.metric}: ${e.target}`)
                                  .join(" · ")
                              : "—"}
                          </td>
                          <td className="text-ink-2">
                            {formatEpoch(row.effectiveFrom)}
                            {row.effectiveTo
                              ? ` → ${formatEpoch(row.effectiveTo)}`
                              : ""}
                          </td>
                          <td className="text-ink-2">v{row.version}</td>
                          <td>
                            <span
                              className={`badge badge-${
                                row.status === "active" ? "success" : "muted"
                              }`}
                            >
                              {STATUS_LABELS[row.status] ?? row.status}
                            </span>
                          </td>
                          <td className="text-right">
                            {row.status === "active" ? (
                              <>
                                <button
                                  className="btn-link btn-link-compact"
                                  onClick={() => startRevise(row._id)}
                                >
                                  Revise
                                </button>
                                <button
                                  className="btn-link btn-link-compact text-ink-2"
                                  onClick={() => handleArchive(row._id)}
                                >
                                  Archive
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn-link btn-link-compact"
                                onClick={() => handleReactivate(row._id)}
                              >
                                Reactivate
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
