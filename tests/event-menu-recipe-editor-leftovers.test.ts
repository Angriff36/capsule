import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appRouteForKeydown,
  isEditableShortcutTarget,
  isSelectAllChord,
  isRecipeEditorCollapseChord,
  shouldFireSingleKeyNav,
  trapSingleKeyNav,
} from "../src/app/shell/singleKeyNav";
import {
  recipeEditorFocusAfterCatalogPick,
  recipeEditorKeyOwner,
  recipeLineCommitAllowed,
  recipeSearchAfterFocus,
  recipeSearchAfterInput,
  recipeSearchCleared,
  recipeSearchFromPick,
  recipeSearchFromTypedQuery,
  recipeSearchTrapAppliesTo,
  createNamePrefillFromSearch,
  searchKeyCommitsRecipeLine,
  shouldPreventRecipeAddSubmitFromSearchKey,
} from "../src/features/events/eventMenuRecipeSearch";

const editor = readFileSync(
  "src/features/events/EventMenuRecipeEditor.tsx",
  "utf8",
);
const tab = readFileSync("src/features/events/EventMenuTab.tsx", "utf8");
const nav = readFileSync("src/app/shell/singleKeyNav.ts", "utf8");

describe("218 leftover: Per serving keeps focus and keys", () => {
  it("trap applies to search and create-name only, never the qty field", () => {
    expect(recipeSearchTrapAppliesTo("search")).toBe(true);
    expect(recipeSearchTrapAppliesTo("create-name")).toBe(true);
    expect(recipeSearchTrapAppliesTo("qty")).toBe(false);
    expect(recipeSearchTrapAppliesTo("other")).toBe(false);

    expect(isEditableShortcutTarget({ tagName: "INPUT", type: "number" })).toBe(
      true,
    );
    expect(
      shouldFireSingleKeyNav({
        key: "0",
        target: { tagName: "INPUT", type: "number" },
      }),
    ).toBe(false);

    expect(recipeEditorFocusAfterCatalogPick()).toBe("qty");
    expect(recipeEditorKeyOwner("qty")).toBe("qty");
    expect(recipeEditorKeyOwner("qty")).not.toBe("search");

    expect(editor).toContain("recipeSearchTrapAppliesTo");
    expect(editor).toContain("recipeEditorFocusAfterCatalogPick");
    expect(editor).toContain('data-testid="event-menu-recipe-add-qty"');
    expect(editor).toContain("event-menu-recipe-add-qty");

    const searchBlock = editor.slice(
      editor.indexOf('type="search"'),
      editor.indexOf('data-testid="event-menu-recipe-ingredient-search"') + 80,
    );
    expect(searchBlock).toContain("onKeyDown={trapSingleKeyNav}");

    const qtyAt = editor.indexOf('data-testid="event-menu-recipe-add-qty"');
    expect(qtyAt).toBeGreaterThan(-1);
    const qtyBlock = editor.slice(Math.max(0, qtyAt - 500), qtyAt + 280);
    expect(qtyBlock).toContain("Per serving");
    expect(qtyBlock).not.toContain("trapSingleKeyNav");
    expect(qtyBlock).toContain(".focus(");

    expect(editor).toMatch(
      /onKeyDown=\{trapSingleKeyNav\}[\s\S]{0,200}data-testid="event-menu-recipe-ingredient-search"/,
    );
    expect(editor).toMatch(
      /onKeyDown=\{trapSingleKeyNav\}[\s\S]{0,160}data-testid="event-menu-create-ingredient-name"/,
    );
  });
});

describe("218 leftover: cleared search must not resurrect", () => {
  it("keeps an empty query after clear, click, and Tab", () => {
    let state = recipeSearchFromTypedQuery("black bean");
    expect(state.query).toBe("black bean");
    state = recipeSearchAfterInput("");
    expect(state).toEqual(recipeSearchCleared());
    state = recipeSearchAfterFocus(state);
    expect(state.query).toBe("");
    expect(state.selectedIngredientId).toBe("");
    state = recipeSearchAfterInput("");
    expect(state.query).toBe("");

    state = recipeSearchFromTypedQuery("c");
    state = recipeSearchAfterInput("");
    state = recipeSearchAfterFocus(state);
    expect(state.query).toBe("");

    state = recipeSearchFromPick("ing-beans", "Black Beans");
    state = recipeSearchAfterInput("");
    expect(state).toEqual(recipeSearchCleared());

    expect(editor).toContain("recipeSearchAfterInput");
    expect(editor).toContain("onInput");
    expect(editor).not.toMatch(/onFocus=\{[^}]*setIngredientQuery/);
  });
});

describe("218 leftover: End/Enter in search must not add a line", () => {
  it("does not commit a recipe row from search keys", () => {
    expect(searchKeyCommitsRecipeLine("End")).toBe(false);
    expect(searchKeyCommitsRecipeLine("Enter")).toBe(false);
    expect(searchKeyCommitsRecipeLine("e")).toBe(false);
    expect(shouldPreventRecipeAddSubmitFromSearchKey("Enter")).toBe(true);
    expect(shouldPreventRecipeAddSubmitFromSearchKey("End")).toBe(true);
    expect(recipeLineCommitAllowed("search-key")).toBe(false);
    expect(recipeLineCommitAllowed("add-button")).toBe(true);
    expect(recipeLineCommitAllowed("add-form-submit")).toBe(true);

    const addStart = editor.indexOf("onSubmit={onAddIngredient}");
    expect(addStart).toBeGreaterThan(-1);
    const addChunk = editor.slice(
      addStart,
      editor.indexOf("</form>", addStart),
    );
    expect(addChunk).not.toContain('type="search"');
    expect(addChunk).not.toContain(
      'data-testid="event-menu-recipe-ingredient-search"',
    );
    expect(addChunk).toContain("Add ingredient");
    expect(addChunk).toContain('data-testid="event-menu-recipe-add-qty"');
    expect(editor).toContain("searchKeyCommitsRecipeLine");
  });
});

describe("218 leftover: Ctrl+A is not a nav/collapse chord", () => {
  it("treats Ctrl/Cmd+A as select-all in the field, not collapse", () => {
    const ctrlA = {
      key: "a",
      ctrlKey: true,
      metaKey: false,
      target: { tagName: "INPUT", type: "search" },
    };
    const cmdA = {
      key: "A",
      ctrlKey: false,
      metaKey: true,
      target: { tagName: "INPUT", type: "search" },
    };
    expect(isSelectAllChord(ctrlA)).toBe(true);
    expect(isSelectAllChord(cmdA)).toBe(true);
    expect(isRecipeEditorCollapseChord(ctrlA)).toBe(false);
    expect(isRecipeEditorCollapseChord(cmdA)).toBe(false);
    expect(shouldFireSingleKeyNav(ctrlA)).toBe(false);
    expect(shouldFireSingleKeyNav(cmdA)).toBe(false);
    expect(appRouteForKeydown(ctrlA)).toBeNull();
    expect(appRouteForKeydown(cmdA)).toBeNull();

    const event = {
      key: "a",
      ctrlKey: true,
      propagationStopped: false,
      stopPropagation() {
        this.propagationStopped = true;
      },
    };
    trapSingleKeyNav(event);
    expect(event.propagationStopped).toBe(true);

    expect(nav).toContain("isSelectAllChord");
    expect(nav).toContain("isRecipeEditorCollapseChord");
    expect(editor).toContain("isSelectAllChord");
    expect(tab).not.toMatch(/onKeyDown[\s\S]{0,160}setOpenRecipeId/);
    expect(tab).not.toMatch(/isRecipeEditorCollapseChord[\s\S]{0,80}\? null/);
  });
});

describe("218 leftover: search does not live-mirror into create name", () => {
  it("does not prefill New ingredient name from Search catalog", () => {
    expect(createNamePrefillFromSearch("Carne Asada")).toBe("");
    expect(createNamePrefillFromSearch("black bean")).toBe("");
    expect(editor).toContain("createNamePrefillFromSearch");
    expect(editor).not.toMatch(
      /name="newIngredientName"[\s\S]{0,120}defaultValue=\{ingredientQuery/,
    );
  });
});

describe("218 leftover: Per serving focus ring owns keystrokes", () => {
  it("keeps digits on the qty field after a catalog pick", () => {
    expect(recipeEditorKeyOwner("qty")).toBe("qty");
    expect(recipeEditorFocusAfterCatalogPick()).toBe("qty");
    expect(
      shouldFireSingleKeyNav({
        key: "2",
        target: { tagName: "INPUT", type: "number" },
      }),
    ).toBe(false);
    expect(editor).toContain(".focus()");
  });
});

describe("218 leftover: click Per serving does not commit a row", () => {
  it("only Add ingredient commits a recipe line", () => {
    expect(recipeLineCommitAllowed("qty-click")).toBe(false);
    expect(recipeLineCommitAllowed("qty-focus")).toBe(false);
    expect(recipeLineCommitAllowed("add-button")).toBe(true);
    expect(recipeLineCommitAllowed("add-form-submit")).toBe(true);
    expect(editor).toContain("recipeLineCommitAllowed");
    const qtyAt = editor.indexOf('data-testid="event-menu-recipe-add-qty"');
    const qtyBlock = editor.slice(Math.max(0, qtyAt - 280), qtyAt + 220);
    expect(qtyBlock).toContain("onMouseDown");
    expect(qtyBlock).toContain(".focus(");
    expect(qtyBlock).not.toContain("addIngredientLine");
    expect(qtyBlock).not.toContain("addLine(");
  });
});
