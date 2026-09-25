import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useDishComponentSetPortionSpec,
  useListComponent,
  useListComponentPortionSpec,
  useListDishComponent,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { useActionNotice, useActionFailure } from "../../ui/action-result";
import { componentPath } from "./kitchenRoutes";

// Which named output size of a subrecipe one portion of this dish uses, and how
// many pieces of it. Without this the dish falls back to the subrecipe's plain
// yield. Portion specs themselves are defined on the component page.

type Props = {
  dishId: string;
};

const QUANTITY_BASIS = [
  { value: "as_purchased", label: "As purchased" },
  { value: "as_produced", label: "As produced" },
  { value: "raw", label: "Raw" },
  { value: "cooked", label: "Cooked" },
  { value: "unknown", label: "Unknown" },
] as const;

type PortionSpecOption = {
  _id: string;
  name: string;
  pieceQuantity: number;
  pieceUnit: string;
};

type LineRow = {
  _id: string;
  version: number;
  componentId: string;
  componentName: string | null;
  portionSpecId: string | null;
  pieceCount: number | null;
  quantityBasis: string | null;
  specs: PortionSpecOption[];
};

export function DishComponentPortionSpecPanel({ dishId }: Props) {
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const portionSpecs = useListComponentPortionSpec();
  const setPortionSpec = useDishComponentSetPortionSpec();

  const [busy, setBusy] = useState<string | null>(null);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();

  const rows = useMemo<LineRow[]>(() => {
    const componentById = new Map(
      (components ?? [])
        .filter((component) => component.deletedAt == null)
        .map((component) => [String(component._id), component]),
    );
    const specsByComponent = new Map<string, PortionSpecOption[]>();
    for (const spec of portionSpecs ?? []) {
      // A retired portion spec is a soft-deleted row; never offer one.
      if (spec.deletedAt != null) continue;
      const key = String(spec.componentId);
      const list = specsByComponent.get(key) ?? [];
      list.push({
        _id: String(spec._id),
        name: String(spec.name),
        pieceQuantity: Number(spec.pieceQuantity),
        pieceUnit: String(spec.pieceUnit),
      });
      specsByComponent.set(key, list);
    }
    return (dishComponents ?? [])
      .filter((line) => line.deletedAt == null && line.dishId === dishId)
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
      .map((line) => {
        const componentId = String(line.componentId);
        return {
          _id: String(line._id),
          version: Number(line.version),
          componentId,
          componentName: componentById.get(componentId)?.name ?? null,
          portionSpecId:
            line.portionSpecId == null ? null : String(line.portionSpecId),
          pieceCount: line.pieceCount == null ? null : Number(line.pieceCount),
          quantityBasis:
            line.quantityBasis == null ? null : String(line.quantityBasis),
          specs: specsByComponent.get(componentId) ?? [],
        };
      });
  }, [components, dishComponents, dishId, portionSpecs]);

  const loading =
    dishComponents === undefined ||
    components === undefined ||
    portionSpecs === undefined;

  const save = async (
    row: LineRow,
    values: {
      portionSpecId: string;
      pieceCount: number;
      quantityBasis: string;
    },
  ) => {
    setBusy(row._id);
    setError(null);
    setNotice(null);
    try {
      await setPortionSpec({
        docId: row._id,
        version: row.version,
        portionSpecId: values.portionSpecId,
        pieceCount: values.pieceCount,
        quantityBasis: values.quantityBasis,
      });
      setNotice(
        `Portion size saved for ${row.componentName ?? "the subrecipe"}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the portion size.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Portion sizes</h2>
        <span>How many pieces of each subrecipe one portion uses</span>
      </div>

      {error ? <p className="text-base text-danger">{error}</p> : null}
      {notice ? (
        <p className="text-base text-ok" role="status">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <div className="recipe-empty">
          <p>
            No subrecipes attached. Attach one above to set its pieces per
            portion.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <PortionSpecRow
              key={`${row._id}:${row.version}`}
              row={row}
              busy={busy != null}
              working={busy === row._id}
              onSave={save}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PortionSpecRow({
  row,
  busy,
  working,
  onSave,
}: Readonly<{
  row: LineRow;
  busy: boolean;
  working: boolean;
  onSave: (
    row: LineRow,
    values: {
      portionSpecId: string;
      pieceCount: number;
      quantityBasis: string;
    },
  ) => Promise<void>;
}>) {
  const [portionSpecId, setPortionSpecId] = useState(row.portionSpecId ?? "");
  const [pieceCount, setPieceCount] = useState(
    row.pieceCount == null ? "" : String(row.pieceCount),
  );
  const [quantityBasis, setQuantityBasis] = useState(
    row.quantityBasis ?? "as_produced",
  );

  const pieces = Number(pieceCount);
  const canSave =
    !busy &&
    row.specs.length > 0 &&
    portionSpecId.length > 0 &&
    Number.isFinite(pieces) &&
    pieces > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    void onSave(row, { portionSpecId, pieceCount: pieces, quantityBasis });
  };

  return (
    <li className="py-3" data-testid="dish-component-portion-spec-row">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          to={componentPath(row.componentId)}
          className="text-lg font-medium text-accent underline-offset-2 hover:underline"
        >
          {row.componentName ?? "Recipe unavailable"}
        </Link>
        {row.specs.length === 0 ? (
          <span className="text-sm text-ink-3">
            No portion sizes on this subrecipe — add one on its page first.
          </span>
        ) : null}
      </div>
      <form className="mt-2 grid gap-2 sm:grid-cols-4" onSubmit={submit}>
        <label className="field-label sm:col-span-2">
          <span>Portion size</span>
          <select
            className="input"
            value={portionSpecId}
            disabled={busy || row.specs.length === 0}
            onChange={(event) => setPortionSpecId(event.target.value)}
          >
            <option value="">Plain yield (no size)</option>
            {row.specs.map((spec) => (
              <option key={spec._id} value={spec._id}>
                {spec.name} ({spec.pieceQuantity} {spec.pieceUnit})
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          <span>Pieces per portion</span>
          <input
            className="input"
            type="number"
            min={0.0001}
            step="0.0001"
            value={pieceCount}
            disabled={busy || row.specs.length === 0}
            onChange={(event) => setPieceCount(event.target.value)}
          />
        </label>
        <label className="field-label">
          <span>Quantity basis</span>
          <select
            className="input"
            value={quantityBasis}
            disabled={busy || row.specs.length === 0}
            onChange={(event) => setQuantityBasis(event.target.value)}
          >
            {QUANTITY_BASIS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-4">
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {working ? "Saving…" : "Save portion size"}
          </button>
        </div>
      </form>
    </li>
  );
}
