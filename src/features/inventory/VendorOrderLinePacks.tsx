import { packRounding, type PackMapping } from "./packRounding";

type Line = {
  _id: string;
  ingredientId: string;
  unit: string;
  status: string;
  orderedQuantity: number;
  plannedQuantity?: number | null;
};

const plural = (count: number, unit: string) =>
  count === 1 ? unit : `${unit}s`;

/** Exact need next to what is ordered, and the whole-pack choice when the
 * vendor's pack size is recorded. Rounding happens only when the buyer taps. */
export function VendorOrderLinePacks({
  line,
  mappings,
  canEdit,
  busy,
  onOrderPacks,
}: {
  line: Line;
  mappings: readonly PackMapping[];
  canEdit: boolean;
  busy: boolean;
  onOrderPacks: (quantity: number) => void;
}) {
  const need = Number(line.plannedQuantity ?? line.orderedQuantity);
  const ordered = Number(line.orderedQuantity);
  const rounding = packRounding({
    need,
    lineUnit: line.unit,
    ingredientId: line.ingredientId,
    mappings,
  });
  return (
    <>
      <small>
        Needed {need} {line.unit} · ordering {ordered} {line.unit}
      </small>
      {rounding ? (
        <small>
          Sold by the {rounding.packUnit} ({rounding.packSize} {line.unit}):{" "}
          {rounding.packs} {plural(rounding.packs, rounding.packUnit)} ={" "}
          {rounding.roundedQuantity} {line.unit}
          {rounding.extra > 0
            ? `, ${rounding.extra} ${line.unit} left over`
            : ""}
        </small>
      ) : need > 0 ? (
        <small>No pack size recorded, so the exact amount is ordered.</small>
      ) : null}
      {rounding && canEdit && ordered !== rounding.roundedQuantity ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => onOrderPacks(rounding.roundedQuantity)}
        >
          Order {rounding.packs} {plural(rounding.packs, rounding.packUnit)} (
          {rounding.roundedQuantity} {line.unit})
        </button>
      ) : null}
    </>
  );
}
