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
  recipeSearchAfterEmptyBackspace,
  recipeSearchAfterFocus,
  recipeSearchAfterGuardedInput,
  recipeSearchAfterInput,
  recipeSearchCleared,
  recipeSearchFromPick,
  recipeSearchFromTypedQuery,
  recipeSearchTrapAppliesTo,
  CREATE_NAME_AUTOCOMPLETE,
  createNameAfterArmPointer,
  createNameAfterGuardedInput,
  createNameAfterSearchActivity,
  createNameAfterSearchInput,
  createNameIsUserTypedInput,
  createNamePrefillFromSearch,
  createNameReadOnly,
  createNameStartsArmed,
  restoreCreateNameDomValue,
  searchKeyCommitsRecipeLine,
  shouldPreventRecipeAddSubmitFromSearchKey,
} from "../src/features/events/eventMenuRecipeSearch";
import {
  RECIPE_QUANTITY_COMMIT_ERROR,
  RECIPE_QUANTITY_INPUT_MODE,
  RECIPE_QUANTITY_INPUT_TYPE,
  commitRecipeQuantity,
  formatRecipeQuantity,
  persistRecipeQuantity,
  recipeQuantityCommitError,
} from "../src/features/events/eventMenuRecipeQuantity";

const editor = readFileSync(
  "src/features/events/EventMenuRecipeEditor.tsx",
  "utf8",
);
const tab = readFileSync("src/features/events/EventMenuTab.tsx", "utf8");
const nav = readFileSync("src/app/shell/singleKeyNav.ts", "utf8");
const kitchen = readFileSync(
  "src/features/kitchen/DishIngredientsPanel.tsx",
  "utf8",
);

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
    expect(createNamePrefillFromSearch("cilantro")).toBe("");
    expect(editor).toContain("createNamePrefillFromSearch");
    expect(editor).not.toMatch(
      /name="newIngredientName"[\s\S]{0,120}defaultValue=\{ingredientQuery/,
    );
    expect(editor).not.toMatch(
      /name="newIngredientName"[\s\S]{0,240}\{ingredientQuery/,
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

describe("224 leftover: Per serving digits never write Search", () => {
  it("rejects qty-owned keystrokes and delayed autofill into the catalog query", () => {
    const empty = recipeSearchCleared();
    const leaked = recipeSearchAfterGuardedInput({
      current: empty,
      nextValue: "1",
      focused: "qty",
      heldEmpty: true,
      inputType: "insertText",
    });
    expect(leaked.state).toEqual(empty);
    expect(recipeEditorKeyOwner("qty")).not.toBe("search");

    const midQty = recipeSearchAfterGuardedInput({
      current: empty,
      nextValue: "8",
      focused: "qty",
      heldEmpty: true,
    });
    expect(midQty.state.query).toBe("");

    const typed = recipeSearchAfterGuardedInput({
      current: empty,
      nextValue: "t",
      focused: "search",
      heldEmpty: true,
      inputType: "insertText",
    });
    expect(typed.state.query).toBe("t");
    expect(typed.heldEmpty).toBe(false);

    expect(editor).toContain("recipeSearchAfterGuardedInput");
    expect(editor).toContain('rememberKeyOwner("qty")');
    expect(editor).toContain('role="searchbox"');
  });
});

describe("224 leftover: Search does not copy into New ingredient name", () => {
  it("keeps create-name independent across type, pick, clear, and remount", () => {
    let createName = createNamePrefillFromSearch("");
    expect(createName).toBe("");
    createName = createNameAfterSearchInput("cilantro", createName);
    expect(createName).toBe("");
    createName = createNameAfterSearchInput("", createName);
    expect(createName).toBe("");
    expect(createNameAfterSearchInput("pico", "Carne asada")).toBe(
      "Carne asada",
    );
    expect(
      createNameAfterGuardedInput({
        current: "",
        nextValue: "cilantro",
        focused: "search",
      }),
    ).toBe("");
    expect(
      createNameAfterGuardedInput({
        current: "",
        nextValue: "pico",
        focused: "qty",
      }),
    ).toBe("");
    expect(
      createNameAfterGuardedInput({
        current: "",
        nextValue: "Radish",
        focused: "create-name",
      }),
    ).toBe("Radish");
    expect(createNameAfterSearchInput("cilantro", "Radish")).toBe("Radish");
    expect(createNameAfterSearchInput("", "Radish")).toBe("Radish");

    expect(editor).toContain("createNameAfterGuardedInput");
    expect(editor).toContain("value={createName}");
    expect(editor).not.toMatch(
      /name="newIngredientName"[\s\S]{0,160}value=\{ingredientQuery/,
    );
    expect(editor).not.toMatch(
      /name="newIngredientName"[\s\S]{0,160}defaultValue=\{ingredientQuery/,
    );
    expect(editor).not.toMatch(/newIngredientName[\s\S]{0,80}ingredientQuery/);
    expect(editor).not.toMatch(
      /value=\{createName\}[\s\S]{0,80}ingredientQuery/,
    );

    const applyAt = editor.indexOf("function applySearchState");
    expect(applyAt).toBeGreaterThan(-1);
    const applyBlock = editor.slice(
      applyAt,
      editor.indexOf("function applySearchDomInput"),
    );
    expect(applyBlock).not.toContain("setCreateName");
    expect(applyBlock).not.toContain("createName");
    expect(editor).not.toContain("createNameAfterSearchInput");

    expect(editor).toContain('name="eventMenuRecipeCatalogSearch"');
    expect(editor).toContain('name="newIngredientName"');
    expect(editor).toContain('id="event-menu-create-ingredient-name"');
    expect(editor).toContain('id="event-menu-recipe-ingredient-search"');
  });
});

describe("224 leftover: cleared Search stays empty", () => {
  it("rejects backspace-on-empty, blur, and click write-back of a prior query", () => {
    let state = recipeSearchFromTypedQuery("pico");
    state = recipeSearchAfterInput("");
    expect(state).toEqual(recipeSearchCleared());

    const backspace = recipeSearchAfterEmptyBackspace();
    expect(backspace).toEqual(recipeSearchCleared());
    const resurrect = recipeSearchAfterGuardedInput({
      current: recipeSearchCleared(),
      nextValue: "pico",
      focused: "search",
      heldEmpty: true,
    });
    expect(resurrect.state.query).toBe("");
    expect(resurrect.heldEmpty).toBe(true);

    const afterBlur = recipeSearchAfterFocus(recipeSearchCleared());
    expect(afterBlur.query).toBe("");
    const cilantro = recipeSearchAfterGuardedInput({
      current: afterBlur,
      nextValue: "cilantro",
      focused: "search",
      heldEmpty: true,
      inputType: "insertReplacementText",
    });
    expect(cilantro.state.query).toBe("");

    const qtyDigit = recipeSearchAfterGuardedInput({
      current: recipeSearchCleared(),
      nextValue: "8",
      focused: "search",
      heldEmpty: true,
    });
    expect(qtyDigit.state.query).toBe("");

    expect(editor).toContain("recipeSearchAfterEmptyBackspace");
    expect(editor).toContain("recipeSearchAfterFocus");
    expect(editor).toContain("onBlur={onRecipeSearchBlur}");
    expect(editor).not.toMatch(/onFocus=\{[^}]*setIngredientQuery/);
  });
});

describe("228 leftover: Search typing never writes create-name", () => {
  it("leaves createName empty for cilantro/pico and rejects search-owned onChange", () => {
    let createName = createNamePrefillFromSearch("");
    expect(createName).toBe("");

    createName = createNameAfterSearchInput("cilantro", createName);
    expect(createName).toBe("");
    createName = createNameAfterGuardedInput({
      current: createName,
      nextValue: "cilantro",
      focused: "search",
      active: false,
      inputType: "insertText",
    });
    expect(createName).toBe("");
    const cilantroDom = { value: "cilantro" };
    restoreCreateNameDomValue(cilantroDom, createName);
    expect(cilantroDom.value).toBe("");

    createName = createNameAfterSearchInput("pico", createName);
    expect(createName).toBe("");
    createName = createNameAfterGuardedInput({
      current: createName,
      nextValue: "pico",
      focused: "search",
      active: false,
      inputType: "insertText",
    });
    expect(createName).toBe("");
    const picoDom = { value: "pico" };
    restoreCreateNameDomValue(picoDom, createName);
    expect(picoDom.value).toBe("");

    createName = createNameAfterSearchInput("", createName);
    expect(createName).toBe("");
    const clearedDom = { value: "pico" };
    restoreCreateNameDomValue(clearedDom, createName);
    expect(clearedDom.value).toBe("");

    expect(
      createNameAfterGuardedInput({
        current: "",
        nextValue: "cilantro",
        focused: "search",
        active: true,
        inputType: "insertText",
      }),
    ).toBe("");
    expect(
      createNameAfterGuardedInput({
        current: "",
        nextValue: "pico",
        focused: "create-name",
        active: false,
        inputType: "insertText",
      }),
    ).toBe("");
    expect(
      createNameAfterGuardedInput({
        current: "",
        nextValue: "cilantro",
        focused: "create-name",
        active: true,
        inputType: "insertReplacementText",
      }),
    ).toBe("");
    expect(
      createNameAfterGuardedInput({
        current: "",
        nextValue: "pico",
        focused: "create-name",
        active: true,
        inputType: undefined,
      }),
    ).toBe("");
    expect(createNameIsUserTypedInput("insertText")).toBe(true);
    expect(createNameIsUserTypedInput("insertReplacementText")).toBe(false);
    expect(
      createNameAfterGuardedInput({
        current: "",
        nextValue: "Radish",
        focused: "create-name",
        active: true,
        inputType: "insertText",
      }),
    ).toBe("Radish");

    const applyAt = editor.indexOf("function applySearchState");
    expect(applyAt).toBeGreaterThan(-1);
    const applyBlock = editor.slice(
      applyAt,
      editor.indexOf("function applySearchDomInput"),
    );
    expect(applyBlock).not.toContain("setCreateName");
    expect(applyBlock).not.toMatch(/setCreateName\s*\(\s*ingredientQuery/);
    expect(editor).not.toMatch(/setCreateName\s*\(\s*ingredientQuery/);
    expect(editor).not.toMatch(/setCreateName\([^)]*ingredientQuery/);
    expect(editor).toContain("syncNewIngredientInputDom");
    expect(editor).toContain("restoreCreateNameDomValue");
    expect(editor).toContain("CREATE_NAME_AUTOCOMPLETE");
    expect(editor).not.toMatch(
      /name="newIngredientName"[\s\S]{0,240}autoComplete="off"/,
    );
    expect(editor).toContain("eventMenuCreateIngredientAutofillSink");
    expect(CREATE_NAME_AUTOCOMPLETE).not.toBe("off");
    expect(CREATE_NAME_AUTOCOMPLETE).toBe("event-menu-new-ingredient-name");
  });
});

describe("229 leftover: create-name is readOnly until armed", () => {
  it("stays empty for search cilantro/pico and only accepts typing after arm", () => {
    expect(createNameStartsArmed()).toBe(false);
    expect(createNameAfterSearchActivity(true)).toBe(false);
    expect(createNameAfterSearchActivity(false)).toBe(false);
    expect(createNameAfterArmPointer()).toBe(true);
    expect(createNameReadOnly(false)).toBe(true);
    expect(createNameReadOnly(true)).toBe(false);

    let createName = createNamePrefillFromSearch("");
    expect(createName).toBe("");
    let armed = createNameStartsArmed();
    expect(createNameReadOnly(armed)).toBe(true);

    armed = createNameAfterSearchActivity(armed);
    createName = createNameAfterSearchInput("cilantro", createName);
    createName = createNameAfterGuardedInput({
      current: createName,
      nextValue: "cilantro",
      focused: "create-name",
      active: true,
      inputType: "insertText",
      armed,
    });
    expect(createName).toBe("");
    const cilantroDom = { value: "cilantro" };
    restoreCreateNameDomValue(cilantroDom, createName);
    expect(cilantroDom.value).toBe("");

    armed = createNameAfterSearchActivity(armed);
    createName = createNameAfterSearchInput("pico", createName);
    createName = createNameAfterGuardedInput({
      current: createName,
      nextValue: "pico",
      focused: "create-name",
      active: true,
      inputType: "insertText",
      armed,
    });
    expect(createName).toBe("");
    const picoDom = { value: "pico" };
    restoreCreateNameDomValue(picoDom, createName);
    expect(picoDom.value).toBe("");

    armed = createNameAfterArmPointer();
    expect(createNameReadOnly(armed)).toBe(false);
    createName = createNameAfterGuardedInput({
      current: createName,
      nextValue: "xyz",
      focused: "create-name",
      active: true,
      inputType: "insertText",
      armed,
    });
    expect(createName).toBe("xyz");

    armed = createNameAfterSearchActivity(armed);
    expect(createNameReadOnly(armed)).toBe(true);
    createName = createNameAfterGuardedInput({
      current: createName,
      nextValue: "cilantro",
      focused: "create-name",
      active: true,
      inputType: "insertText",
      armed,
    });
    expect(createName).toBe("xyz");

    expect(editor).toContain("createNameStartsArmed");
    expect(editor).toContain("createNameAfterSearchActivity");
    expect(editor).toContain("createNameAfterArmPointer");
    expect(editor).toContain("createNameReadOnly");
    expect(editor).toContain("readOnly={createNameReadOnly(createNameArmed)}");
    expect(editor).toContain("onPointerDown={armCreateNameField}");
    expect(editor).toContain("onClick={armCreateNameField}");
    expect(editor).toContain("armCreateNameField()");
    expect(editor).toContain("disarmCreateNameField()");
    expect(editor).not.toContain("showCreate");
    expect(editor).not.toContain("key={ingredientQuery}");
    expect(editor).not.toMatch(/setCreateName\s*\(\s*ingredientQuery/);
    expect(editor).not.toMatch(/setCreateName\([^)]*ingredientQuery/);
    expect(editor).not.toMatch(
      /name="newIngredientName"[\s\S]{0,160}value=\{ingredientQuery/,
    );

    const applyAt = editor.indexOf("function applySearchState");
    expect(applyAt).toBeGreaterThan(-1);
    const applyBlock = editor.slice(
      applyAt,
      editor.indexOf("function applySearchDomInput"),
    );
    expect(applyBlock).not.toContain("setCreateName");
    expect(applyBlock).not.toContain("createName");

    const nameAt = editor.indexOf('name="newIngredientName"');
    expect(nameAt).toBeGreaterThan(-1);
    const nameBlock = editor.slice(nameAt, nameAt + 400);
    expect(nameBlock).toContain("onKeyDown={trapSingleKeyNav}");
    expect(nameBlock).toContain('type="text"');
    expect(editor).toMatch(
      /onKeyDown=\{trapSingleKeyNav\}[\s\S]{0,160}data-testid="event-menu-create-ingredient-name"/,
    );
    expect(editor).toContain('type="search"');
  });
});

describe("Save qty leftover: typed decimals persist exactly", () => {
  it("round-trips 0.02 and 0.062 through persist/format", () => {
    expect(formatRecipeQuantity(persistRecipeQuantity("0.02"))).toBe("0.02");
    expect(formatRecipeQuantity(persistRecipeQuantity("0.062"))).toBe("0.062");
    expect(persistRecipeQuantity("0.02")).toBe(0.02);
    expect(persistRecipeQuantity("0.062")).toBe(0.062);
    expect(persistRecipeQuantity("0.02")).not.toBe(0.02002);
    expect(persistRecipeQuantity("0.062")).not.toBe(0.082);
    expect(formatRecipeQuantity(0.02002)).toBe("0.02");
    expect(formatRecipeQuantity(0.03003)).toBe("0.03");
    expect(formatRecipeQuantity(0.062)).toBe("0.062");
    expect(commitRecipeQuantity("0.02")).toEqual({ ok: true, quantity: 0.02 });
    expect(commitRecipeQuantity("0.062")).toEqual({
      ok: true,
      quantity: 0.062,
    });
    expect(recipeQuantityCommitError("0.02")).toBeNull();
    expect(recipeQuantityCommitError("0.062")).toBeNull();
    expect(recipeQuantityCommitError("0.")).toBe(RECIPE_QUANTITY_COMMIT_ERROR);
    expect(recipeQuantityCommitError("")).toBe(RECIPE_QUANTITY_COMMIT_ERROR);
    expect(RECIPE_QUANTITY_INPUT_TYPE).toBe("text");
    expect(RECIPE_QUANTITY_INPUT_MODE).toBe("decimal");

    expect(editor).toContain("commitRecipeQuantity");
    expect(editor).toContain("formatRecipeQuantity");
    expect(editor).toContain("RECIPE_QUANTITY_INPUT_TYPE");
    expect(editor).toContain("RECIPE_QUANTITY_INPUT_MODE");
    expect(kitchen).toContain("commitRecipeQuantity");
    expect(kitchen).toContain("formatRecipeQuantity");

    const saveAt = editor.indexOf('data-testid="event-menu-recipe-qty"');
    expect(saveAt).toBeGreaterThan(-1);
    const saveBlock = editor.slice(Math.max(0, saveAt - 360), saveAt + 80);
    expect(saveBlock).toContain("type={RECIPE_QUANTITY_INPUT_TYPE}");
    expect(saveBlock).toContain("inputMode={RECIPE_QUANTITY_INPUT_MODE}");
    expect(saveBlock).toContain("formatRecipeQuantity(line.quantity)");
    expect(saveBlock).not.toContain('type="number"');
    expect(saveBlock).not.toContain("trapSingleKeyNav");
    expect(saveBlock).not.toContain('Number(data.get("quantity")');

    const addAt = editor.indexOf('data-testid="event-menu-recipe-add-qty"');
    const addBlock = editor.slice(Math.max(0, addAt - 360), addAt + 80);
    expect(addBlock).toContain("type={RECIPE_QUANTITY_INPUT_TYPE}");
    expect(addBlock).not.toContain('type="number"');
    expect(addBlock).not.toContain("trapSingleKeyNav");

    expect(editor).not.toMatch(
      /data-testid="event-menu-recipe-qty"[\s\S]{0,80}type="number"/,
    );
    expect(kitchen).toContain("type={RECIPE_QUANTITY_INPUT_TYPE}");
    expect(kitchen).not.toMatch(
      /data-testid="kitchen-dish-recipe-qty"[\s\S]{0,80}type="number"/,
    );
  });
});
