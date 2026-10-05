import {
  recipeEditionImpactText,
  useRecipeEditionImpact,
} from "../../lib/culinaryDemandClient";

type SavedVersion = {
  componentId: string;
  versionNumber: number;
  snapshot: string;
  deletedAt?: number | null;
};

/** Latest published edition number saved for this recipe, if any. */
export function lastPublishedEdition(
  componentId: string,
  currentVersion: number,
  saved: readonly SavedVersion[] | undefined,
): number | null {
  let best: number | null = null;
  for (const row of saved ?? []) {
    if (row.componentId !== componentId || row.deletedAt != null) continue;
    if (row.versionNumber >= currentVersion) continue;
    try {
      const data = JSON.parse(row.snapshot) as { edition?: string };
      if (data.edition !== "published") continue;
    } catch {
      continue;
    }
    if (best == null || row.versionNumber > best) best = row.versionNumber;
  }
  return best;
}

/**
 * Tells the kitchen what a recipe change reaches: while a draft is open,
 * events keep the last published edition; a publish reaches events not
 * finished yet, and finished events keep what they were made with.
 */
export function RecipeEditionNotice({
  componentId,
  status,
  versionNumber,
  saved,
}: {
  componentId: string;
  status: string;
  versionNumber: number;
  saved: readonly SavedVersion[] | undefined;
}) {
  const impact = useRecipeEditionImpact(componentId);
  const edition =
    status === "draft"
      ? lastPublishedEdition(componentId, versionNumber, saved)
      : null;
  const reach = impact ? recipeEditionImpactText(impact) : null;
  if (edition == null && !reach) return null;
  return (
    <div className="mt-3 text-base text-ink-2" role="status">
      {edition != null ? (
        <p>
          Events keep using edition {edition} while you change this draft.
          Publish it when the changes are ready.
        </p>
      ) : null}
      {reach ? <p>{reach}</p> : null}
    </div>
  );
}
