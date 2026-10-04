import {
  editionInUse,
  type PublishedEdition,
} from "../../../convex/lib/culinaryModel/recipeEdition";

type SavedVersion = {
  componentId: string;
  versionNumber: number;
  snapshot: string;
  deletedAt?: number | null;
};

/**
 * The edition a cook should follow: only a recipe taken back to draft after a
 * publish has one. Events make the same edition (see recipeEdition.ts).
 */
export function cookEdition(
  recipe: { _id: string; status: string; versionNumber: number },
  saved: readonly SavedVersion[] | undefined,
): PublishedEdition | null {
  return editionInUse(
    { status: recipe.status, versionNumber: recipe.versionNumber },
    (saved ?? []).filter(
      (row) => row.componentId === recipe._id && row.deletedAt == null,
    ),
  );
}

/**
 * Read-only method of the published edition, shown to a cook who opened the
 * recipe from a prep task while the chef is changing a draft.
 */
export function PublishedMethodPanel({
  edition,
}: {
  edition: PublishedEdition;
}) {
  const steps = edition.steps ?? [];
  const prose = edition.instructions.trim();
  return (
    <section className="culinary-section" data-testid="published-method">
      <div className="culinary-section-heading">
        <h2>Method</h2>
        <span>Edition {edition.versionNumber}</span>
      </div>
      <p className="text-base text-ink-2" role="status">
        The chef is changing this recipe. Follow edition {edition.versionNumber}
        , the one your event is made with.
      </p>
      {steps.length > 0 ? (
        <ol className="divide-y divide-line" aria-label="Method steps">
          {steps.map((step, index) => (
            <li
              key={`${step.sortOrder}-${index}`}
              className="flex min-w-0 gap-3 py-4"
            >
              <span className="font-mono text-base text-ink-2" aria-hidden>
                {index + 1}.
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="whitespace-pre-wrap break-words text-base text-ink">
                  {step.instruction}
                </p>
                {step.durationMinutes != null ? (
                  <span className="text-sm text-ink-2">
                    {step.durationMinutes} min
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : prose ? (
        <div className="method-prose">{prose}</div>
      ) : (
        <p className="py-4 text-base text-ink-2">
          Edition {edition.versionNumber} has no written method. Ask the chef.
        </p>
      )}
    </section>
  );
}
