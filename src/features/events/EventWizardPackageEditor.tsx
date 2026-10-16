import { useState } from "react";
import {
  cateringBooks,
  cateringPackages,
  cateringRecipes,
  cateringSource,
  defaultCateringSelections,
  type CateringSelection,
} from "../../data/cateringPackages";
import type { EventWizardDraft } from "./eventCreateWizardModel";

/**
 * Pick a catering package from the menu books on the new-event menu step, then
 * change its dishes, servings, kitchen notes and price per guest. It is added
 * to the event when the event is created.
 */
export function WizardPackageEditor({
  draft,
  update,
}: {
  draft: EventWizardDraft;
  update: (changes: Partial<EventWizardDraft>) => void;
}) {
  const chosen = draft.cateringPackage;
  const pack = cateringPackages.find((entry) => entry.id === chosen?.packageId);
  const [book, setBook] = useState(pack?.book ?? "wedding");
  const locked = !!draft.commitProgress.cateringPackage;
  const guests = Number(draft.expectedHeadcount);
  const hasGuests = Number.isSafeInteger(guests) && guests > 0;
  const selections = chosen?.selections ?? [];
  const setSelections = (next: CateringSelection[]) =>
    chosen && update({ cateringPackage: { ...chosen, selections: next } });

  function choose(id: string) {
    const next = cateringPackages.find((entry) => entry.id === id);
    update({
      cateringPackage: next
        ? {
            packageId: next.id,
            selections: hasGuests
              ? defaultCateringSelections(next, guests)
              : [],
            pricePerGuest: chosen?.pricePerGuest ?? "",
          }
        : undefined,
    });
  }

  // Split groups share the guests across the picked dishes.
  function toggle(recipeId: string, groupIndex: number) {
    if (!pack || !hasGuests) return;
    const group = pack.groups[groupIndex];
    const next = selections.some((line) => line.recipeId === recipeId)
      ? selections.filter((line) => line.recipeId !== recipeId)
      : [...selections, { recipeId, servings: guests, notes: "" }];
    if (!group.splitServings) return setSelections(next);
    const sharing = next.filter((line) =>
      group.recipeIds.includes(line.recipeId),
    );
    setSelections(
      next.map((line) => {
        const index = sharing.indexOf(line);
        return index < 0
          ? line
          : {
              ...line,
              servings: Math.max(
                1,
                Math.floor(guests / sharing.length) +
                  (index < guests % sharing.length ? 1 : 0),
              ),
            };
      }),
    );
  }

  const changeLine = (recipeId: string, changes: Partial<CateringSelection>) =>
    setSelections(
      selections.map((line) =>
        line.recipeId === recipeId ? { ...line, ...changes } : line,
      ),
    );

  return (
    <div
      className="space-y-3 border-t border-line pt-3"
      data-testid="wizard-package"
    >
      <div>
        <p className="text-sm font-semibold text-ink">Catering package</p>
        <p className="text-sm text-ink-3">
          Start from a package in the menu books, then change its dishes,
          servings and price. It is added to the event when you create it.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="field-label">
          Menu book
          <select
            className="field-input"
            value={book}
            disabled={locked}
            onChange={(event) => {
              setBook(event.target.value);
              choose("");
            }}
          >
            {Object.entries(cateringBooks).map(([id, name]) => (
              <option key={id} value={id}>
                {name.replace(/\.pdf$/, "")}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Package
          <select
            className="field-input"
            value={chosen?.packageId ?? ""}
            disabled={locked}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="">No package</option>
            {cateringPackages
              .filter((entry) => entry.book === book)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
          </select>
        </label>
        {chosen ? (
          <label className="field-label">
            Package price per guest
            <input
              className="field-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={chosen.pricePerGuest}
              disabled={locked}
              placeholder="From the book"
              onChange={(event) =>
                update({
                  cateringPackage: {
                    ...chosen,
                    pricePerGuest: event.target.value,
                  },
                })
              }
            />
          </label>
        ) : null}
      </div>
      {locked ? (
        draft.commitProgress.cateringPackage?.status === "saved" ? (
          <p className="text-sm text-success">Package saved on the event.</p>
        ) : (
          <p className="text-sm text-warning">
            Package may already be saved. Choose Retry to confirm.
          </p>
        )
      ) : null}
      {pack ? (
        <>
          <p className="text-sm text-ink-3">
            {cateringSource(pack)}. {pack.notes}
          </p>
          {!hasGuests ? (
            <p className="text-sm text-warning">
              Enter the headcount on Client & headcount to pick package dishes.
            </p>
          ) : null}
          {pack.groups.map((group, groupIndex) => (
            <fieldset
              key={group.label}
              disabled={locked || !hasGuests}
              className="border-t border-line pt-2"
            >
              <legend className="pr-3 text-sm font-semibold text-ink">
                {group.label}
              </legend>
              <ul className="divide-y divide-line">
                {group.recipeIds.map((recipeId) => {
                  const recipe = cateringRecipes.get(recipeId);
                  const line = selections.find(
                    (entry) => entry.recipeId === recipeId,
                  );
                  if (!recipe) return null;
                  return (
                    <li key={recipeId} className="py-2">
                      <label className="flex min-h-10 items-center gap-3 text-ink">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0"
                          checked={!!line}
                          onChange={() => toggle(recipeId, groupIndex)}
                        />
                        {recipe.name}
                      </label>
                      {line ? (
                        <div className="mt-1 grid gap-2 sm:grid-cols-[10rem_1fr]">
                          <label className="field-label">
                            Servings
                            <input
                              className="field-input"
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={
                                Number.isFinite(line.servings)
                                  ? line.servings
                                  : ""
                              }
                              onChange={(event) =>
                                changeLine(recipeId, {
                                  servings:
                                    event.target.value === ""
                                      ? Number.NaN
                                      : Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="field-label">
                            Notes for the kitchen
                            <input
                              className="field-input"
                              value={line.notes}
                              placeholder="Swaps, toppings, service notes…"
                              onChange={(event) =>
                                changeLine(recipeId, {
                                  notes: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
          {pack.serviceTasks?.length ? (
            <p className="text-sm text-ink-3">
              Also adds service activities ({pack.serviceTasks.join(", ")}) at
              the event start time, and a supply packing list.
            </p>
          ) : null}
          <p className="text-sm text-ink-2">
            {selections.length} package dishes picked.
          </p>
        </>
      ) : null}
    </div>
  );
}
