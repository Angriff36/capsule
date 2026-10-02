import { useState, type FormEvent } from "react";
import {
  useCreateVendorItem,
  useListVendorItem,
  useVendorItemRemove,
  useVendorItemUpdate,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { useActionPrompt } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import { SELECTABLE_UNITS } from "./import/UnitOfMeasureMapper";

type VendorOption = {
  readonly _id: string;
  readonly name: string;
  readonly deletedAt?: number | null;
};

const PRICE_DATE = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Pack price per ingredient unit, when the pack is counted in that unit. */
export function vendorItemUnitPrice(
  packPrice: number | null | undefined,
  packQuantity: number,
  packUnit: string,
  ingredientUnit: string,
): number | null {
  if (packPrice == null || packUnit !== ingredientUnit || !(packQuantity > 0))
    return null;
  return Number(packPrice) / Number(packQuantity);
}

/**
 * What each vendor sells us for this ingredient (Galley's vendor item list):
 * the vendor's item number, the pack and the pack price. One ingredient can
 * come from several vendors.
 */
export function VendorItemsPanel({
  ingredientId,
  ingredientUnit,
  vendors,
  onFailure,
}: {
  ingredientId: string;
  ingredientUnit: string;
  vendors: readonly VendorOption[] | undefined;
  onFailure: (error: unknown) => void;
}) {
  const items = useListVendorItem();
  const addItem = useCreateVendorItem();
  const updateItem = useVendorItemUpdate();
  const removeItem = useVendorItemRemove();
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const rows = (items ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.addedAt != null &&
      row.ingredientId === ingredientId,
  );
  const liveVendors = (vendors ?? []).filter((v) => v.deletedAt == null);
  const vendorName = (id: string) =>
    (vendors ?? []).find((v) => v._id === id)?.name ?? "Unknown vendor";
  const editing = rows.find((row) => row._id === editingId) ?? null;
  const units: readonly string[] = (
    SELECTABLE_UNITS as readonly string[]
  ).includes(ingredientUnit)
    ? SELECTABLE_UNITS
    : [ingredientUnit, ...SELECTABLE_UNITS];

  const run = async (key: string, work: () => Promise<unknown>) => {
    onFailure(null);
    setBusy(key);
    try {
      await work();
      return true;
    } catch (error) {
      onFailure(error);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const packQuantity = Number(data.get("packQuantity"));
    if (!Number.isFinite(packQuantity) || packQuantity <= 0) return;
    const priceText = String(data.get("packPrice") ?? "").trim();
    const packPrice = priceText === "" ? undefined : Number(priceText);
    if (packPrice !== undefined && !(packPrice >= 0)) return;
    const fields = {
      description: String(data.get("description") ?? "").trim(),
      itemCode: String(data.get("itemCode") ?? "").trim() || undefined,
      packQuantity,
      packUnit: String(data.get("packUnit") ?? ingredientUnit),
      packPrice,
    };
    void (async () => {
      const ok = await run("save", () =>
        editing
          ? updateItem({
              docId: editing._id,
              version: editing.version,
              ...fields,
            })
          : addItem({
              vendorId: String(data.get("vendorId") ?? ""),
              ingredientId,
              ...fields,
            }),
      );
      if (ok) {
        form.reset();
        setEditingId(null);
      }
    })();
  };

  const onRemove = (row: (typeof rows)[number]) => {
    void (async () => {
      const ok = await prompt.askConfirm({
        title: "Remove vendor item",
        description: `${vendorName(row.vendorId)} will no longer be listed as selling ${row.description}.`,
        confirmLabel: "Remove item",
        tone: "danger",
      });
      if (!ok) return;
      await run(`remove:${row._id}`, () =>
        removeItem({ docId: row._id, version: row.version }),
      );
    })();
  };

  return (
    <section className="culinary-section" data-testid="vendor-items-panel">
      <div className="culinary-section-heading">
        <h2>Vendor items</h2>
        <span>
          {items === undefined ? "Loading…" : `${rows.length} on file`}
        </span>
      </div>
      <p className="max-w-160 text-base text-ink-2">
        What each vendor sells for this ingredient: their item number, the pack
        it comes in and what the pack costs.
      </p>
      {host}
      {items === undefined ? (
        <TableSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>No vendor item on file.</p>
          <span>Add one for each vendor you buy this ingredient from.</span>
        </div>
      ) : (
        <ul className="ingredient-list">
          {rows.map((row) => {
            const perUnit = vendorItemUnitPrice(
              row.packPrice,
              Number(row.packQuantity),
              String(row.packUnit),
              ingredientUnit,
            );
            return (
              <li key={row._id}>
                <strong>{vendorName(row.vendorId)}</strong>
                <span>
                  {[
                    row.description,
                    row.itemCode ? `#${row.itemCode}` : null,
                    `pack of ${String(row.packQuantity)} ${String(row.packUnit)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span>
                  {row.packPrice == null
                    ? "No price on file"
                    : [
                        `${formatMoneyExact(Number(row.packPrice))} a pack`,
                        perUnit == null
                          ? null
                          : `${formatMoneyExact(perUnit)} per ${ingredientUnit}`,
                        row.priceSetAt
                          ? `since ${PRICE_DATE.format(row.priceSetAt)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
                <div className="culinary-line-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() => setEditingId(row._id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() => onRemove(row)}
                  >
                    {busy === `remove:${row._id}` ? "Working…" : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form
        key={editing?._id ?? "new"}
        className="culinary-line-form"
        onSubmit={onSubmit}
      >
        {editing ? (
          <p className="text-sm text-ink-2 sm:col-span-2">
            Changing {vendorName(editing.vendorId)}'s item.
          </p>
        ) : (
          <label className="field-label">
            Vendor
            <select name="vendorId" className="input" required defaultValue="">
              <option value="" disabled>
                Pick a vendor
              </option>
              {liveVendors.map((vendor) => (
                <option key={vendor._id} value={vendor._id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field-label">
          What the vendor calls it
          <input
            name="description"
            className="input"
            required
            defaultValue={editing?.description ?? ""}
          />
        </label>
        <label className="field-label">
          Vendor item number
          <input
            name="itemCode"
            className="input"
            defaultValue={editing?.itemCode ?? ""}
          />
        </label>
        <label className="field-label">
          Pack amount
          <input
            name="packQuantity"
            type="number"
            min={0.0001}
            step="any"
            className="input"
            required
            defaultValue={editing ? Number(editing.packQuantity) : 1}
          />
        </label>
        <label className="field-label">
          Pack unit
          <select
            name="packUnit"
            className="input"
            defaultValue={editing ? String(editing.packUnit) : ingredientUnit}
          >
            {units.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Pack price
          <input
            name="packPrice"
            type="number"
            min={0}
            step="0.01"
            className="input"
            defaultValue={
              editing?.packPrice == null ? "" : Number(editing.packPrice)
            }
          />
        </label>
        <div className="flex gap-2 self-end">
          {editing ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditingId(null)}
            >
              Cancel
            </button>
          ) : null}
          <button className="btn btn-primary" disabled={busy != null}>
            {busy === "save"
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Add vendor item"}
          </button>
        </div>
      </form>
    </section>
  );
}
