import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isEditableShortcutTarget,
  shouldFireSingleKeyNav,
  trapSingleKeyNav,
} from "../src/app/shell/singleKeyNav";

const editor = readFileSync(
  "src/features/events/EventMenuRecipeEditor.tsx",
  "utf8",
);
const shell = readFileSync("src/app/shell/AppShell.tsx", "utf8");
const nav = readFileSync("src/app/shell/singleKeyNav.ts", "utf8");

function searchInputTarget() {
  return { tagName: "INPUT", type: "search" };
}

function createNameTarget() {
  return { tagName: "INPUT", type: "text" };
}

/**
 * Window-level single-key nav as QA saw it: a bubbling letter key navigates.
 * The search field must stopPropagation so this listener never sees the key.
 */
function fireGlobalSingleKeyNav(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  propagationStopped?: boolean;
}): string | null {
  if (event.propagationStopped) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key.length !== 1) return null;
  return event.key;
}

function trappedKeydown(
  key: string,
  target: { tagName: string; type?: string },
) {
  const event = {
    key,
    target,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    propagationStopped: false,
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
  trapSingleKeyNav(event);
  return fireGlobalSingleKeyNav(event);
}

describe("event menu recipe search keeps typed keys", () => {
  it("traps keydown on the catalog search input so single-key nav never sees it", () => {
    expect(editor).toContain('type="search"');
    expect(editor).toContain(
      'data-testid="event-menu-recipe-ingredient-search"',
    );
    expect(editor).toContain("trapSingleKeyNav");
    expect(nav).toContain("event.stopPropagation()");
    expect(editor).toMatch(
      /type="search"[\s\S]{0,400}onKeyDown=\{trapSingleKeyNav\}/,
    );
    expect(editor).toMatch(
      /onKeyDown=\{trapSingleKeyNav\}[\s\S]{0,200}data-testid="event-menu-recipe-ingredient-search"/,
    );

    expect(fireGlobalSingleKeyNav({ key: "i" })).toBe("i");
    expect(fireGlobalSingleKeyNav({ key: "k" })).toBe("k");

    for (const key of ["c", "a", "r", "n", "e", "i", "k", "C", "?"]) {
      expect(
        trappedKeydown(key, searchInputTarget()),
        `key ${key} must not reach single-key nav`,
      ).toBeNull();
    }
  });

  it("traps keydown on the create-ingredient name field the same way", () => {
    expect(editor).toContain('data-testid="event-menu-create-ingredient-name"');
    expect(editor).toMatch(
      /onKeyDown=\{trapSingleKeyNav\}[\s\S]{0,160}data-testid="event-menu-create-ingredient-name"/,
    );
    expect(trappedKeydown("c", createNameTarget())).toBeNull();
    expect(trappedKeydown("i", createNameTarget())).toBeNull();
  });

  it("global single-key nav does not fire while a search INPUT is the target", () => {
    expect(isEditableShortcutTarget(searchInputTarget())).toBe(true);
    expect(
      shouldFireSingleKeyNav({
        key: "i",
        target: searchInputTarget(),
      }),
    ).toBe(false);
    expect(
      shouldFireSingleKeyNav({
        key: "k",
        target: searchInputTarget(),
      }),
    ).toBe(false);
    expect(
      shouldFireSingleKeyNav({
        key: "i",
        target: { tagName: "BUTTON" },
      }),
    ).toBe(true);
    expect(shell).toContain("shouldFireSingleKeyNav");
    expect(shell).toContain('addEventListener("keydown"');
  });

  it("create-ingredient form is always available, not a flaky toggle", () => {
    expect(editor).toContain('data-testid="event-menu-create-ingredient-form"');
    expect(editor).toContain('data-testid="event-menu-create-ingredient"');
    expect(editor).not.toContain("showCreate");
    expect(editor).not.toMatch(/showCreate \? \(/);
  });
});
