import { describe, expect, it } from "vitest";
import {
  appRouteForKeydown,
  isSelectAllChord,
  isRecipeEditorCollapseChord,
  shouldFireSingleKeyNav,
  trapSingleKeyNav,
} from "../src/app/shell/singleKeyNav";
import {
  recipeEditorKeyOwner,
  recipeSearchAfterEmptyBackspace,
  recipeSearchAfterFocus,
  recipeSearchAfterGuardedInput,
  recipeSearchAfterInput,
  recipeSearchCleared,
  recipeSearchFromTypedQuery,
  createNameAfterGuardedInput,
  createNameAfterSearchInput,
  createNameIsUserTypedInput,
  createNamePrefillFromSearch,
  restoreCreateNameDomValue,
} from "../src/features/events/eventMenuRecipeSearch";
import {
  RECIPE_QUANTITY_COMMIT_ERROR,
  commitRecipeQuantity,
  formatRecipeQuantity,
  persistRecipeQuantity,
  recipeQuantityCommitError,
  recipeQuantityDraftAfterSave,
  recipeQuantityDraftAfterType,
  recipeQuantityDraftText,
} from "../src/features/events/eventMenuRecipeQuantity";

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
  });
});

describe("231 leftover: saved 0.082 does not steal the 0.062 draft", () => {
  it("keeps typed 0.062 while the parent still holds 0.082", () => {
    let drafts: Record<string, string> = {};
    expect(recipeQuantityDraftText(drafts, "white-onion", 0.082)).toBe("0.082");

    drafts = recipeQuantityDraftAfterType(drafts, "white-onion", "0.0");
    expect(recipeQuantityDraftText(drafts, "white-onion", 0.082)).toBe("0.0");

    drafts = recipeQuantityDraftAfterType(drafts, "white-onion", "0.06");
    expect(recipeQuantityDraftText(drafts, "white-onion", 0.082)).toBe("0.06");
    expect(recipeQuantityDraftText(drafts, "white-onion", 0.082)).not.toBe(
      "0.08",
    );

    drafts = recipeQuantityDraftAfterType(drafts, "white-onion", "0.062");
    expect(recipeQuantityDraftText(drafts, "white-onion", 0.082)).toBe("0.062");
    expect(recipeQuantityDraftText(drafts, "white-onion", 0.082)).not.toBe(
      "0.082",
    );
    expect(persistRecipeQuantity("0.062")).toBe(0.062);
    expect(persistRecipeQuantity("0.062")).not.toBe(0.082);
    expect(commitRecipeQuantity("0.062")).toEqual({
      ok: true,
      quantity: 0.062,
    });

    drafts = recipeQuantityDraftAfterSave(
      drafts,
      "white-onion",
      persistRecipeQuantity("0.062") ?? 0,
    );
    expect(recipeQuantityDraftText(drafts, "white-onion", 0.062)).toBe("0.062");
  });
});
