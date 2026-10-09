import { useState, type FormEvent } from "react";
import {
  useCreateSkillLevel,
  useCreateTrainingSignOff,
  useListSkillLevel,
  useSkillLevelChangeLevel,
  useTrainingSignOffFinishTraining,
  useTrainingSignOffInitialTrainingSteps,
  useTrainingSignOffReopenTraining,
} from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import { TableSkeleton } from "../../ui/primitives";
import { useTrainingSignOffPages } from "../../lib/workforceHistoryQueries";
import { findSkillLevel, trainersFor, type SkillLevelRow } from "./skillLevels";
import {
  initialledCount,
  initialsOf,
  parseInitials,
  parseTrainingSteps,
  serializeInitials,
  toggleInitial,
} from "./trainingDoc";

interface PersonRow {
  _id: string;
  givenName?: string | null;
  familyName?: string | null;
}

interface ModuleRow {
  _id: string;
  name: string;
  steps?: string | null;
  quiz?: string | null;
}

interface SignOffRow {
  _id: string;
  version: number;
  personId: string;
  trainingModuleId: string;
  trainerPersonId?: string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
  initialledSteps?: string | null;
  quizDone?: boolean | null;
  note?: string | null;
  deletedAt?: number | null;
  createdAt?: number | null;
}

export interface TrainingSignOffPanelProps {
  people: readonly PersonRow[];
  modules: readonly ModuleRow[];
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
}

const fullName = (person: PersonRow | undefined) =>
  person
    ? `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim() || "Unnamed"
    : "Unknown";

const localDateEpoch = (value: FormDataEntryValue | null) =>
  new Date(`${String(value)}T12:00:00`).getTime();

const todayInput = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * Training sign-offs (Mangia "Training Doc"): trainee, trainer, start and end
 * dates, the module's steps initialled one by one, and the quiz.
 */
export function TrainingSignOffPanel({
  people,
  modules,
  busy,
  run,
}: TrainingSignOffPanelProps) {
  // The newest sign-offs, more on request.
  const signOffPages = useTrainingSignOffPages();
  const listed = signOffPages.rows as SignOffRow[] | undefined;
  const levels = (useListSkillLevel() as SkillLevelRow[] | undefined) ?? [];
  const create = useCreateTrainingSignOff();
  const initial = useTrainingSignOffInitialTrainingSteps();
  const finish = useTrainingSignOffFinishTraining();
  const reopen = useTrainingSignOffReopenTraining();
  const createLevel = useCreateSkillLevel();
  const changeLevel = useSkillLevelChangeLevel();
  const [starting, setStarting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [startModuleId, setStartModuleId] = useState("");

  const person = (id: string | null | undefined) =>
    people.find((row) => row._id === id);
  const rows = (listed ?? [])
    .filter((row) => row.deletedAt == null && row.startedAt != null)
    .sort(
      (a, b) =>
        Number(a.finishedAt != null) - Number(b.finishedAt != null) ||
        (b.startedAt ?? 0) - (a.startedAt ?? 0) ||
        (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
  const trainerIds = startModuleId
    ? trainersFor(
        levels,
        people.map((row) => row._id),
        startModuleId,
      )
    : [];

  const submitStart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run("signoff:start", async () => {
      await create({
        personId: String(data.get("personId")),
        trainingModuleId: String(data.get("trainingModuleId")),
        trainerPersonId: String(data.get("trainerPersonId") || "") || undefined,
        startedAt: localDateEpoch(data.get("startedAt")),
      });
      setStarting(false);
      setStartModuleId("");
    });
  };

  const submitFinish =
    (row: SignOffRow) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const current = findSkillLevel(
        levels,
        row.personId,
        row.trainingModuleId,
      );
      void run(`signoff:${row._id}`, async () => {
        await finish({
          docId: row._id,
          version: row.version,
          finishedAt: localDateEpoch(data.get("finishedAt")),
          quizDone: data.get("quizDone") === "on",
          note: String(data.get("note") || "") || undefined,
        });
        // Level 2 (Independent) means "training done" on the skills matrix.
        if (data.get("raiseLevel") === "on") {
          if (current)
            await changeLevel({
              docId: current._id,
              version: current.version,
              level: 2,
              note: current.note ?? undefined,
            });
          else
            await createLevel({
              personId: row.personId,
              trainingModuleId: row.trainingModuleId,
              level: 2,
            });
        }
      });
    };

  return (
    <section className="working-ledger" aria-label="Training sign-offs">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Training sign-offs</p>
          <h2>Who is in training, with whom</h2>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setStarting((open) => !open)}
        >
          {starting ? "Cancel" : "Start training"}
        </button>
      </div>

      {starting ? (
        <form className="supply-form-grid" onSubmit={submitStart}>
          <label className="field-label">
            Trainee
            <select name="personId" className="input" required>
              <option value="">Select person</option>
              {people.map((row) => (
                <option key={row._id} value={row._id}>
                  {fullName(row)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Module
            <select
              name="trainingModuleId"
              className="input"
              required
              value={startModuleId}
              onChange={(event) => setStartModuleId(event.target.value)}
            >
              <option value="">Select module</option>
              {modules.map((row) => (
                <option key={row._id} value={row._id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Trainer
            <select name="trainerPersonId" className="input">
              <option value="">No trainer named</option>
              {[...people]
                .sort(
                  (a, b) =>
                    Number(trainerIds.includes(b._id)) -
                    Number(trainerIds.includes(a._id)),
                )
                .map((row) => (
                  <option key={row._id} value={row._id}>
                    {fullName(row)}
                    {trainerIds.includes(row._id) ? " (level 4 trainer)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            Training start
            <BoundedDateInput
              naturalDateDirection="any"
              name="startedAt"
              className="input"
              defaultValue={todayInput()}
              required
            />
          </label>
          <div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "signoff:start" ? "Starting…" : "Start"}
            </button>
          </div>
        </form>
      ) : null}

      {listed === undefined ? (
        <TableSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>No one is in training.</p>
          <span>
            Start training to keep the trainer, the dates and each initialled
            step, like the paper training doc.
          </span>
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {rows.map((row) => {
            const module = modules.find((m) => m._id === row.trainingModuleId);
            const steps = parseTrainingSteps(module?.steps);
            const initials = parseInitials(row.initialledSteps);
            const trainer = person(row.trainerPersonId);
            const open = openId === row._id;
            const done = initialledCount(steps, initials);
            const level = findSkillLevel(
              levels,
              row.personId,
              row.trainingModuleId,
            );
            return (
              <li
                key={row._id}
                className="grid gap-2 border-b border-line pb-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <strong>{fullName(person(row.personId))}</strong>
                    {" · "}
                    {module?.name ?? "Unknown module"}
                    <p className="m-0 text-sm text-ink-2">
                      Trainer {trainer ? fullName(trainer) : "not named"} ·
                      Started {formatDate(row.startedAt!)} ·{" "}
                      {row.finishedAt
                        ? `Ended ${formatDate(row.finishedAt)}${row.quizDone ? " · Quiz done" : ""}`
                        : "In training"}
                    </p>
                    <p className="m-0 text-sm text-ink-2">
                      {steps.length === 0
                        ? "This module has no written steps yet."
                        : `${done} of ${steps.length} steps initialled`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setOpenId(open ? null : row._id)}
                    >
                      {open ? "Close sheet" : "Open sheet"}
                    </button>
                    {row.finishedAt ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          void run(`signoff:${row._id}`, async () => {
                            await reopen({
                              docId: row._id,
                              version: row.version,
                            });
                          })
                        }
                      >
                        Reopen
                      </button>
                    ) : null}
                  </div>
                </div>

                {open ? (
                  <div className="grid gap-3">
                    {steps.length > 0 ? (
                      <ol className="m-0 grid list-none gap-2 p-0">
                        {steps.map((step) => {
                          const mark = initials.find(
                            (item) => item.step === step.text,
                          );
                          return (
                            <li
                              key={step.text}
                              className="flex items-start gap-3"
                            >
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap"
                                aria-label={`${mark ? "Clear initials for" : "Initial"} ${step.text}`}
                                disabled={busy != null}
                                onClick={() =>
                                  void run(`signoff:${row._id}`, async () => {
                                    await initial({
                                      docId: row._id,
                                      version: row.version,
                                      initialledSteps: serializeInitials(
                                        toggleInitial(
                                          initials,
                                          step.text,
                                          initialsOf(
                                            trainer ? fullName(trainer) : "",
                                          ),
                                          Date.now(),
                                        ),
                                      ),
                                    });
                                  })
                                }
                              >
                                {mark
                                  ? `${mark.initials} ${formatDate(mark.at)}`
                                  : "Initial"}
                              </button>
                              <div>
                                <span>{step.text}</span>
                                {step.details.length > 0 ? (
                                  <ul className="m-0 pl-4 text-sm text-ink-2">
                                    {step.details.map((detail) => (
                                      <li key={detail}>{detail}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    ) : null}
                    {module?.quiz ? (
                      <div>
                        <strong>Quiz</strong>
                        <p className="m-0 text-sm text-ink-2">
                          If they do not know an answer, they must show where to
                          find it.
                        </p>
                        <p className="m-0 text-sm whitespace-pre-line">
                          {module.quiz}
                        </p>
                      </div>
                    ) : null}
                    {row.note ? (
                      <p className="m-0 text-sm">Note: {row.note}</p>
                    ) : null}
                    {row.finishedAt == null ? (
                      <form
                        className="supply-form-grid"
                        onSubmit={submitFinish(row)}
                      >
                        <label className="field-label">
                          Training end
                          <BoundedDateInput
                            naturalDateDirection="any"
                            name="finishedAt"
                            className="input"
                            defaultValue={todayInput()}
                            required
                          />
                        </label>
                        <label className="field-label">
                          Note (optional)
                          <input name="note" className="input" />
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" name="quizDone" />
                          Quiz asked and answered
                        </label>
                        {(level?.level ?? 0) < 2 ? (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              name="raiseLevel"
                              defaultChecked
                            />
                            Set skills matrix level to 2 Independent
                          </label>
                        ) : null}
                        <div>
                          <button
                            className="btn btn-primary"
                            disabled={busy != null}
                          >
                            {busy === `signoff:${row._id}`
                              ? "Saving…"
                              : "Finish training"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {signOffPages.canLoadMore ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={signOffPages.loadMore}
          >
            Load more
          </button>
        </div>
      ) : null}
    </section>
  );
}
