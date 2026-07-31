import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateEventDish,
  useEventDishAdjustServings,
  useEventDishRemove,
  useListDish,
  useListEventDish,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { AllergenIconRow } from "../kitchen/AllergenIconRow";
import { CulinaryRecordPicker } from "../kitchen/CulinaryRecordPicker";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { dishPath } from "../kitchen/kitchenRoutes";
import { useEventMenuSync } from "../kitchen/useEventMenuSync";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import { ComponentStockSuggestions } from "./ComponentStockSuggestions";

type Props = {
  eventId: string;
  expectedHeadcount: number;
};

export function EventMenuTab({ eventId, expectedHeadcount }: Props) {
  const dishes = useListDish();
  const eventDishes = useListEventDish();
  const createEventDish = useCreateEventDish();
  const adjustServings = useEventDishAdjustServings();
  const removeDish = useEventDishRemove();
  const { ready: prepSyncReady, syncStockForEvent } = useEventMenuSync();
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const selections = useMemo(
    () =>
      (eventDishes ?? [])
        .filter((item) => item.deletedAt == null && item.eventId === eventId)
        .sort((a, b) =>
          String(a.course ?? "").localeCompare(String(b.course ?? "")),
        ),
    [eventDishes, eventId],
  );
  const existingDishIds = selections.map((row) => row.dishId);

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4" data-testid="event-menu-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg">Event menu</h2>
          <p className="text-base text-ink-2">
            Customer-facing dishes for this event — images, allergens, and
            servings.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy != null}
          onClick={() => setShowPicker((value) => !value)}
        >
          {showPicker ? "Hide picker" : "Add dish"}
        </button>
      </div>
      {failure ? <FailureBanner failure={failure} /> : null}
      {host}
      <ComponentStockSuggestions />
      {showPicker ? (
        <CulinaryRecordPicker
          kind="dish"
          records={(dishes ?? []).map((dish) => ({
            _id: dish._id,
            name: dish.name,
            description: dish.description,
            allergenSummary: dish.allergenSummary,
            primaryImageStorageId: dish.primaryImageStorageId,
            editionNumber: dish.editionNumber,
            deletedAt: dish.deletedAt,
            status: String(dish.status),
            mergedIntoDishId: dish.mergedIntoDishId,
            canonicalDishId: dish.canonicalDishId,
          }))}
          excludeIds={existingDishIds}
          onSelect={(dishId) =>
            void run("add", async () => {
              const servings = Math.max(1, expectedHeadcount || 1);
              await createEventDish({
                eventId,
                dishId,
                quantityServings: servings,
                headcountOverride: 0,
              });
              // Prep tasks are generated server-side by the EventDishAdded
              // reaction; only stock needs reconciling from the client.
              if (prepSyncReady) {
                await syncStockForEvent(eventId);
              }
              setShowPicker(false);
            })
          }
          onCreateNew={() =>
            setFailure(
              classifyCommandFailure(
                new Error(
                  "Create dishes in Kitchen → Dishes, then add them here.",
                ),
              ),
            )
          }
        />
      ) : null}

      {selections.length === 0 ? (
        <div className="document-empty">
          <p>
            No dishes on this event yet. Add a dish to build the menu guests
            will see.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {selections.map((selection) => {
            const dish = dishes?.find((row) => row._id === selection.dishId);
            const estimated =
              Number((selection as { estimatedCost?: number }).estimatedCost) ||
              0;
            return (
              <li
                key={selection._id}
                className="flex flex-wrap gap-4 border border-line bg-panel p-3"
              >
                <DishPrimaryImage
                  storageId={dish?.primaryImageStorageId}
                  alt={dish?.name ?? "Dish"}
                  size="thumb"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={dish ? dishPath(dish._id) : "#"}
                      className="text-lg font-semibold hover:underline"
                    >
                      {dish?.name ?? "Unknown dish"}
                    </Link>
                    <AllergenIconRow codes={dish?.allergenSummary} />
                  </div>
                  <p className="text-base text-ink-2">
                    {dish?.description || "No description yet."}
                  </p>
                  <p className="font-mono text-xs text-ink-3">
                    {selection.course || "Uncategorized"}
                    {" · "}
                    {selection.quantityServings} servings
                    {estimated > 0
                      ? ` · est. ${formatMoneyExact(estimated)}`
                      : ""}
                  </p>
                </div>
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
                    formEvent.preventDefault();
                    const data = new FormData(formEvent.currentTarget);
                    const quantityServings = Number(
                      data.get("quantityServings"),
                    );
                    if (
                      !Number.isFinite(quantityServings) ||
                      quantityServings < 0
                    )
                      return;
                    void run(`servings:${selection._id}`, () =>
                      adjustServings({
                        docId: selection._id,
                        version: selection.version,
                        quantityServings,
                      }),
                    );
                  }}
                >
                  <label className="field-label">
                    Servings
                    <input
                      className="field-input w-24"
                      name="quantityServings"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={selection.quantityServings}
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn-ghost"
                    disabled={busy != null}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy != null}
                    onClick={() => {
                      void (async () => {
                        const reason = await prompt.askReason({
                          ...ReasonCopy.removeLine,
                          title: "Remove event dish",
                          description:
                            "Record why this dish is leaving the event menu.",
                          confirmLabel: "Remove dish",
                          tone: "danger",
                        });
                        if (!reason) return;
                        void run(`remove:${selection._id}`, () =>
                          removeDish({
                            docId: selection._id,
                            version: selection.version,
                            reason,
                          }),
                        );
                      })();
                    }}
                  >
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
