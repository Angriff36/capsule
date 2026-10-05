import {
  useCreateSkillLevel,
  useListSkillLevel,
  useSkillLevelChangeLevel,
} from "../../lib/manifest-convex-react";
import type { ActionPromptSession } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import {
  SKILL_LEVELS,
  findSkillLevel,
  skillLevelName,
  trainersFor,
  type SkillLevelRow,
} from "./skillLevels";

interface PersonRow {
  _id: string;
  givenName?: string | null;
  familyName?: string | null;
}

interface ModuleRow {
  _id: string;
  name: string;
}

export interface SkillsMatrixPanelProps {
  people: readonly PersonRow[];
  modules: readonly ModuleRow[];
  prompt: ActionPromptSession;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
}

const fullName = (person: PersonRow) =>
  `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim() || "Unnamed";

/**
 * Skills matrix: one row per person, one column per training module, each
 * cell the person's level 0-4 in that area. Click a cell to rate it.
 */
export function SkillsMatrixPanel({
  people,
  modules,
  prompt,
  busy,
  run,
}: SkillsMatrixPanelProps) {
  const listed = useListSkillLevel() as SkillLevelRow[] | undefined;
  const createLevel = useCreateSkillLevel();
  const changeLevel = useSkillLevelChangeLevel();
  const rows = listed ?? [];
  const personIds = people.map((person) => person._id);

  const rate = async (person: PersonRow, module: ModuleRow) => {
    const current = findSkillLevel(rows, person._id, module._id);
    const values = await prompt.askFields({
      title: `${fullName(person)} · ${module.name}`,
      description:
        "Pick how far this person is in this area. A beginner works it only with a trainer.",
      confirmLabel: "Save level",
      fields: [
        {
          name: "level",
          label: "Level",
          required: true,
          defaultValue: current ? String(current.level) : "1",
          options: SKILL_LEVELS.map((row) => ({
            value: String(row.level),
            label: `${row.level} ${row.name} - ${row.meaning}`,
          })),
        },
        {
          name: "note",
          label: "Note (optional)",
          inputType: "text",
          required: false,
          defaultValue: current?.note ?? "",
        },
      ],
    });
    if (!values) return;
    const level = Number(values.level);
    const note = values.note?.trim() || undefined;
    await run(`skill:${person._id}:${module._id}`, async () => {
      if (current)
        await changeLevel({
          docId: current._id,
          version: current.version,
          level,
          note,
        });
      else
        await createLevel({
          personId: person._id,
          trainingModuleId: module._id,
          level,
          note,
        });
    });
  };

  return (
    <section className="working-ledger" aria-label="Skills matrix">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Skills matrix</p>
          <h2>How far each person is in each area</h2>
        </div>
        <span>Levels 0 to 4</span>
      </div>
      <ul className="m-0 grid list-none gap-1 p-0 text-sm text-ink-2">
        {SKILL_LEVELS.map((row) => (
          <li key={row.level}>
            <strong className="text-ink">
              {row.level} {row.name}:
            </strong>{" "}
            {row.meaning}
          </li>
        ))}
      </ul>
      {listed === undefined ? (
        <TableSkeleton rows={4} />
      ) : modules.length === 0 || people.length === 0 ? (
        <div className="document-empty">
          <p>Nothing to rate yet.</p>
          <span>
            Each training module is one area of the matrix. Define a module and
            add staff to rate them.
          </span>
        </div>
      ) : (
        <div className="supply-table-wrap">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Person</th>
                {modules.map((module) => (
                  <th key={module._id}>{module.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person._id}>
                  <td>
                    <strong>{fullName(person)}</strong>
                  </td>
                  {modules.map((module) => {
                    const found = findSkillLevel(rows, person._id, module._id);
                    // The number only, like the paper matrix; the key above
                    // and the button's name give the level word.
                    const label = found ? String(found.level) : "Rate";
                    return (
                      <td key={module._id} data-label={module.name}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={`${fullName(person)}, ${module.name}: ${found ? `${found.level} ${skillLevelName(found.level)}` : "not rated"}`}
                          title={found?.note ?? undefined}
                          disabled={busy != null}
                          onClick={() => void rate(person, module)}
                        >
                          {busy === `skill:${person._id}:${module._id}`
                            ? "Saving…"
                            : label}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Trainers</td>
                {modules.map((module) => {
                  const trainers = trainersFor(rows, personIds, module._id);
                  return (
                    <td key={module._id} data-label={`${module.name} trainers`}>
                      {trainers.length === 0
                        ? "No trainer yet"
                        : trainers
                            .map((id) =>
                              fullName(people.find((p) => p._id === id)!),
                            )
                            .join(", ")}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
