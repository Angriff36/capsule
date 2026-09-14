import { useState, type FormEvent } from "react";
import { formatCountNoun } from "../../lib/format";
import {
  useCreateComponentPortionSpec,
  useListComponentPortionSpec,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { readableRecipeAmount } from "./RecipeNotes";
import { SELECTABLE_UNITS } from "./import/UnitOfMeasureMapper";

/** Named portions cut from one batch — the piece size the kitchen plates. */
export function ComponentPortionSpecsPanel({
  componentId,
}: {
  componentId: string;
}) {
  const specs = useListComponentPortionSpec();
  const defineSpec = useCreateComponentPortionSpec();
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
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
      setBusy(false);
    }
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
        <button className="btn btn-primary self-end" disabled={busy}>
          {busy ? "Adding…" : "Add portion"}
        </button>
      </form>
    </section>
  );
}
