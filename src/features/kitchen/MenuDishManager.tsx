import { useMemo, useState } from "react";
import {
  useCreateMenuDish,
  useMenuDishRemove,
  useMenuDishUpdateDetails,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { AllergenIconRow } from "./AllergenIconRow";
import { CulinaryRecordPicker, type PickerDish } from "./CulinaryRecordPicker";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";

type MenuDishRow = {
  _id: string;
  version: number;
  dishId: string;
  sortOrder: number;
  sellingPrice?: number | null;
  course?: string | null;
  deletedAt?: number | null;
};

type Props = {
  menuId: string;
  menuStatus: string;
  menuDishes: readonly MenuDishRow[];
  dishes: readonly PickerDish[];
  onError: (error: unknown) => void;
};

/** Add / reorder / remove dishes on a Menu without leaving Menu detail. */
export function MenuDishManager({
  menuId,
  menuStatus,
  menuDishes,
  dishes,
  onError,
}: Props) {
  const createMenuDish = useCreateMenuDish();
  const removeMenuDish = useMenuDishRemove();
  const updateDetails = useMenuDishUpdateDetails();
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const lines = useMemo(
    () =>
      menuDishes
        .filter((row) => row.deletedAt == null)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [menuDishes],
  );
  const existingDishIds = lines.map((line) => line.dishId);
  const canEdit = menuStatus === "draft";

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Dishes on this menu</h2>
        <span>{lines.length} dishes</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canEdit || busy != null}
          onClick={() => setShowPicker((value) => !value)}
        >
          {showPicker ? "Hide dish picker" : "Add dish"}
        </button>
        {!canEdit ? (
          <p className="text-[12px] text-ink-3">
            Menu must be in draft to add or reorder dishes.
          </p>
        ) : null}
      </div>
      {showPicker && canEdit ? (
        <div className="mb-4">
          <CulinaryRecordPicker
            kind="dish"
            records={dishes}
            excludeIds={existingDishIds}
            onSelect={(dishId) =>
              void run("add", async () => {
                await createMenuDish({
                  menuId,
                  dishId,
                  sortOrder: lines.length,
                });
                setShowPicker(false);
              })
            }
            onCreateNew={() => {
              onError(
                new Error(
                  "Create the dish from the Dishes catalog first, then add it here.",
                ),
              );
            }}
          />
        </div>
      ) : null}
      {lines.length === 0 ? (
        <div className="document-empty">
          <p>No dishes on this menu yet. Use Add dish to search the catalog.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {lines.map((line, index) => {
            const dish = dishes.find((row) => row._id === line.dishId);
            return (
              <li
                key={line._id}
                className="flex flex-wrap items-center gap-3 px-3 py-3"
              >
                <DishPrimaryImage
                  storageId={dish?.primaryImageStorageId}
                  alt={dish?.name ?? "Dish"}
                  size="thumb"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{dish?.name ?? "Unknown dish"}</p>
                  <p className="text-[12px] text-ink-3">
                    Edition {dish?.editionNumber ?? 1}
                    {line.course ? ` · ${line.course}` : ""}
                    {line.sellingPrice != null
                      ? ` · ${formatMoneyExact(Number(line.sellingPrice))}`
                      : ""}
                  </p>
                  {dish?.description ? (
                    <p className="text-[12px] text-ink-2 line-clamp-2">
                      {dish.description}
                    </p>
                  ) : null}
                  <AllergenIconRow
                    codes={dish?.allergenSummary}
                    className="mt-1"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!canEdit || busy != null || index === 0}
                    onClick={() =>
                      void run(`up:${line._id}`, async () => {
                        const prev = lines[index - 1];
                        if (!prev) return;
                        await updateDetails({
                          docId: line._id,
                          version: line.version,
                          sortOrder: prev.sortOrder,
                        });
                        await updateDetails({
                          docId: prev._id,
                          version: prev.version,
                          sortOrder: line.sortOrder,
                        });
                      })
                    }
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={
                      !canEdit || busy != null || index === lines.length - 1
                    }
                    onClick={() =>
                      void run(`down:${line._id}`, async () => {
                        const next = lines[index + 1];
                        if (!next) return;
                        await updateDetails({
                          docId: line._id,
                          version: line.version,
                          sortOrder: next.sortOrder,
                        });
                        await updateDetails({
                          docId: next._id,
                          version: next.version,
                          sortOrder: line.sortOrder,
                        });
                      })
                    }
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy != null}
                    onClick={() => {
                      const reason = window
                        .prompt("Reason for removing this dish")
                        ?.trim();
                      if (!reason) return;
                      void run(`remove:${line._id}`, () =>
                        removeMenuDish({
                          docId: line._id,
                          version: line.version,
                          reason,
                        }),
                      );
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
