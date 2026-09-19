import { useState, type FormEvent } from "react";
import { formatCountNoun } from "../../lib/format";
import {
  useComponentPortionSpecRetire,
  useComponentPortionSpecRevise,
  useCreateComponentPortionSpec,
  useListComponentPortionSpec,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import { readableRecipeAmount } from "./RecipeNotes";
import { SELECTABLE_UNITS, unitOptionsFor } from "./import/UnitOfMeasureMapper";

/** Named portions cut from one batch — the piece size the kitchen plates. */
export function ComponentPortionSpecsPanel({
  componentId,
}: {
  componentId: string;
}) {
  const specs = useListComponentPortionSpec();
  const defineSpec = useCreateComponentPortionSpec();
  const reviseSpec = useComponentPortionSpecRevise();
  const retireSpec = useComponentPortionSpecRetire();
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = (specs ?? [])
    .filter(
      (spec) => spec.deletedAt == null && spec.componentId === componentId,
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const pieceQuantity = Number(data.get("pieceQuantity"));
    if (!name || !Number.isFinite(pieceQuantity) || pieceQuantity <= 0) {
      setError("A portion needs a name and a piece size above zero.");
      return;
    }
    const piecesPerBatch = Number(data.get("piecesPerBatch"));
    setBusy("add");
    setError(null);
    try {
      await defineSpec({
        componentId,
        name,
        pieceQuantity,
        pieceUnit: String(data.get("pieceUnit") ?? "ounce"),
        piecesPerBatch:
          Number.isFinite(piecesPerBatch) && piecesPerBatch > 0
            ? piecesPerBatch
            : undefined,
        source: String(data.get("source") ?? "").trim() || undefined,
      });
      form.reset();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add the portion.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function run(key: string, work: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the portion.",
      );
    } finally {
      setBusy(null);
    }
  }

  // revise() keeps an omitted optional value, but the form still shows every
  // saved field so the cook edits what is really on file.
  async function onEdit(spec: (typeof rows)[number]) {
    const values = await prompt.askFields({
      title: "Edit portion size",
      description: `Change how ${spec.name} is cut from one batch.`,
      fields: [
        {
          name: "name",
          label: "Portion name",
          defaultValue: spec.name,
          required: true,
        },
        {
          name: "pieceQuantity",
          label: "Piece size",
          inputType: "number",
          defaultValue: String(spec.pieceQuantity),
          required: true,
        },
        {
          name: "pieceUnit",
          label: "Piece unit",
          defaultValue: String(spec.pieceUnit),
          options: unitOptionsFor(String(spec.pieceUnit)).map((unit) => ({
            value: unit,
            label: unit,
          })),
          required: true,
        },
        {
          name: "piecesPerBatch",
          label: "Pieces per batch",
          inputType: "number",
          defaultValue:
            spec.piecesPerBatch != null ? String(spec.piecesPerBatch) : "",
          required: false,
        },
        {
          name: "source",
          label: "Source",
          defaultValue: spec.source ?? "",
          required: false,
        },
      ],
      confirmLabel: "Save portion",
    });
    if (!values) return;
    const name = (values.name ?? "").trim();
    const pieceQuantity = Number(values.pieceQuantity);
    if (!name || !Number.isFinite(pieceQuantity) || pieceQuantity <= 0) return;
    const piecesPerBatch = Number(values.piecesPerBatch);
    await run(`edit:${spec._id}`, () =>
      reviseSpec({
        docId: spec._id,
        version: spec.version,
        name,
        pieceQuantity,
        pieceUnit: values.pieceUnit,
        piecesPerBatch:
          Number.isFinite(piecesPerBatch) && piecesPerBatch > 0
            ? piecesPerBatch
            : undefined,
        source: (values.source ?? "").trim() || undefined,
      }),
    );
  }

  async function onRetire(spec: (typeof rows)[number]) {
    const reason = (
      await prompt.askReason({
        title: "Retire portion size",
        description: `Take ${spec.name} off this recipe.`,
        label: "Reason",
        confirmLabel: "Retire portion",
        tone: "danger",
      })
    )?.trim();
    if (!reason) return;
    await run(`retire:${spec._id}`, () =>
      retireSpec({ docId: spec._id, version: spec.version, reason }),
    );
  }

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Portion sizes</h2>
        <span>
          {specs === undefined
            ? "Loading…"
            : formatCountNoun(rows.length, "portion")}
        </span>
      </div>
      {host}
      {error ? (
        <p className="text-base text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {specs === undefined ? (
        <TableSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>No portion size recorded. One batch is the only unit on file.</p>
        </div>
      ) : (
        <ul className="ingredient-list">
          {rows.map((spec) => (
            <li key={spec._id}>
              <strong>
                {readableRecipeAmount(
                  Number(spec.pieceQuantity),
                  String(spec.pieceUnit),
                )}
              </strong>
              <span>{spec.name}</span>
              <span>
                {[
                  spec.piecesPerBatch != null
                    ? `${spec.piecesPerBatch} per batch`
                    : "Pieces per batch not on file",
                  spec.source || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <div className="culinary-line-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => void onEdit(spec)}
                >
                  {busy === `edit:${spec._id}` ? "Saving…" : "Edit"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => void onRetire(spec)}
                >
                  {busy === `retire:${spec._id}` ? "Working…" : "Retire"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="culinary-line-form" onSubmit={onAdd}>
        <label className="field-label sm:col-span-2">
          Portion name
          <input
            name="name"
            className="input"
            placeholder="Half pan"
            required
          />
        </label>
        <label className="field-label">
          Piece size
          <input
            name="pieceQuantity"
            type="number"
            min={0.01}
            step="0.01"
            defaultValue={1}
            className="input"
            required
          />
        </label>
        <label className="field-label">
          Piece unit
          <select name="pieceUnit" className="input" defaultValue="ounce">
            {SELECTABLE_UNITS.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Pieces per batch
          <input
            name="piecesPerBatch"
            type="number"
            min={1}
            step="1"
            className="input"
          />
        </label>
        <label className="field-label">
          Source
          <input name="source" className="input" placeholder="Prep sheet" />
        </label>
        <button className="btn btn-primary self-end" disabled={busy != null}>
          {busy === "add" ? "Adding…" : "Add portion"}
        </button>
      </form>
    </section>
  );
}
