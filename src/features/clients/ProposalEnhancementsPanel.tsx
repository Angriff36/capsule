import { useState } from "react";
import {
  useCreateProposalEnhancement,
  useListProposalEnhancement,
  useProposalEnhancementWithdraw,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { formatMoneyExact } from "../../lib/format";
import type { Id } from "../../lib/api";

interface ProposalEnhancementsPanelProps {
  proposalId: string;
  /** When true (proposal is a draft), surface Add/Remove for optional upgrades. */
  editable?: boolean;
  onFailure?: (error: Error) => void;
}

interface EnhancementEditor {
  name: string;
  price: string;
  description: string;
}

const emptyEditor = (): EnhancementEditor => ({
  name: "",
  price: "",
  description: "",
});

/**
 * Optional upgrades offered on a proposal. Listed separately from priced
 * lines so clients can see add-on choices without them affecting the base
 * total. Editable only while the proposal is a draft.
 */
export function ProposalEnhancementsPanel({
  proposalId,
  editable = false,
  onFailure,
}: ProposalEnhancementsPanelProps) {
  const enhancements = useListProposalEnhancement();
  const createEnhancement = useCreateProposalEnhancement();
  const withdrawEnhancement = useProposalEnhancementWithdraw();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EnhancementEditor>(emptyEditor);
  const [busy, setBusy] = useState(false);

  if (enhancements === undefined) return <TableSkeleton rows={2} />;

  const rows = (enhancements ?? [])
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.addedAt != null &&
        row.proposalId === proposalId,
    )
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));

  const runEdit = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setEditorOpen(false);
      setEditor(emptyEditor());
    } catch (e) {
      onFailure?.(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const saveEditor = () => {
    const name = editor.name.trim();
    if (!name) {
      onFailure?.(new Error("Every enhancement needs a name."));
      return;
    }
    const price = Number(editor.price);
    if (!Number.isFinite(price) || price < 0) {
      onFailure?.(new Error("Enhancement price must be zero or greater."));
      return;
    }
    const description = editor.description.trim() || undefined;
    const nextSortOrder =
      rows.length === 0 ? 0 : Number(rows[rows.length - 1].sortOrder) + 1;
    void runEdit(() =>
      createEnhancement({
        proposalId: proposalId as Id<"proposals">,
        name,
        price,
        description,
        sortOrder: nextSortOrder,
      }),
    );
  };

  return (
    <div className="rounded-sm border border-line bg-inset p-4">
      <p className="eyebrow">Optional enhancements</p>
      <p className="mt-1 text-[12px] text-ink-2">
        Add-on upgrades the client may choose separately from the base proposal
        total.
        {editable ? " Add or remove items while the proposal is a draft." : ""}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-2">
          No optional enhancements on this proposal.
        </p>
      ) : (
        <table className="data-table mt-2">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Price</th>
              {editable ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id}>
                <td>{row.name}</td>
                <td className="text-ink-2">{row.description ?? "—"}</td>
                <td className="tabular-nums">
                  {formatMoneyExact(Number(row.price) || 0)}
                </td>
                {editable ? (
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runEdit(() =>
                          withdrawEnhancement({
                            docId: row._id as Id<"proposalEnhancements">,
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

      {editorOpen ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-sm border border-line bg-panel p-2">
          <label className="flex-1 min-w-[12rem]">
            <span className="field-label">Name</span>
            <input
              className="input"
              value={editor.name}
              autoFocus
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              placeholder="Enhancement name"
            />
          </label>
          <label>
            <span className="field-label">Price</span>
            <input
              className="input w-28"
              type="number"
              step="0.01"
              min={0}
              value={editor.price}
              onChange={(e) => setEditor({ ...editor, price: e.target.value })}
            />
          </label>
          <label className="flex-1 min-w-[16rem]">
            <span className="field-label">Description (optional)</span>
            <input
              className="input"
              value={editor.description}
              onChange={(e) =>
                setEditor({ ...editor, description: e.target.value })
              }
              placeholder="Short description for the client"
            />
          </label>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={busy}
            onClick={saveEditor}
          >
            Add
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={busy}
            onClick={() => {
              setEditorOpen(false);
              setEditor(emptyEditor());
            }}
          >
            Cancel
          </button>
        </div>
      ) : editable ? (
        <button
          className="btn btn-ghost btn-sm mt-2"
          type="button"
          disabled={busy}
          onClick={() => setEditorOpen(true)}
        >
          Add enhancement
        </button>
      ) : null}
    </div>
  );
}
