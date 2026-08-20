/** Event menu recipe search leftovers: focus, query, add, and Ctrl+A. */

export type RecipeSearchState = {
  query: string;
  selectedIngredientId: string;
};

export function recipeSearchCleared(): RecipeSearchState {
  return { query: "", selectedIngredientId: "" };
}

export function recipeSearchFromTypedQuery(query: string): RecipeSearchState {
  return { query, selectedIngredientId: "" };
}

export function recipeSearchFromPick(
  id: string,
  name: string,
): RecipeSearchState {
  return { query: name, selectedIngredientId: id };
}

/** Native search-clear / typing. Empty stays empty — no stale resurrection. */
export function recipeSearchAfterInput(value: string): RecipeSearchState {
  if (String(value ?? "") === "") return recipeSearchCleared();
  return recipeSearchFromTypedQuery(value);
}

/** Click / Tab / focus must not restore a query the user already cleared. */
export function recipeSearchAfterFocus(
  state: RecipeSearchState,
): RecipeSearchState {
  return state;
}

export type RecipeEditorField = "search" | "create-name" | "qty" | "other";

/** trapSingleKeyNav is only for catalog search and create-name, never qty. */
export function recipeSearchTrapAppliesTo(field: RecipeEditorField): boolean {
  return field === "search" || field === "create-name";
}

/** Keys typed after a catalog pick belong in Per serving, not Search catalog. */
export function recipeEditorFocusAfterCatalogPick(): "qty" {
  return "qty";
}

/** Search never steals keys from a focused Per serving field. */
export function recipeEditorKeyOwner(
  focused: RecipeEditorField,
): RecipeEditorField {
  return focused;
}

export type RecipeLineCommitSource =
  "add-button" | "add-form-submit" | "search-key" | "qty-click" | "qty-focus";

/** Only the Add control or an intentional add-form submit may attach a line. */
export function recipeLineCommitAllowed(
  source: RecipeLineCommitSource,
): boolean {
  return source === "add-button" || source === "add-form-submit";
}

/** End / Enter (or any key) in Search catalog must not attach a recipe line. */
export function searchKeyCommitsRecipeLine(key: string): boolean {
  void key;
  return false;
}

export function shouldPreventRecipeAddSubmitFromSearchKey(
  key: string,
): boolean {
  return key === "Enter" || key === "End";
}

/** Search catalog must never copy into New ingredient name. */
export function createNamePrefillFromSearch(_query: string): string {
  return "";
}

/** Missing submitter is treated as a search key, not Add. */
export function recipeAddSubmitSource(
  submitter: {
    tagName?: string;
    textContent?: string | null;
  } | null,
): RecipeLineCommitSource {
  const label = String(submitter?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (/add ingredient/i.test(label)) return "add-button";
  if (submitter != null) return "add-form-submit";
  return "search-key";
}

/** Last pointer/tab claim — delayed focus steal must not change this. */
export function claimRecipeEditorField(
  next: RecipeEditorField,
): RecipeEditorField {
  return next;
}

/** Catalog onChange/onInput applies only while Search owns the keys. */
export function recipeSearchAcceptsInput(owner: RecipeEditorField): boolean {
  return owner === "search";
}

/** Digits and Backspace typed for Per serving never rewrite Search catalog. */
export function recipeSearchAfterForeignFieldKey(
  state: RecipeSearchState,
  _incomingValue: string,
): RecipeSearchState {
  return state;
}

/** Typing, picking, or clearing Search must leave New ingredient name alone. */
export function createNameAfterSearchInput(
  _searchQuery: string,
  createName: string,
): string {
  return createName;
}

export function createNameAfterSearchPick(
  _pickedName: string,
  createName: string,
): string {
  return createName;
}

export function createNameAfterSearchClear(createName: string): string {
  return createName;
}

/** Pointer on Per serving keeps qty; do not restore Search afterward. */
export function recipeEditorFocusAfterQtyPointer(): "qty" {
  return "qty";
}

/** Pointer on Search catalog keeps Search; Backspace must not edit qty. */
export function recipeEditorFocusAfterSearchPointer(): "search" {
  return "search";
}
