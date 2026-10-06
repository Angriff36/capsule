import { useTrainingModuleSetTrainingDoc } from "../../lib/manifest-convex-react";
import type { ActionPromptSession } from "../../ui/action-prompt";

interface ModuleRow {
  _id: string;
  version: number;
  name: string;
  steps?: string | null;
  quiz?: string | null;
}

/** Edit a module's training doc: the steps a trainer initials and the quiz. */
export function TrainingDocAction({
  row,
  prompt,
  busy,
  run,
}: {
  row: ModuleRow;
  prompt: ActionPromptSession;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
}) {
  const setDoc = useTrainingModuleSetTrainingDoc();
  const edit = async () => {
    const values = await prompt.askFields({
      title: `${row.name} · training steps`,
      description:
        'One step per line. Start a line with "- " for detail under the step above. The trainer initials each step.',
      confirmLabel: "Save steps",
      fields: [
        {
          name: "steps",
          label: "Steps",
          multiline: true,
          required: false,
          defaultValue: row.steps ?? "",
        },
        {
          name: "quiz",
          label: "Quiz questions (optional)",
          multiline: true,
          required: false,
          defaultValue: row.quiz ?? "",
        },
      ],
    });
    if (!values) return;
    await run(`doc:${row._id}`, async () => {
      await setDoc({
        docId: row._id,
        version: row.version,
        steps: values.steps?.trim() || undefined,
        quiz: values.quiz?.trim() || undefined,
      });
    });
  };
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={busy != null}
      onClick={() => void edit()}
    >
      {busy === `doc:${row._id}` ? "Saving…" : "Training steps"}
    </button>
  );
}
