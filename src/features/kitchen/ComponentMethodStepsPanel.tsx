import { useState, type FormEvent } from "react";
import {
  useComponentStepRemove,
  useComponentStepRevise,
  useCreateComponentStep,
  useListComponentStep,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";

function positiveWholeNumber(raw: string | undefined): number | undefined {
  const value = Number(raw);
  return raw != null &&
    raw.trim() !== "" &&
    Number.isFinite(value) &&
    value >= 0
    ? Math.round(value)
    : undefined;
}

/**
 * The numbered method. Steps are their own rows so a cook can correct one line
 * without retyping the whole method; the free-text method on the recipe stays
 * visible while it says something the steps do not.
 */
export function ComponentMethodStepsPanel({
  componentId,
  instructions,
}: {
  componentId: string;
  instructions?: string | null;
}) {
  const steps = useListComponentStep();
  const addStep = useCreateComponentStep();
  const reviseStep = useComponentStepRevise();
  const removeStep = useComponentStepRemove();
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = (steps ?? [])
    .filter(
      (step) =>
        step.deletedAt == null &&
        step.addedAt != null &&
        step.componentId === componentId,
    )
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a._creationTime - b._creationTime ||
        String(a._id).localeCompare(String(b._id)),
    );

  const prose = instructions?.trim();
  const proseMatchesSteps =
    rows.length > 0 &&
    prose?.replace(/\s+/g, " ") ===
      rows
        .map((step) => step.instruction.trim())
        .join(" ")
        .replace(/\s+/g, " ");

  const run = async (key: string, work: () => Promise<unknown>) => {
    setError(null);
    setBusy(key);
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the step.",
      );
    } finally {
      setBusy(null);
    }
  };

  const onAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const instruction = String(data.get("instruction") ?? "").trim();
    if (!instruction) {
      setError("A step needs an instruction.");
      return;
    }
    void run("add", async () => {
      await addStep({
        componentId,
        instruction,
        sortOrder: rows.length,
        durationMinutes: positiveWholeNumber(
          String(data.get("durationMinutes") ?? ""),
        ),
      });
      form.reset();
    });
  };

  const onEdit = (step: (typeof rows)[number], position: number) => {
    void (async () => {
      // revise() clears an omitted optional value, so every saved field goes
      // back with the change.
      const values = await prompt.askFields({
        title: `Edit step ${position}`,
        description:
          "Change the wording, the order or the time this step takes.",
        fields: [
          {
            name: "instruction",
            label: "Instruction",
            multiline: true,
            defaultValue: step.instruction,
            required: true,
          },
          {
            name: "sortOrder",
            label: "Step order",
            inputType: "number",
            defaultValue: String(step.sortOrder),
            required: true,
          },
          {
            name: "durationMinutes",
            label: "Minutes (leave empty for none)",
            inputType: "number",
            defaultValue:
              step.durationMinutes != null ? String(step.durationMinutes) : "",
            required: false,
          },
        ],
        confirmLabel: "Save step",
      });
      if (!values) return;
      const instruction = (values.instruction ?? "").trim();
      if (!instruction) return;
      await run(`edit:${step._id}`, () =>
        reviseStep({
          docId: step._id,
          version: step.version,
          instruction,
          sortOrder: positiveWholeNumber(values.sortOrder) ?? step.sortOrder,
          durationMinutes: positiveWholeNumber(values.durationMinutes),
        }),
      );
    })();
  };

  const onRemove = (step: (typeof rows)[number], position: number) => {
    void (async () => {
      const reason = (
        await prompt.askReason({
          title: `Remove step ${position}`,
          description: step.instruction,
          label: "Removal reason",
          confirmLabel: "Remove step",
          tone: "danger",
        })
      )?.trim();
      if (!reason) return;
      await run(`remove:${step._id}`, () =>
        removeStep({ docId: step._id, version: step.version, reason }),
      );
    })();
  };

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Method</h2>
        <span>
          {steps === undefined
            ? "Loading…"
            : `${rows.length} ${rows.length === 1 ? "step" : "steps"}`}
        </span>
      </div>
      {host}
      {error ? (
        <p className="text-base text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {prose && !proseMatchesSteps ? (
        <div className="method-prose">{prose}</div>
      ) : null}
      {steps === undefined ? (
        <p className="py-4 text-base text-ink-2" role="status">
          Loading method steps…
        </p>
      ) : rows.length ? (
        <ol className="divide-y divide-line" aria-label="Method steps">
          {rows.map((step, index) => (
            <li key={step._id} className="flex min-w-0 gap-3 py-4">
              <span className="font-mono text-base text-ink-2" aria-hidden>
                {index + 1}.
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="whitespace-pre-wrap break-words text-base text-ink">
                  {step.instruction}
                </p>
                {step.durationMinutes != null ? (
                  <span className="text-sm text-ink-2">
                    {step.durationMinutes} min
                  </span>
                ) : null}
              </div>
              <div className="culinary-line-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => onEdit(step, index + 1)}
                >
                  {busy === `edit:${step._id}` ? "Saving…" : "Edit"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => onRemove(step, index + 1)}
                >
                  {busy === `remove:${step._id}` ? "Working…" : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : !prose ? (
        <div className="document-empty">
          <p>No method on file.</p>
          <span>Add the steps a cook follows, one line at a time.</span>
        </div>
      ) : null}
      <form className="culinary-line-form" onSubmit={onAdd}>
        <label className="field-label sm:col-span-2">
          Next step
          <textarea
            name="instruction"
            className="input min-h-20 py-2"
            placeholder="Sweat the onions until soft"
            required
          />
        </label>
        <label className="field-label">
          Minutes
          <input
            name="durationMinutes"
            type="number"
            min={0}
            step={1}
            className="input"
          />
        </label>
        <button className="btn btn-primary self-end" disabled={busy != null}>
          {busy === "add" ? "Adding…" : "Add step"}
        </button>
      </form>
    </section>
  );
}
