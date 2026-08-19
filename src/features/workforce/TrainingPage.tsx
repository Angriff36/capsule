import { useState, type CSSProperties, type FormEvent } from "react";
import {
  useCreateShiftType,
  useCreateTrainingCompletion,
  useCreateTrainingModule,
  useListPerson,
  useListShiftType,
  useListTrainingCompletion,
  useListTrainingModule,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { formatDate } from "../../lib/format";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import "./TrainingPage.css";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

const starterModules = [
  {
    name: "Food safety basics",
    category: "food_safety",
    passingScore: 80,
    description: "Safe handling, cross-contamination, and temperature control.",
  },
  {
    name: "Equipment operation",
    category: "equipment_operation",
    passingScore: 85,
    description: "Safe setup, operation, shutdown, and incident response.",
  },
  {
    name: "Service standards",
    category: "service_standards",
    passingScore: 80,
    description: "Guest care, service sequence, and event-floor expectations.",
  },
] as const;

const categoryLabels: Record<string, string> = {
  food_safety: "Food safety",
  equipment_operation: "Equipment operation",
  service_standards: "Service standards",
  other: "Other",
};

type Editor = "module" | "completion" | "shiftType" | null;

function localDateEpoch(value: FormDataEntryValue | null) {
  return new Date(`${String(value)}T12:00:00`).getTime();
}

export function TrainingPage() {
  const modules = useListTrainingModule();
  const completions = useListTrainingCompletion();
  const shiftTypes = useListShiftType();
  const people = useListPerson();
  const createModule = useCreateTrainingModule();
  const createCompletion = useCreateTrainingCompletion();
  const createShiftType = useCreateShiftType();
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [moduleDraft, setModuleDraft] = useState({
    name: "",
    category: "food_safety",
    passingScore: 80,
    description: "",
  });

  const activeModules = (modules ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );
  const activeCompletions = (completions ?? []).filter(
    (row) => row.deletedAt == null && row.recordedAt != null,
  );
  const activeShiftTypes = (shiftTypes ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );
  const activePeople = (people ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );

  const moduleName = (id: string) =>
    modules?.find((row) => row._id === id)?.name ?? "Unknown module";
  const personName = (id: string) => {
    const person = people?.find((row) => row._id === id);
    return person ? `${person.givenName} ${person.familyName}` : "Unknown";
  };

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitModule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("module", async () => {
      await createModule({
        name: String(data.get("name")),
        category: String(data.get("category")) as
          "food_safety" | "equipment_operation" | "service_standards" | "other",
        passingScore: Number(data.get("passingScore")),
        description: String(data.get("description") || "") || undefined,
      });
      setModuleDraft({
        name: "",
        category: "food_safety",
        passingScore: 80,
        description: "",
      });
      setEditor(null);
    });
  };

  const submitCompletion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("completion", async () => {
      await createCompletion({
        personId: String(data.get("personId")),
        trainingModuleId: String(data.get("trainingModuleId")),
        completedAt: localDateEpoch(data.get("completedAt")),
        assessmentScore: Number(data.get("assessmentScore")),
        notes: String(data.get("notes") || "") || undefined,
      });
      form.reset();
      setEditor(null);
    });
  };

  const submitShiftType = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("shiftType", async () => {
      await createShiftType({
        name: String(data.get("name")),
        description: String(data.get("description") || "") || undefined,
        requiredTrainingModuleId:
          String(data.get("requiredTrainingModuleId") || "") || undefined,
      });
      form.reset();
      setEditor(null);
    });
  };

  const loading =
    modules === undefined ||
    completions === undefined ||
    shiftTypes === undefined ||
    people === undefined;

  return (
    <div className="operations-stage training-stage">
      <header className="training-masthead">
        <div>
          <p className="eyebrow">Staff · Training</p>
          <h1 className="display-title mt-2">Ready crew, proven skills.</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Build the training library, record passed assessments, and connect
            safety-sensitive shift types to the proof they require.
          </p>
        </div>
        <div className="training-actions" aria-label="Training actions">
          <button
            className="btn btn-primary"
            onClick={() =>
              setEditor(editor === "completion" ? null : "completion")
            }
          >
            Record completion
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setEditor(editor === "module" ? null : "module")}
          >
            Define module
          </button>
          <button
            className="btn btn-ghost"
            onClick={() =>
              setEditor(editor === "shiftType" ? null : "shiftType")
            }
          >
            Define shift type
          </button>
        </div>
      </header>

      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      <section className="training-scoreboard" aria-label="Training overview">
        <div>
          <span>Active modules</span>
          <strong>{activeModules.length}</strong>
          <small>A shared standard for every assessment.</small>
        </div>
        <div>
          <span>Passed completions</span>
          <strong>{activeCompletions.length}</strong>
          <small>Dated, scored proof attached to staff.</small>
        </div>
        <div>
          <span>Gated shift types</span>
          <strong>
            {
              activeShiftTypes.filter(
                (row) => row.requiredTrainingModuleId != null,
              ).length
            }
          </strong>
          <small>Scheduling checks the exact required module.</small>
        </div>
      </section>

      {editor === "module" ? (
        <form className="supply-form training-form" onSubmit={submitModule}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Training library</p>
              <h2>Define a module</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "module" ? "Saving…" : "Save module"}
            </button>
          </div>
          <div className="training-starters" aria-label="Starter modules">
            {starterModules.map((starter) => (
              <button
                key={starter.name}
                type="button"
                onClick={() => setModuleDraft(starter)}
              >
                <span>{categoryLabels[starter.category]}</span>
                <strong>{starter.name}</strong>
                <small>{starter.passingScore}% pass</small>
              </button>
            ))}
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Module name
              <input
                name="name"
                className="input"
                value={moduleDraft.name}
                onChange={(event) =>
                  setModuleDraft((draft) => ({
                    ...draft,
                    name: event.target.value,
                  }))
                }
                placeholder="Food safety basics"
                required
              />
            </label>
            <label className="field-label">
              Category
              <select
                name="category"
                className="input"
                value={moduleDraft.category}
                onChange={(event) =>
                  setModuleDraft((draft) => ({
                    ...draft,
                    category: event.target.value,
                  }))
                }
              >
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Passing score
              <input
                name="passingScore"
                className="input"
                type="number"
                min="0"
                max="100"
                value={moduleDraft.passingScore}
                onChange={(event) =>
                  setModuleDraft((draft) => ({
                    ...draft,
                    passingScore: Number(event.target.value),
                  }))
                }
                required
              />
            </label>
            <label className="field-label training-wide-field">
              What this module covers
              <input
                name="description"
                className="input"
                value={moduleDraft.description}
                onChange={(event) =>
                  setModuleDraft((draft) => ({
                    ...draft,
                    description: event.target.value,
                  }))
                }
                placeholder="Skills and knowledge assessed"
              />
            </label>
          </div>
        </form>
      ) : null}

      {editor === "completion" ? (
        <form className="supply-form training-form" onSubmit={submitCompletion}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Passed assessment</p>
              <h2>Record a completion</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "completion" ? "Recording…" : "Record completion"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Person
              <select name="personId" className="input" required>
                <option value="">Select person</option>
                {activePeople.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.givenName} {person.familyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Module
              <select name="trainingModuleId" className="input" required>
                <option value="">Select module</option>
                {activeModules.map((module) => (
                  <option key={module._id} value={module._id}>
                    {module.name} · pass {module.passingScore}%
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Completed
              <BoundedDateInput name="completedAt" className="input" required />
            </label>
            <label className="field-label">
              Assessment score
              <input
                name="assessmentScore"
                className="input"
                type="number"
                min="0"
                max="100"
                placeholder="92"
                required
              />
            </label>
            <label className="field-label training-wide-field">
              Notes
              <input
                name="notes"
                className="input"
                placeholder="Optional assessor note"
              />
            </label>
          </div>
        </form>
      ) : null}

      {editor === "shiftType" ? (
        <form className="supply-form training-form" onSubmit={submitShiftType}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Scheduling standard</p>
              <h2>Define a shift type</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "shiftType" ? "Saving…" : "Save shift type"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Shift type name
              <input
                name="name"
                className="input"
                placeholder="Hot line lead"
                required
              />
            </label>
            <label className="field-label">
              Required module
              <select name="requiredTrainingModuleId" className="input">
                <option value="">No training prerequisite</option>
                {activeModules.map((module) => (
                  <option key={module._id} value={module._id}>
                    {module.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label training-wide-field">
              Description
              <input
                name="description"
                className="input"
                placeholder="When this shift type should be used"
              />
            </label>
          </div>
        </form>
      ) : null}

      <section className="training-library">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Module library</p>
            <h2>Standards people can complete</h2>
          </div>
          <span>{activeModules.length} active</span>
        </div>
        {loading ? (
          <TableSkeleton rows={3} />
        ) : activeModules.length === 0 ? (
          <div className="document-empty">
            <p>No training modules yet.</p>
            <span>
              Start with food safety, equipment, or service standards.
            </span>
          </div>
        ) : (
          <div className="training-module-grid">
            {activeModules.map((module, index) => {
              const completionCount = activeCompletions.filter(
                (row) => row.trainingModuleId === module._id,
              ).length;
              return (
                <article
                  key={module._id}
                  style={{ "--module-index": index } as CSSProperties}
                >
                  <div>
                    <span>
                      {categoryLabels[String(module.category)] ?? "Other"}
                    </span>
                    <b>{module.passingScore}% pass</b>
                  </div>
                  <h3>{module.name}</h3>
                  <p>{module.description || "No description provided."}</p>
                  <footer>
                    <strong>{completionCount}</strong>
                    <span>
                      {completionCount === 1 ? "completion" : "completions"}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="training-ledger-grid">
        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Completion ledger</p>
              <h2>Passed assessments</h2>
            </div>
            <span>{activeCompletions.length} records</span>
          </div>
          {loading ? (
            <TableSkeleton rows={4} />
          ) : activeCompletions.length === 0 ? (
            <div className="document-empty">
              <p>No completions are recorded.</p>
              <span>Passed scores appear here with their completion date.</span>
            </div>
          ) : (
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Module</th>
                    <th>Completed</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {[...activeCompletions]
                    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
                    .map((row) => (
                      <tr key={row._id}>
                        <td>
                          <strong>{personName(row.personId)}</strong>
                        </td>
                        <td>{moduleName(row.trainingModuleId)}</td>
                        <td>
                          {row.completedAt ? formatDate(row.completedAt) : "—"}
                        </td>
                        <td>
                          <span className="training-score">
                            {row.assessmentScore}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Shift gates</p>
              <h2>Shift types</h2>
            </div>
            <span>{activeShiftTypes.length} active</span>
          </div>
          {loading ? (
            <TableSkeleton rows={4} />
          ) : activeShiftTypes.length === 0 ? (
            <div className="document-empty">
              <p>No shift types are defined.</p>
              <span>Types without a prerequisite remain easy to schedule.</span>
            </div>
          ) : (
            <div className="training-shift-types">
              {activeShiftTypes.map((shiftType) => (
                <article key={shiftType._id}>
                  <div>
                    <strong>{shiftType.name}</strong>
                    <span>
                      {shiftType.requiredTrainingModuleId
                        ? "Training required"
                        : "Open assignment"}
                    </span>
                  </div>
                  <p>{shiftType.description || "No description provided."}</p>
                  {shiftType.requiredTrainingModuleId ? (
                    <small>
                      Requires {moduleName(shiftType.requiredTrainingModuleId)}
                    </small>
                  ) : (
                    <small>No module gate</small>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
