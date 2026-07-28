import { useState } from "react";
import {
  useCreateProposalDishSelection,
  useListDish,
  useListMenu,
  useListMenuDish,
  useListProposalDishSelection,
  useProposalDishSelectionAdjustServings,
  useProposalDishSelectionRemove,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";

interface ProposalMenuSelectionPanelProps {
  proposalId: string;
  guestCount: number;
  /** Selections are editable while the proposal is draft/sent/viewed. */
  editable: boolean;
  onFailure: (error: unknown) => void;
}

/**
 * Client menu selection during proposal review: browse the operator's
 * published menu catalog and pick dishes. On acceptance with a linked Event
 * the selections cascade into EventDish records (Manifest reaction on
 * ProposalAccepted — see sales/proposal-dish-selection.manifest).
 */
export function ProposalMenuSelectionPanel({
  proposalId,
  guestCount,
  editable,
  onFailure,
}: ProposalMenuSelectionPanelProps) {
  const menus = useListMenu();
  const menuDishes = useListMenuDish();
  const dishes = useListDish();
  const selections = useListProposalDishSelection();
  const createSelection = useCreateProposalDishSelection();
  const adjustServings = useProposalDishSelectionAdjustServings();
  const removeSelection = useProposalDishSelectionRemove();
  const [busy, setBusy] = useState<string | null>(null);

  const loading =
    menus === undefined ||
    menuDishes === undefined ||
    dishes === undefined ||
    selections === undefined;

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <TableSkeleton rows={2} />;

  const dishName = (dishId: string) =>
    String(
      (dishes ?? []).find((d) => d._id === dishId)?.name ?? "Unknown dish",
    );
  const menuName = (menuId: string) =>
    String((menus ?? []).find((m) => m._id === menuId)?.name ?? "Unknown menu");

  const activeSelections = (selections ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.selectedAt != null &&
      row.proposalId === proposalId,
  );
  const selectedDishIds = new Set(activeSelections.map((row) => row.dishId));

  const publishedMenus = (menus ?? []).filter(
    (row) => row.deletedAt == null && String(row.status) === "published",
  );
  const catalogLines = (menuDishes ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.addedAt != null &&
      publishedMenus.some((menu) => menu._id === row.menuId) &&
      String((dishes ?? []).find((d) => d._id === row.dishId)?.status ?? "") ===
        "active",
  );

  const addSelection = (line: (typeof catalogLines)[number]) => {
    void run(`add:${line._id}`, async () => {
      await createSelection({
        proposalId,
        menuId: line.menuId,
        dishId: line.dishId,
        quantityServings: guestCount > 0 ? guestCount : 1,
        course: line.course ?? undefined,
        serviceStyle: line.serviceStyle ?? undefined,
      });
    });
  };

  const commitServings = (
    row: { _id: string; version: number; quantityServings: number },
    raw: string,
  ) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next <= 0) return;
    if (next === Number(row.quantityServings)) return;
    void run(`adjust:${row._id}`, async () => {
      await adjustServings({
        docId: row._id,
        version: row.version,
        quantityServings: next,
      });
    });
  };

  return (
    <div className="rounded-sm border border-line bg-inset p-4">
      <p className="eyebrow">Menu</p>
      <p className="mt-1 text-[12px] text-ink-2">
        Dishes picked from your menu catalog. When the proposal is accepted with
        a linked event, the menu copies onto that event automatically.
      </p>

      {activeSelections.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-2">No dishes selected yet.</p>
      ) : (
        <table className="data-table mt-3">
          <thead>
            <tr>
              <th>Dish</th>
              <th>Menu</th>
              <th>Servings</th>
              {editable ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {activeSelections.map((row) => (
              <tr key={row._id}>
                <td>{dishName(row.dishId)}</td>
                <td>{menuName(row.menuId)}</td>
                <td>
                  {editable ? (
                    <input
                      key={`${row._id}:${row.quantityServings}`}
                      type="number"
                      min={1}
                      className="input w-24"
                      defaultValue={Number(row.quantityServings)}
                      disabled={busy != null}
                      aria-label={`Servings for ${dishName(row.dishId)}`}
                      onBlur={(event) =>
                        commitServings(
                          {
                            _id: row._id,
                            version: row.version,
                            quantityServings: Number(row.quantityServings),
                          },
                          event.target.value,
                        )
                      }
                    />
                  ) : (
                    Number(row.quantityServings)
                  )}
                </td>
                {editable ? (
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={busy != null}
                      onClick={() =>
                        void run(`remove:${row._id}`, async () => {
                          await removeSelection({
                            docId: row._id,
                            version: row.version,
                          });
                        })
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

      {editable ? (
        publishedMenus.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-2">
            No published menus in the catalog yet. Publish a menu in Kitchen to
            offer dishes here.
          </p>
        ) : (
          <div className="mt-4">
            <p className="eyebrow">Published catalog</p>
            {publishedMenus.map((menu) => {
              const lines = catalogLines
                .filter((line) => line.menuId === menu._id)
                .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
              if (lines.length === 0) return null;
              return (
                <div key={menu._id} className="mt-2">
                  <p className="text-[13px] font-semibold text-ink">
                    {String(menu.name)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {lines.map((line) => {
                      const alreadySelected = selectedDishIds.has(line.dishId);
                      return (
                        <button
                          key={line._id}
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={busy != null || alreadySelected}
                          onClick={() => addSelection(line)}
                        >
                          {alreadySelected
                            ? `${dishName(line.dishId)} ✓`
                            : `Add ${dishName(line.dishId)}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}
