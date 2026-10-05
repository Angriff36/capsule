import { useState } from "react";
import {
  useCreateTastingDish,
  useListMenu,
  useListMenuDish,
  useListTastingDish,
  useTastingCancel,
  useTastingMarkTasted,
  useTastingDishRecordFeedback,
} from "../../lib/manifest-convex-react";
import { useWholeDishList } from "../../lib/useDishesByIds";
import { useApplyTastingSelections } from "../../lib/useTastings";
import type { Id } from "../../lib/api";
import { TableSkeleton } from "../../ui/primitives";
import { TastingPrepList } from "./TastingPrepList";

type Decision = "pending" | "approved" | "maybe" | "rejected";

const DECISIONS: { value: Decision; label: string }[] = [
  { value: "approved", label: "Approved" },
  { value: "maybe", label: "Maybe" },
  { value: "rejected", label: "No" },
  { value: "pending", label: "Not decided" },
];

/** Proposal states whose menu can still change (see proposal-dish-selection.manifest). */
const OPEN_PROPOSAL = new Set(["draft", "sent", "viewed"]);

interface TastingDetailProps {
  tasting: {
    _id: string;
    version: number;
    status: string;
    guestCount: number;
    leadId?: string | null;
    proposalId?: string | null;
    location?: string | null;
    attendeeNames?: (string | null)[] | null;
    notes?: string | null;
  };
  proposals: ReadonlyArray<{ _id: string; title?: string; status: string }>;
  leads: ReadonlyArray<{ _id: string; proposalId?: string | null }>;
  onFailure: (error: unknown) => void;
}

export function TastingDetail({
  tasting,
  proposals,
  leads,
  onFailure,
}: TastingDetailProps) {
  const menus = useListMenu();
  const menuDishes = useListMenuDish();
  const dishes = useWholeDishList();
  const tastingDishes = useListTastingDish();
  const addDish = useCreateTastingDish();
  const recordFeedback = useTastingDishRecordFeedback();
  const complete = useTastingMarkTasted();
  const cancel = useTastingCancel();
  const apply = useApplyTastingSelections();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const leadProposalId = leads.find(
    (lead) => lead._id === tasting.leadId,
  )?.proposalId;
  const [targetProposalId, setTargetProposalId] = useState(
    tasting.proposalId ?? leadProposalId ?? "",
  );

  if (
    menus === undefined ||
    menuDishes === undefined ||
    dishes === undefined ||
    tastingDishes === undefined
  )
    return <TableSkeleton rows={2} />;

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const dishName = (dishId: string) =>
    String(dishes.find((d) => d._id === dishId)?.name ?? "Unknown dish");
  const status = String(tasting.status);
  const canPickDishes = status === "scheduled";
  const canRecord = status === "scheduled" || status === "completed";
  const rows = tastingDishes
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.addedAt != null &&
        row.tastingId === tasting._id,
    )
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  const pickedDishIds = new Set(rows.map((row) => row.dishId));
  const approvedCount = rows.filter(
    (row) => row.decision === "approved",
  ).length;
  const publishedMenus = menus.filter(
    (menu) => menu.deletedAt == null && String(menu.status) === "published",
  );
  const openProposals = proposals.filter((proposal) =>
    OPEN_PROPOSAL.has(String(proposal.status)),
  );
  const defaultPortions = Math.max(1, Number(tasting.guestCount) || 1);

  return (
    <section
      className="mt-4 rounded-sm border border-line bg-inset p-4"
      aria-label="Tasting details"
    >
      <div className="supply-row-actions">
        <p className="eyebrow">Tasting</p>
        {status === "scheduled" ? (
          <>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={busy != null}
              onClick={() =>
                void run("complete", async () => {
                  await complete({
                    docId: tasting._id,
                    version: tasting.version,
                  });
                })
              }
            >
              Mark tasted
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled={busy != null}
              onClick={() =>
                void run("cancel", async () => {
                  await cancel({
                    docId: tasting._id,
                    version: tasting.version,
                  });
                })
              }
            >
              Cancel tasting
            </button>
          </>
        ) : null}
      </div>
      {tasting.location || tasting.attendeeNames?.length || tasting.notes ? (
        <p className="mt-2 text-sm text-ink-2">
          {[
            tasting.location,
            (tasting.attendeeNames ?? []).filter(Boolean).join(", "),
            tasting.notes,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      <p className="eyebrow mt-4">Sample dishes and client feedback</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-base text-ink-2">No dishes picked yet.</p>
      ) : (
        <table className="data-table phone-cards mt-2">
          <thead>
            <tr>
              <th>Dish</th>
              <th>Portions</th>
              <th>Decision</th>
              <th>Rating</th>
              <th>Client comment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const save = (
                changes: Partial<{
                  decision: Decision;
                  clientRating: number | undefined;
                  clientFeedback: string | undefined;
                }>,
              ) =>
                void run(`feedback:${row._id}`, async () => {
                  await recordFeedback({
                    docId: row._id,
                    version: row.version,
                    decision: row.decision,
                    clientRating: row.clientRating ?? undefined,
                    clientFeedback: row.clientFeedback ?? undefined,
                    ...changes,
                  });
                });
              return (
                <tr key={row._id}>
                  <td>
                    <strong>{dishName(row.dishId)}</strong>
                    {row.appliedToProposalId ? (
                      <span className="text-2xs text-ink-3">
                        {" "}
                        · on proposal
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Portions">{Number(row.portionCount)}</td>
                  <td data-label="Decision">
                    <select
                      className="input"
                      aria-label={`Decision for ${dishName(row.dishId)}`}
                      value={String(row.decision)}
                      disabled={!canRecord || busy != null}
                      onChange={(event) =>
                        save({ decision: event.target.value as Decision })
                      }
                    >
                      {DECISIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Rating">
                    <select
                      className="input"
                      aria-label={`Rating for ${dishName(row.dishId)}`}
                      value={
                        row.clientRating == null ? "" : String(row.clientRating)
                      }
                      disabled={!canRecord || busy != null}
                      onChange={(event) =>
                        save({
                          clientRating: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        })
                      }
                    >
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} / 5
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Client comment">
                    <input
                      key={`${row._id}:${row.clientFeedback ?? ""}`}
                      className="input"
                      aria-label={`Client comment for ${dishName(row.dishId)}`}
                      defaultValue={row.clientFeedback ?? ""}
                      disabled={!canRecord || busy != null}
                      onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next === (row.clientFeedback ?? "")) return;
                        save({ clientFeedback: next || undefined });
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {canPickDishes ? (
        publishedMenus.length === 0 ? (
          <p className="mt-3 text-base text-ink-2">
            No published menus in the catalog yet. Publish a menu in Kitchen to
            offer dishes for tastings.
          </p>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-ink-2">
              Each dish is added with {defaultPortions} tasting{" "}
              {defaultPortions === 1 ? "portion" : "portions"} (one per guest).
            </p>
            {publishedMenus.map((menu) => {
              const lines = menuDishes
                .filter(
                  (line) =>
                    line.deletedAt == null &&
                    line.addedAt != null &&
                    line.menuId === menu._id &&
                    String(
                      dishes.find((d) => d._id === line.dishId)?.status,
                    ) === "active",
                )
                .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
              if (lines.length === 0) return null;
              return (
                <div key={menu._id} className="mt-2">
                  <p className="text-base font-semibold text-ink">
                    {String(menu.name)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {lines.map((line) => {
                      const picked = pickedDishIds.has(line.dishId);
                      return (
                        <button
                          key={line._id}
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={busy != null || picked}
                          onClick={() =>
                            void run(`add:${line._id}`, async () => {
                              await addDish({
                                tastingId: tasting._id,
                                menuId: line.menuId,
                                dishId: line.dishId,
                                portionCount: defaultPortions,
                                sortOrder: rows.length,
                              });
                            })
                          }
                        >
                          {picked
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

      <TastingPrepList tastingId={tasting._id} />

      {status !== "cancelled" ? (
        <div className="mt-4">
          <p className="eyebrow">Final selections</p>
          {openProposals.length === 0 ? (
            <p className="mt-2 text-base text-ink-2">
              Make a proposal for this client first, then add the approved
              dishes to its menu.
            </p>
          ) : (
            <div className="supply-row-actions mt-2">
              <select
                className="input"
                aria-label="Proposal to receive the approved dishes"
                value={targetProposalId}
                onChange={(event) => setTargetProposalId(event.target.value)}
              >
                <option value="">Choose a proposal</option>
                {openProposals.map((proposal) => (
                  <option key={proposal._id} value={proposal._id}>
                    {String(proposal.title || "Untitled proposal")}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={
                  busy != null || !targetProposalId || approvedCount === 0
                }
                onClick={() =>
                  void run("apply", async () => {
                    const result = await apply({
                      tastingId: tasting._id as Id<"tastings">,
                      proposalId: targetProposalId as Id<"proposals">,
                    });
                    setNotice(
                      result.added === 0
                        ? "All approved dishes were already on the proposal menu."
                        : `Added ${result.added} approved ${result.added === 1 ? "dish" : "dishes"} to the proposal menu.`,
                    );
                  })
                }
              >
                Add {approvedCount} approved{" "}
                {approvedCount === 1 ? "dish" : "dishes"} to proposal
              </button>
            </div>
          )}
          {notice ? (
            <p className="mt-2 text-base text-ink-2" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
