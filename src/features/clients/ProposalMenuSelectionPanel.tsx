import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "../../lib/api";
import { useListMenu, useListMenuDish } from "../../lib/manifest-convex-react";
import { useDishesByIds } from "../../lib/useDishesByIds";
import {
  useProposalDishSelections,
  useProposalLineItems,
} from "../../lib/financeScopedQueries";
import { TableSkeleton } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";

interface ProposalMenuSelectionPanelProps {
  proposalId: string;
  guestCount: number;
  /** Selections are editable while the proposal is draft/sent/viewed. */
  editable: boolean;
  /** Price lines change only on a draft. */
  draft: boolean;
  onFailure: (error: unknown) => void;
}

/**
 * Client menu selection during proposal review: browse the operator's
 * published menu catalog and pick dishes. On acceptance with a linked Event
 * the selections cascade into EventDish records (Manifest reaction on
 * ProposalAccepted — see sales/proposal-dish-selection.manifest).
 * On a draft, a pick, a servings change and a removal carry their price line
 * in the same server step (convex/lib/proposalDishPricing.ts).
 */
export function ProposalMenuSelectionPanel({
  proposalId,
  guestCount,
  editable,
  draft,
  onFailure,
}: ProposalMenuSelectionPanelProps) {
  const menus = useListMenu();
  const menuDishes = useListMenuDish();
  // Only this proposal's choices and price lines.
  const selections = useProposalDishSelections(proposalId);
  // Only the published menus' dishes and the ones already picked.
  const publishedIds = new Set(
    (menus ?? [])
      .filter((m) => m.deletedAt == null && String(m.status) === "published")
      .map((m) => String(m._id)),
  );
  const dishes = useDishesByIds(
    menus === undefined || menuDishes === undefined || selections === undefined
      ? undefined
      : [
          ...menuDishes
            .filter(
              (md) =>
                md.deletedAt == null && publishedIds.has(String(md.menuId)),
            )
            .map((md) => String(md.dishId)),
          ...selections.map((row) => String(row.dishId)),
        ],
  );
  const lineItems = useProposalLineItems(proposalId);
  const pickDish = useMutation(api.lib.proposalDishPricing.pickProposalDish);
  const adjustServings = useMutation(
    api.lib.proposalDishPricing.adjustProposalDishServings,
  );
  const removeSelection = useMutation(
    api.lib.proposalDishPricing.removeProposalDish,
  );
  const removeLine = useMutation(
    api.lib.proposalPricing.removeProposalLineAndRecompute,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt();

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

  // A dish added after the price was built (a tasting, a pick here) is on the
  // menu but in no price line, so the client would get it free. A per-guest
  // menu line covers every dish of that menu; a catalog line covers its dish.
  const priceLines = (lineItems ?? []).filter(
    (line) => line.proposalId === proposalId && line.deletedAt == null,
  );
  const coveredDishIds = new Set<string>();
  for (const line of priceLines) {
    const linked = (menuDishes ?? []).find((md) => md._id === line.menuDishId);
    if (linked) coveredDishIds.add(String(linked.dishId));
    const menu = (menus ?? []).find(
      (m) =>
        // "Fall Harvest Dinner (per guest)" from the event build,
        // "(per person)" from a website quote.
        String(line.pricingBasis) === "per_person" &&
        line.description.startsWith(`${m.name} (per `),
    );
    if (menu)
      for (const md of menuDishes ?? [])
        if (md.menuId === menu._id && md.deletedAt == null)
          coveredDishIds.add(String(md.dishId));
  }
  // A custom line named after the dish prices it too.
  const lineNames = new Set(
    priceLines.map((line) => line.description.trim().toLowerCase()),
  );
  const unpriced =
    priceLines.length === 0
      ? []
      : activeSelections.filter(
          (row) =>
            !coveredDishIds.has(String(row.dishId)) &&
            !lineNames.has(dishName(row.dishId).trim().toLowerCase()),
        );

  // A menu's per-guest or base price line, added by a dish pick, left behind
  // after every dish of that menu was taken off: the client would pay for a
  // menu with no food on it. Only lines linked to their menu count, so a
  // typed line or a price built from the event's menu is never flagged.
  const pickedMenuIds = new Set<string>(
    activeSelections.map((row) => String(row.menuId)),
  );
  const leftoverMenuLines = draft
    ? priceLines.filter(
        (line) =>
          line.menuId != null && !pickedMenuIds.has(String(line.menuId)),
      )
    : [];

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
      await pickDish({
        proposalId: proposalId as Id<"proposals">,
        menuDishId: line._id as Id<"menuDishes">,
        quantityServings: guestCount > 0 ? guestCount : 1,
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
        docId: row._id as Id<"proposalDishSelections">,
        version: row.version,
        quantityServings: next,
      });
    });
  };

  return (
    <div className="rounded-sm border border-line bg-inset p-4">
      <p className="eyebrow">Menu</p>
      <p className="mt-1 text-sm text-ink-2">
        Dishes picked from your menu catalog. When the proposal is accepted with
        a linked event, the menu copies onto that event automatically.
      </p>

      {unpriced.length > 0 ? (
        <p role="status" className="mt-3 text-base text-warn">
          Not in the price yet:{" "}
          {unpriced.map((row) => dishName(row.dishId)).join(", ")}. No price
          line covers {unpriced.length === 1 ? "it" : "them"}, so the client
          would get {unpriced.length === 1 ? "it" : "them"} free. Add a line
          under Pricing.
        </p>
      ) : null}

      {host}
      {leftoverMenuLines.length > 0 ? (
        <div role="status" className="mt-3 text-base text-warn">
          <p>
            Still in the price with no dishes picked:{" "}
            {leftoverMenuLines.map((line) => line.description).join(", ")}. The
            client would pay for a menu with no food on it.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {leftoverMenuLines.map((line) => (
              <button
                key={line._id}
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={busy != null}
                onClick={() =>
                  void (async () => {
                    const confirmed = await prompt.askConfirm({
                      title: `Remove ${line.description}`,
                      description: "The proposal total goes down by this line.",
                      confirmLabel: "Remove price",
                      tone: "danger",
                    });
                    if (!confirmed) return;
                    await run(`line:${line._id}`, async () => {
                      await removeLine({
                        docId: line._id as Id<"proposalLineItems">,
                        version: Number(line.version),
                      });
                    });
                  })()
                }
              >
                Remove {line.description}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeSelections.length === 0 ? (
        <p className="mt-3 text-base text-ink-2">No dishes selected yet.</p>
      ) : (
        <table className="data-table phone-cards mt-3">
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
                <td>
                  <strong>{dishName(row.dishId)}</strong>
                </td>
                <td data-label="Menu">{menuName(row.menuId)}</td>
                <td data-label="Servings">
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
                            docId: row._id as Id<"proposalDishSelections">,
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
          <p className="mt-3 text-base text-ink-2">
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
                  <p className="text-base font-semibold text-ink">
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
