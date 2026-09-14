import { useState } from "react";
import {
  useCreateDishTaskMaterial,
  useDishTaskMaterialUnlink,
  useDishTaskSpecifyWork,
} from "../../lib/manifest-convex-react";
import { CHIP_TONE_CLASS } from "../../lib/statusLabels";
import { StatusChip } from "../../ui/primitives";
import type { ActionPromptSession } from "../../ui/action-prompt";

export type PrepMaterialOption = {
  id: string;
  kind: "ingredient" | "component";
  label: string;
};

export type PrepMaterialRow = {
  _id: string;
  version?: number;
  dishIngredientId?: string | null;
  dishComponentId?: string | null;
};

// The command keeps the stored value when a param is omitted, so the empty
// entry is a placeholder for "not set yet", never a way to clear the stage.
const STAGES = [
  { value: "kitchen", label: "Kitchen" },
  { value: "at_event", label: "At event" },
  { value: "pack", label: "Pack" },
];

/** What one prep step acts on, where it happens, and whether the cook must
 *  choose between two ways of doing it. */
export function DishPrepTaskWorkControls({
  task,
  materials,
  options,
  prompt,
}: {
  task: {
    _id: string;
    name: string;
    version?: number;
    stage?: string | null;
    resolution?: string | null;
    choiceOptions?: (string | null)[] | null;
  };
  materials: PrepMaterialRow[];
  options: PrepMaterialOption[];
  prompt: ActionPromptSession;
}) {
  const linkMaterial = useCreateDishTaskMaterial();
  const unlinkMaterial = useDishTaskMaterialUnlink();
  const specifyWork = useDishTaskSpecifyWork();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [choiceText, setChoiceText] = useState(
    (task.choiceOptions ?? []).filter(Boolean).join(", "),
  );

  const labelFor = (row: PrepMaterialRow) => {
    const id = row.dishIngredientId ?? row.dishComponentId ?? "";
    return options.find((option) => option.id === id)?.label ?? "Linked item";
  };

  const run = async (work: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const addMaterial = () => {
    const option = options.find((entry) => entry.id === pick);
    if (!option) {
      setError("Pick an ingredient or recipe from this dish first.");
      return;
    }
    void run(async () => {
      await linkMaterial({
        dishTaskId: task._id,
        ...(option.kind === "ingredient"
          ? { dishIngredientId: option.id }
          : { dishComponentId: option.id }),
      });
      setPick("");
    }, "Could not add the material.");
  };

  const removeMaterial = (row: PrepMaterialRow) => {
    void (async () => {
      const reason = (
        await prompt.askReason({
          title: "Remove material",
          description: `Stop ${task.name} acting on ${labelFor(row)}.`,
          label: "Removal reason",
          confirmLabel: "Remove material",
          tone: "danger",
        })
      )?.trim();
      if (!reason) return;
      await run(
        () => unlinkMaterial({ docId: row._id, reason, version: row.version }),
        "Could not remove the material.",
      );
    })();
  };

  const setStage = (stage: string) => {
    if (!stage) return;
    void run(
      () => specifyWork({ docId: task._id, version: task.version, stage }),
      "Could not set the stage.",
    );
  };

  const setChoice = (needsChoice: boolean) => {
    const choiceOptions = choiceText
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
    if (needsChoice && choiceOptions.length === 0) {
      setError("List the options the cook picks from, separated by commas.");
      return;
    }
    void run(
      () =>
        specifyWork({
          docId: task._id,
          version: task.version,
          resolution: needsChoice ? "choice_pending" : "resolved",
          choiceOptions: needsChoice ? choiceOptions : [],
        }),
      "Could not set the choice.",
    );
  };

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-base text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="meta-term">Acts on</span>
        {materials.length === 0 ? (
          <span className="text-sm text-ink-3">Nothing linked yet</span>
        ) : (
          materials.map((row) => (
            <span key={row._id} className="inline-flex items-center gap-1">
              <StatusChip
                status="prep_material"
                label={labelFor(row)}
                color={CHIP_TONE_CLASS.info}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => removeMaterial(row)}
                aria-label={`Remove ${labelFor(row)}`}
              >
                Remove
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="meta-term">Add material</span>
          <select
            className="input mt-1"
            value={pick}
            onChange={(event) => setPick(event.target.value)}
          >
            <option value="">Pick an ingredient or recipe…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || !pick}
          onClick={addMaterial}
        >
          Add material
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="meta-term">Stage</span>
          <select
            className="input mt-1"
            value={task.stage ?? ""}
            disabled={busy}
            onChange={(event) => setStage(event.target.value)}
          >
            <option value="" disabled>
              Stage not set
            </option>
            {STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="meta-term">Choice options (comma separated)</span>
          <input
            className="input mt-1"
            placeholder="make, portion"
            value={choiceText}
            onChange={(event) => setChoiceText(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={task.resolution === "choice_pending"}
            disabled={busy}
            onChange={(event) => setChoice(event.target.checked)}
          />{" "}
          Needs a choice
        </label>
      </div>
    </div>
  );
}
