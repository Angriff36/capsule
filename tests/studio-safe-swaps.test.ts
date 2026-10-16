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
import { PageHeader, Section } from "../src/ui/primitives";
import { StatCard } from "../src/ui/charts/StatCard";

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

  it("never swaps a page heading for an empty or error state (keeps the <h1> masthead)", () => {
    expect(studioSwapChoices("masthead", "PageHeader", false)).toEqual([]);
    expect(studioSwapChoices("masthead", "PageHeader", true)).toEqual([]);
    expect(studioSwapChoices("empty", "EmptyState", false)).toEqual([]);
    expect(studioSwapChoices("error", "ErrorState", false)).toEqual([]);
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
    const words = dialog!.querySelector<HTMLTextAreaElement>("textarea");
    expect(words).not.toBeNull();
    act(() => {
      words!.dispatchEvent(
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

describe("screen editor finds the shared headings and labels", () => {
  const spot = (selector: string, pattern: string) =>
    StudioCopySpot.fromElement(document.querySelector(selector)!, pattern);

  it("page headings, section titles, empty messages and tile names are editable words", () => {
    mount(
      createElement(
        "div",
        null,
        createElement(PageHeader, { title: "Prep list", lead: "Today's work" }),
        createElement(Section, { title: "Stations", children: "x" }),
        createElement(EmptyState, { title: "No tasks yet", hint: "Add one." }),
        createElement(StatCard, { title: "Open tasks", main: { value: 4 } }),
      ),
    );
    expect(spot("h1", "/kitchen")?.originalText).toBe("Prep list");
    expect(spot("header p", "/kitchen")?.originalText).toBe("Today's work");
    expect(spot("h2", "/kitchen")?.originalText).toBe("Stations");
    expect(spot("p.text-xl", "/kitchen")?.originalText).toBe("No tasks yet");
    expect(spot("h3 span", "/kitchen")?.originalText).toBe("Open tasks");
  });

  it("a record's page heading and a section named after a record stay as they are", () => {
    mount(
      createElement(
        "div",
        null,
        createElement(PageHeader, { title: "Ashley's Wedding" }),
        createElement(Section, {
          title: "Venue follow-up · Grand Hall",
          liveTitle: true,
          children: "x",
        }),
      ),
    );
    expect(spot("h1", "/events/:id")).toBeNull();
    expect(spot("h2", "/events/:id")).toBeNull();
    expect(spot("h2", "/kitchen")).toBeNull();
  });

  it("the edit window says when words cannot be changed and offers no Save", () => {
    mount(
      createElement(StudioEditPopover, {
        draft: {
          x: 0,
          y: 0,
          copy: new StudioCopySpot("/kitchen", "div", "", "block"),
          copyEditable: false,
          slot: {
            kind: "section",
            name: "Section",
            slotKey: "section:Stations",
            selector: "section",
            label: "Stations",
            previewTitle: "Stations",
            live: false,
          },
        },
        text: "Stations",
        saving: false,
        componentId: "Section",
        onText: () => {},
        onComponent: () => {},
        onCancel: () => {},
        onSave: () => {},
      }),
    );
    const dialog = document.querySelector<HTMLElement>("[role='dialog']")!;
    expect(dialog.querySelector("textarea")).toBeNull();
    expect(dialog.textContent).toContain("stay as they are");
    expect(dialog.textContent).not.toContain("change its words");
    const save = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Save",
    );
    expect(save?.disabled).toBe(true);
  });
});
