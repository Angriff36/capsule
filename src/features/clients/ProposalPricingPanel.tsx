import { formatMoneyExact } from "../../lib/format";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useListProposalLineItem } from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { api, type Id } from "../../lib/api";
import {
  byLineDisplayOrder,
  computeProposalPricing,
  PRICING_BASES,
  PRICING_BASIS_LABELS,
  type PricingBasis,
} from "../../lib/pricing";
import { useCatalogDishes } from "./useCatalogDishes";
import { ProposalTravelFee } from "./ProposalTravelFee";

interface ProposalPricingPanelProps {
  proposalId: string;
  guestCount: number;
  taxAmount: number;
  discountAmount: number;
  /** When true (proposal is a draft), surface Edit/Remove/Add so the persisted
   * lines can be revised through the generated commands + the recompute seam
   * (reviseLine/removeLine were previously dead). */
  editable?: boolean;
  onFailure?: (error: Error) => void;
}

// In-flight line editor buffer. `id` is the line being edited, or "new" for an
// add. Numeric inputs are strings for clean editing (same convention as the
// draft form).
interface LineEditor {
  id: string | "new";
  description: string;
  pricingBasis: PricingBasis;
  unitPrice: string;
  quantity: string;
  unit: string;
  menuDishId: string;
  overrideReason: string;
  equipmentId: string;
}

const emptyEditor = (id: string | "new"): LineEditor => ({
  id,
  description: "",
  pricingBasis: "flat",
  unitPrice: "",
  quantity: "1",
  unit: "",
  menuDishId: "",
  overrideReason: "",
  equipmentId: "",
});

/**
 * Pricing breakdown for a proposal (spec §5.4). Lists the persisted priced
 * lines and recomputes the totals through the SAME central calc the draft form
 * used (src/lib/pricing.ts), so preview/authoring agree and the accepted
 * revision's numbers stay reproducible. Internal cost/margin are never shown
 * (spec §4.2).
 *
 * For a DRAFT proposal (`editable`), the lines can be added/revised/removed
 * in place; each edit runs the generated line command and the authored
 * recompute seam (convex/lib/proposalPricing.ts) so the parent totals + every
 * line amount stay consistent with the central calc.
 */
export function ProposalPricingPanel({
  proposalId,
  guestCount,
  taxAmount,
  discountAmount,
  editable = false,
  onFailure,
}: ProposalPricingPanelProps) {
  const lineItems = useListProposalLineItem();
  // Published-catalog dishes a line can be priced from (spec §5.4 L276).
  const catalog = useCatalogDishes();
  // AC-547: rental/decor items a line can price.
  const rentalItems = useQuery(api.lib.proposalPricing.listRentalItems, {});
  const rentalName = (equipmentId: string | null | undefined) =>
    equipmentId
      ? rentalItems?.find((item) => item.equipmentId === equipmentId)?.name
      : undefined;
  const addLine = useMutation(
    api.lib.proposalPricing.addProposalLineAndRecompute,
  );
  const reviseLine = useMutation(
    api.lib.proposalPricing.reviseProposalLineAndRecompute,
  );
  const removeLine = useMutation(
    api.lib.proposalPricing.removeProposalLineAndRecompute,
  );
  const [editor, setEditor] = useState<LineEditor | null>(null);
  const [busy, setBusy] = useState(false);

  if (lineItems === undefined) return <TableSkeleton rows={2} />;

  const rows = (lineItems ?? [])
    .filter((row) => row.deletedAt == null && row.proposalId === proposalId)
    .sort(byLineDisplayOrder);

  const recomputed = computeProposalPricing({
    lines: rows.map((row) => ({
      pricingBasis: row.pricingBasis as PricingBasis,
      unitPrice: Number(row.unitPrice) || 0,
      quantity: Number(row.quantity) || 0,
    })),
    guestCount,
    discountAmount,
    taxAmount,
  });

  const runEdit = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setEditor(null);
    } catch (e) {
      onFailure?.(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const saveEditor = () => {
    if (!editor) return;
    const description = editor.description.trim();
    if (!description) {
      onFailure?.(new Error("Every pricing line needs a description."));
      return;
    }
    const pricingBasis = editor.pricingBasis;
    const unitPrice = Number(editor.unitPrice) || 0;
    const quantity = Number(editor.quantity) || 0;
    // The server computes the authoritative amount (a percentage line can't be
    // resolved in isolation) and restamps every line via the recompute seam.
    const unit = editor.unit.trim() || undefined;
    const quantityArg = pricingBasis === "per_unit" ? quantity : undefined;
    const menuDishId = (editor.menuDishId || undefined) as
      Id<"menuDishes"> | undefined;
    const overrideReason = editor.overrideReason.trim() || undefined;
    const equipmentId = (editor.equipmentId || undefined) as
      Id<"equipments"> | undefined;

    if (editor.id === "new") {
      const nextSortOrder =
        rows.length === 0 ? 0 : Number(rows[rows.length - 1].sortOrder) + 1;
      void runEdit(() =>
        addLine({
          proposalId: proposalId as Id<"proposals">,
          description,
          pricingBasis,
          unitPrice,
          quantity: quantityArg,
          unit,
          sortOrder: nextSortOrder,
          menuDishId,
          overrideReason,
          equipmentId,
        }),
      );
    } else {
      const target = rows.find((r) => r._id === editor.id);
      void runEdit(() =>
        reviseLine({
          docId: editor.id as Id<"proposalLineItems">,
          version: target ? Number(target.version) : undefined,
          description,
          pricingBasis,
          unitPrice,
          quantity: quantityArg,
          unit,
          sortOrder: target ? Number(target.sortOrder) : undefined,
          menuDishId,
          overrideReason,
          equipmentId,
        }),
      );
    }
  };

  // Link (or unlink) the editor line to a catalog dish (spec §5.4 L276).
  const pickDishForEditor = (menuDishId: string) => {
    if (!editor) return;
    if (!menuDishId) {
      setEditor({ ...editor, menuDishId: "", overrideReason: "" });
      return;
    }
    const dish = catalog.lines.find((c) => c.menuDishId === menuDishId);
    if (!dish) {
      setEditor({ ...editor, menuDishId });
      return;
    }
    setEditor({
      ...editor,
      menuDishId,
      description: dish.name,
      unitPrice:
        dish.sellingPrice == null
          ? editor.unitPrice
          : String(dish.sellingPrice),
      overrideReason: "",
    });
  };
  const editorIsOverride = (() => {
    if (!editor || !editor.menuDishId) return false;
    const dish = catalog.lines.find((c) => c.menuDishId === editor.menuDishId);
    if (!dish || dish.sellingPrice == null) return false;
    return (
      Math.round((Number(editor.unitPrice) + Number.EPSILON) * 100) / 100 !==
      dish.sellingPrice
    );
  })();

  return (
    <div className="rounded-sm border border-line bg-inset p-4">
      <p className="eyebrow">Pricing</p>
      <p className="mt-1 text-sm text-ink-2">
        The priced lines behind this proposal's total.
        {editable
          ? " Edit a line to revise it; changes recompute the totals."
          : ""}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-base text-ink-2">
          No pricing lines on this proposal.
        </p>
      ) : (
        <table className="data-table phone-cards mt-2">
          <thead>
            <tr>
              <th>Description</th>
              <th>Basis</th>
              <th>Price / %</th>
              <th>Qty</th>
              <th>Amount</th>
              {editable ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row._id}>
                <td>
                  <strong>{row.description}</strong>
                  {row.equipmentId ? (
                    <span className="ml-2 text-2xs text-ink-3">
                      Rental
                      {rentalName(row.equipmentId)
                        ? ` · ${rentalName(row.equipmentId)}`
                        : ""}
                    </span>
                  ) : null}
                </td>
                <td data-label="Basis">
                  {PRICING_BASIS_LABELS[row.pricingBasis as PricingBasis]}
                </td>
                <td className="tabular-nums" data-label="Price / %">
                  {row.pricingBasis === "percentage"
                    ? `${Number(row.unitPrice)}%`
                    : formatMoneyExact(Number(row.unitPrice))}
                </td>
                <td className="tabular-nums" data-label="Qty">
                  {row.pricingBasis === "per_unit"
                    ? Number(row.quantity)
                    : row.pricingBasis === "per_person"
                      ? `${guestCount} guests`
                      : "—"}
                </td>
                <td className="tabular-nums" data-label="Amount">
                  {formatMoneyExact(recomputed.lines[index]?.amount ?? 0)}
                </td>
                {editable ? (
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setEditor({
                          id: row._id,
                          description: row.description,
                          pricingBasis: row.pricingBasis as PricingBasis,
                          unitPrice: String(row.unitPrice),
                          quantity: String(row.quantity),
                          unit: row.unit ?? "",
                          menuDishId: row.menuDishId ?? "",
                          overrideReason: row.overrideReason ?? "",
                          equipmentId: row.equipmentId ?? "",
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm ml-1"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runEdit(() =>
                          removeLine({
                            docId: row._id as Id<"proposalLineItems">,
                            version: Number(row.version),
                          }),
                        )
                      }
                    >
                      Remove
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editor ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-sm border border-line bg-panel p-2">
          <label className="flex-1 min-w-[12rem]">
            <span className="field-label">Description</span>
            <input
              className="input"
              value={editor.description}
              autoFocus
              onChange={(e) =>
                setEditor({ ...editor, description: e.target.value })
              }
              placeholder="Line description"
            />
          </label>
          <label>
            <span className="field-label">Basis</span>
            <select
              className="input"
              value={editor.pricingBasis}
              onChange={(e) =>
                setEditor({
                  ...editor,
                  pricingBasis: e.target.value as PricingBasis,
                })
              }
            >
              {PRICING_BASES.map((basis) => (
                <option key={basis} value={basis}>
                  {PRICING_BASIS_LABELS[basis]}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[12rem]">
            <span className="field-label">Catalog dish</span>
            <select
              className="input"
              value={editor.menuDishId}
              disabled={catalog.loading}
              onChange={(e) => pickDishForEditor(e.target.value)}
            >
              <option value="">— custom line —</option>
              {/* Only priced dishes can be linked (the save refuses the
                  rest); price an unpriced dish as a custom line. */}
              {catalog.lines
                .filter(
                  (dish) =>
                    dish.sellingPrice != null ||
                    dish.menuDishId === editor.menuDishId,
                )
                .map((dish) => (
                  <option key={dish.menuDishId} value={dish.menuDishId}>
                    {dish.name}
                    {dish.sellingPrice == null
                      ? ""
                      : ` · ${formatMoneyExact(dish.sellingPrice)}`}
                  </option>
                ))}
            </select>
          </label>
          <label className="min-w-[12rem]">
            <span className="field-label">Rental item</span>
            <select
              className="input"
              value={editor.equipmentId}
              disabled={rentalItems === undefined}
              onChange={(e) => {
                const item = rentalItems?.find(
                  (row) => row.equipmentId === e.target.value,
                );
                setEditor({
                  ...editor,
                  equipmentId: e.target.value,
                  description:
                    item && !editor.description.trim()
                      ? item.name
                      : editor.description,
                });
              }}
            >
              <option value="">— not a rental —</option>
              {(rentalItems ?? []).map((item) => (
                <option key={item.equipmentId} value={item.equipmentId}>
                  {item.name} · {item.category}
                  {item.ownership === "rented" ? " (rented in)" : ""}
                </option>
              ))}
            </select>
          </label>
          {editorIsOverride ? (
            <label className="flex-1 min-w-[16rem]">
              <span className="field-label">Why the price changed</span>
              <input
                className="input"
                value={editor.overrideReason}
                onChange={(e) =>
                  setEditor({ ...editor, overrideReason: e.target.value })
                }
                placeholder="Why this price differs from the catalog"
              />
            </label>
          ) : null}
          <label>
            <span className="field-label">Price / %</span>
            <input
              className="input w-24"
              type="number"
              step="0.01"
              min={0}
              value={editor.unitPrice}
              onChange={(e) =>
                setEditor({ ...editor, unitPrice: e.target.value })
              }
            />
          </label>
          <label>
            <span className="field-label">Qty</span>
            <input
              className="input w-20"
              type="number"
              step="0.01"
              min={0}
              value={editor.quantity}
              disabled={editor.pricingBasis !== "per_unit"}
              onChange={(e) =>
                setEditor({ ...editor, quantity: e.target.value })
              }
            />
          </label>
          <label>
            <span className="field-label">Unit</span>
            <input
              className="input w-20"
              value={editor.unit}
              placeholder="tray, hr"
              disabled={editor.pricingBasis !== "per_unit"}
              onChange={(e) => setEditor({ ...editor, unit: e.target.value })}
            />
          </label>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={busy}
            onClick={saveEditor}
          >
            {editor.id === "new" ? "Add" : "Save"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={busy}
            onClick={() => setEditor(null)}
          >
            Cancel
          </button>
        </div>
      ) : editable ? (
        <button
          className="btn btn-ghost btn-sm mt-2"
          type="button"
          disabled={busy}
          onClick={() => setEditor(emptyEditor("new"))}
        >
          Add line
        </button>
      ) : null}

      {editable ? (
        <ProposalTravelFee proposalId={proposalId} onFailure={onFailure} />
      ) : null}

      <p className="mt-2 text-base text-ink-2">
        Subtotal{" "}
        <span className="tabular-nums">
          {formatMoneyExact(recomputed.subtotal)}
        </span>{" "}
        · Tax{" "}
        <span className="tabular-nums">
          {formatMoneyExact(recomputed.taxAmount)}
        </span>{" "}
        · Discount{" "}
        <span className="tabular-nums">
          {formatMoneyExact(recomputed.discountAmount)}
        </span>{" "}
        · <span className="font-semibold text-ink">Total </span>
        <span className="tabular-nums font-semibold text-ink">
          {formatMoneyExact(recomputed.total)}
        </span>
      </p>
    </div>
  );
}
