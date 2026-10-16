// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The screen editor swaps a live block for a catalog piece. A swap must never
// take away tabs, buttons, links or live content (DESIGN.md: "Preserve live
// data, route behavior..."), and the edit window must work on a phone.

let savedSwap = "PageHeader";
vi.mock("../src/features/studio/StudioContext", () => ({
  useStudio: () => ({
    pagePattern: "/kitchen",
    canEdit: true,
    ready: true,
    layout: { componentId: () => savedSwap },
  }),
}));

import { studioSwapChoices } from "../src/features/studio/StudioCatalog";
import "../src/features/studio/StudioCatalogRegister";
import { StudioEditPopover } from "../src/features/studio/StudioEditPopover";
import { StudioCopySpot } from "../src/features/studio/StudioCopySpot";
import type { StudioEditDraft } from "../src/features/studio/StudioEditDraft";
import { PrepTaskRow } from "../src/features/kitchen/PrepTaskRow";
import { SegmentedTabs } from "../src/ui/SegmentedTabs";
import { EmptyState } from "../src/ui/EmptyState";

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ||= ((query: string) => ({
    matches: query.includes("max-width"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(node: ReturnType<typeof createElement>) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

describe("screen editor swaps keep live behavior", () => {
  it("offers no swap for tabs, rows, rails, folded sections or section cards", () => {
    expect(studioSwapChoices("tabs", "SegmentedTabs", false)).toEqual([]);
    expect(studioSwapChoices("tabs", "WorkspaceTabs", false)).toEqual([]);
    expect(studioSwapChoices("row", "PrepTaskRow", false)).toEqual([]);
    expect(studioSwapChoices("rail", "EventStageRail", false)).toEqual([]);
    expect(studioSwapChoices("merged", "MergedSection", false)).toEqual([]);
    expect(studioSwapChoices("section", "Section", false)).toEqual([]);
  });

  it("offers only fitting words-only pieces, and none for a block with buttons", () => {
    const ids = studioSwapChoices("masthead", "PageHeader", false).map(
      (entry) => entry.id,
    );
    expect(ids).toEqual(["EmptyState", "ErrorState"]);
    expect(studioSwapChoices("masthead", "PageHeader", true)).toEqual([]);
  });

  it("a saved swap on filter tabs still shows tabs that switch", () => {
    savedSwap = "PageHeader";
    const onChange = vi.fn();
    const page = mount(
      createElement(SegmentedTabs<"open" | "done">, {
        label: "Show",
        options: [
          { value: "open", label: "Open" },
          { value: "done", label: "Done" },
        ],
        value: "open",
        onChange,
      }),
    );
    const tabs = page.querySelectorAll<HTMLButtonElement>("[role='tab']");
    expect(tabs).toHaveLength(2);
    act(() => tabs[1]!.click());
    expect(onChange).toHaveBeenCalledWith("done");
  });

  it("a saved swap on a prep row keeps its done box and its buttons", () => {
    savedSwap = "EmptyState";
    const onComplete = vi.fn();
    const page = mount(
      createElement(
        PrepTaskRow,
        {
          name: "Dice onions",
          quantity: 4,
          unit: "qt",
          status: "in_progress",
          now: Date.now(),
          onComplete,
        },
        createElement("button", { type: "button" }, "Start"),
      ),
    );
    const done = page.querySelector<HTMLInputElement>(
      "input[aria-label^='Done: ']",
    );
    expect(done).not.toBeNull();
    act(() => done!.click());
    expect(onComplete).toHaveBeenCalled();
    expect(page.textContent).toContain("Start");
  });

  it("a saved swap on an empty state with a button keeps the button", () => {
    savedSwap = "ErrorState";
    const page = mount(
      createElement(EmptyState, {
        title: "No tasks yet",
        action: createElement("button", { type: "button" }, "Add a task"),
      }),
    );
    expect(page.textContent).toContain("Add a task");
  });
});

describe("screen editor edit window", () => {
  const draft = (live: boolean): StudioEditDraft => ({
    x: 900,
    y: 40,
    copy: new StudioCopySpot("/kitchen", "h1", "Prep list", "Prep list"),
    copyEditable: true,
    slot: {
      kind: "masthead",
      name: "PageHeader",
      slotKey: "masthead:Prep list",
      selector: "h1",
      label: "Prep list",
      previewTitle: "Prep list",
      live,
    },
  });

  it("is the shared dialog: focus inside, Esc closes from any control", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onCancel = vi.fn();
    mount(
      createElement(StudioEditPopover, {
        draft: draft(false),
        text: "Prep list",
        saving: false,
        componentId: "PageHeader",
        onText: () => {},
        onComponent: () => {},
        onCancel,
        onSave: () => {},
      }),
    );
    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.className).toContain("ui-dialog");
    expect(dialog?.getAttribute("style") ?? "").not.toContain("28rem");
    const radio = dialog!.querySelector<HTMLInputElement>(
      "input[type='radio']",
    );
    expect(radio).not.toBeNull();
    act(() => {
      radio!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    const cancel = [...dialog!.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel",
    );
    expect(cancel?.className).toContain("btn");
    expect(cancel?.className).not.toContain("btn-sm");
    opener.remove();
  });

  it("a block with buttons offers words only, no swap", () => {
    mount(
      createElement(StudioEditPopover, {
        draft: draft(true),
        text: "Prep list",
        saving: false,
        componentId: "PageHeader",
        onText: () => {},
        onComponent: () => {},
        onCancel: () => {},
        onSave: () => {},
      }),
    );
    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog!.querySelector("input[type='radio']")).toBeNull();
    expect(dialog!.textContent).toContain("keeps its own look");
  });
});
