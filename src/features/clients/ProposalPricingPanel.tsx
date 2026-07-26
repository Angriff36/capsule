import { useState } from "react";
import { useMutation } from "convex/react";
import { useListProposalLineItem } from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { api, type Id } from "../../lib/api";
import {
  computeProposalPricing,
  PRICING_BASES,
  PRICING_BASIS_LABELS,
  type PricingBasis,
} from "../../lib/pricing";

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
}

const emptyEditor = (id: string | "new"): LineEditor => ({
  id,
  description: "",
  pricingBasis: "flat",
  unitPrice: "",
  quantity: "1",
  unit: "",
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
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));

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
        }),
      );
    }
  };

  return (
    <div className="rounded-sm border border-line bg-inset p-4">
      <p className="eyebrow">Pricing lines (spec §5.4)</p>
      <p className="mt-1 text-[12px] text-ink-2">
        Totals recomputed by the shared pricing engine — the same path the draft
        form and the published revision use.
        {editable
          ? " Edit a line to revise it; changes recompute the totals."
          : ""}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-2">
          No pricing lines on this proposal.
        </p>
      ) : (
        <table className="data-table mt-2">
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
                <td>{row.description}</td>
                <td>
                  {PRICING_BASIS_LABELS[row.pricingBasis as PricingBasis]}
                </td>
                <td className="tabular-nums">
                  {Number(row.unitPrice).toFixed(2)}
                </td>
                <td className="tabular-nums">
                  {row.pricingBasis === "per_unit" ? Number(row.quantity) : "—"}
                </td>
                <td className="tabular-nums">
                  {(recomputed.lines[index]?.amount ?? 0).toFixed(2)}
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
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-sm border border-line bg-surface p-2">
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

      <p className="mt-2 text-[13px] text-ink-2">
        Subtotal{" "}
        <span className="tabular-nums">{recomputed.subtotal.toFixed(2)}</span> ·
        Tax{" "}
        <span className="tabular-nums">{recomputed.taxAmount.toFixed(2)}</span>{" "}
        · Discount{" "}
        <span className="tabular-nums">
          {recomputed.discountAmount.toFixed(2)}
        </span>{" "}
        · <span className="font-semibold text-ink">Total </span>
        <span className="tabular-nums font-semibold text-ink">
          {recomputed.total.toFixed(2)}
        </span>
      </p>
    </div>
  );
}
