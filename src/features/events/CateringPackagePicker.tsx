import { useState } from "react";
import {
  cateringBooks,
  cateringPackages,
  cateringRecipes,
  cateringSource,
  defaultCateringSelections,
  type CateringSelection,
} from "../../data/cateringPackages";
import {
  beginPendingOperation,
  confirmPendingOperation,
} from "../../lib/pendingOperationKey";
import type { CateringPackageResult } from "../../../convex/lib/cateringPackageOperations";
import { classifyCommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";

export type CateringPackageInput = {
  packageId: string;
  selections: CateringSelection[];
  operationKey: string;
  serviceStartsAt?: number;
};

type Props = {
  eventId: string;
  headcount: number;
  startsAt?: number;
  busy: boolean;
  onApply: (input: CateringPackageInput) => Promise<CateringPackageResult>;
};

function localDateTime(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function CateringPackagePicker({
  eventId,
  headcount,
  startsAt,
  busy,
  onApply,
}: Props) {
  const [open, setOpen] = useState(false);
  const [book, setBook] = useState("wedding");
  const [packageId, setPackageId] = useState("");
  const [guests, setGuests] = useState(Math.max(1, headcount || 1));
  const [selections, setSelections] = useState<CateringSelection[]>([]);
  const [serviceTime, setServiceTime] = useState(localDateTime(startsAt));
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReturnType<
    typeof classifyCommandFailure
  > | null>(null);
  const [result, setResult] = useState<CateringPackageResult | null>(null);
  const pack = cateringPackages.find((entry) => entry.id === packageId);
  const disabled = busy || submitting;

  function choosePackage(id: string) {
    setPackageId(id);
    const next = cateringPackages.find((entry) => entry.id === id);
    setSelections(next ? defaultCateringSelections(next, guests) : []);
    setFailure(null);
    setResult(null);
  }

  function toggle(recipeId: string, groupIndex: number) {
    if (!pack) return;
    const group = pack.groups[groupIndex];
    setSelections((current) => {
      const next = current.some((line) => line.recipeId === recipeId)
        ? current.filter((line) => line.recipeId !== recipeId)
        : [...current, { recipeId, servings: guests, notes: "" }];
      if (!group.splitServings) return next;
      const sharing = next.filter((line) =>
        group.recipeIds.includes(line.recipeId),
      );
      return next.map((line) => {
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
      });
    });
  }

  async function apply() {
    if (!pack || disabled) return;
    setSubmitting(true);
    setFailure(null);
    setResult(null);
    const scope = `catering-package:${eventId}:${pack.id}`;
    try {
      const pending = beginPendingOperation(scope, {
        packageId: pack.id,
        selections,
        ...(pack.serviceTasks?.length && serviceTime
          ? { serviceStartsAt: new Date(serviceTime).getTime() }
          : {}),
      });
      const saved = await onApply({
        ...pending.payload,
        operationKey: pending.key,
      });
      confirmPendingOperation(scope);
      setResult(saved);
      setPackageId("");
      setSelections([]);
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-y border-line py-3">
      <button
        type="button"
        className="btn btn-ghost"
        aria-expanded={open}
        aria-controls="catering-package-picker"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close packages" : "Add catering package"}
      </button>
      {open && (
        <div id="catering-package-picker" className="mt-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-ink">
              Catering packages
            </h3>
            <p className="text-base text-ink-2">
              Choose a book and package, then adjust dishes and servings before
              adding them to this event.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-base text-ink">
              Menu book
              <select
                className="input min-h-10 w-full"
                value={book}
                disabled={disabled}
                onChange={(event) => {
                  setBook(event.target.value);
                  choosePackage("");
                }}
              >
                {Object.entries(cateringBooks).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name.replace(/\.pdf$/, "")}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-base text-ink">
              Package
              <select
                className="input min-h-10 w-full"
                value={packageId}
                disabled={disabled}
                onChange={(event) => choosePackage(event.target.value)}
              >
                <option value="">Select a package</option>
                {cateringPackages
                  .filter((entry) => entry.book === book)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-base text-ink">
              Guests
              <input
                type="number"
                min="1"
                step="1"
                className="input min-h-10 w-full"
                value={guests}
                disabled={disabled}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setGuests(value);
                  if (Number.isSafeInteger(value) && value > 0 && guests > 0)
                    setSelections((current) =>
                      current.map((line) => ({
                        ...line,
                        servings: Math.max(
                          1,
                          Math.round((line.servings * value) / guests),
                        ),
                      })),
                    );
                }}
              />
            </label>
          </div>
          {pack && (
            <>
              <div className="border-l-2 border-line-2 pl-3 text-base text-ink-2">
                <p>{cateringSource(pack)}</p>
                <p className="mt-1">{pack.notes}</p>
              </div>
              {pack.groups.length > 0 && (
                <p className="text-base text-ink-2">
                  Included dishes are selected below. Choice counts are starting
                  points you can change. Existing matching dishes retain their
                  recipe details. New dishes include the book’s description and
                  a preparation task.
                </p>
              )}
              {pack.groups.map((group, groupIndex) => (
                <fieldset
                  key={group.label}
                  disabled={disabled}
                  className="border-t border-line pt-3"
                >
                  <legend className="pr-3 text-base font-semibold text-ink">
                    {group.label}
                  </legend>
                  {group.splitServings && (
                    <p className="mb-2 text-base text-ink-2">
                      Guest portions are shared across these selections. Adjust
                      each serving count as needed.
                    </p>
                  )}
                  <div className="divide-y divide-line">
                    {group.recipeIds.map((recipeId) => {
                      const recipe = cateringRecipes.get(recipeId)!;
                      const line = selections.find(
                        (entry) => entry.recipeId === recipeId,
                      );
                      return (
                        <div
                          key={recipeId}
                          className="grid gap-2 py-2 md:grid-cols-[minmax(0,1fr)_7rem]"
                        >
                          <label className="flex min-h-10 items-center gap-3 text-base text-ink">
                            <input
                              type="checkbox"
                              checked={!!line}
                              onChange={() => toggle(recipeId, groupIndex)}
                              className="h-4 w-4 shrink-0"
                            />
                            {recipe.name}
                          </label>
                          {line && (
                            <label className="flex items-center gap-2 text-base text-ink-2 md:block">
                              <span className="md:sr-only">
                                Servings for {recipe.name}
                              </span>
                              <input
                                aria-label={`Servings for ${recipe.name}`}
                                type="number"
                                min="1"
                                step="1"
                                className="input min-h-10 w-full"
                                value={line.servings}
                                onChange={(event) =>
                                  setSelections((current) =>
                                    current.map((entry) =>
                                      entry.recipeId === recipeId
                                        ? {
                                            ...entry,
                                            servings: Number(
                                              event.target.value,
                                            ),
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                              />
                            </label>
                          )}
                          {line && (
                            <div className="space-y-2 md:col-span-2">
                              {recipe.description && (
                                <p className="text-base text-ink-2">
                                  {recipe.description}
                                </p>
                              )}
                              <label className="grid gap-1 text-base text-ink-2">
                                Instructions for {recipe.name}
                                <input
                                  className="input min-h-10 w-full"
                                  value={line.notes}
                                  placeholder="Substitutions, toppings or service notes"
                                  onChange={(event) =>
                                    setSelections((current) =>
                                      current.map((entry) =>
                                        entry.recipeId === recipeId
                                          ? {
                                              ...entry,
                                              notes: event.target.value,
                                            }
                                          : entry,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              {!!pack.serviceTasks?.length && (
                <div className="space-y-2 border-t border-line pt-3 text-base text-ink-2">
                  <p>
                    Creates service activities: {pack.serviceTasks.join(", ")}.
                    Adds a supply packing list.
                  </p>
                  <label className="grid max-w-sm gap-1">
                    Service start
                    <BoundedDateTimeLocalInput
                      className="input min-h-10"
                      value={serviceTime}
                      disabled={disabled}
                      onChange={(event) => setServiceTime(event.target.value)}
                    />
                  </label>
                  <p>
                    Activities initially use this start time. Adjust their
                    timing in the event timeline.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    disabled ||
                    (!selections.length && !pack.serviceTasks?.length)
                  }
                  onClick={() => void apply()}
                >
                  {submitting ? "Adding package…" : `Add ${pack.name}`}
                </button>
                <p className="text-base text-ink-2">
                  {selections.length} dishes selected. Creates event dishes and
                  prep work together.
                </p>
              </div>
            </>
          )}
          {failure && <FailureBanner failure={failure} />}
          {result && (
            <div
              role="status"
              className="border-l-2 border-brand pl-3 text-base text-ink"
            >
              <p>
                {result.packageName}: {result.savedDishIds.length} event dishes,{" "}
                {result.prepTasks} prep tasks
                {result.serviceActivities
                  ? `, ${result.serviceActivities} service activities`
                  : ""}
                {result.packingLists
                  ? `, ${result.packingLists} packing list`
                  : ""}{" "}
                added.
              </p>
              <p>
                {result.createdRecipes} dishes created; {result.reusedRecipes}{" "}
                existing dishes reused.
              </p>
              {result.recovered && (
                <p>
                  An earlier saved request was recovered without adding
                  duplicates. Check the event menu before adding further
                  changes.
                </p>
              )}
              {result.recipesWithoutQuantities.length > 0 && (
                <p className="mt-2 text-ink-2">
                  Ingredient quantities still need entering for:{" "}
                  {result.recipesWithoutQuantities.join(", ")}. Their prep tasks
                  are created; purchasing totals are incomplete.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
