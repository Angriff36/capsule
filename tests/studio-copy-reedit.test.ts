// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// A spot whose saved wording already shows can be picked and changed again:
// the same row is updated, its first words are kept, and restoring brings the
// true original back. The editor also waits for saved edits to load.

const queries: { copy: unknown; layout: unknown } = {
  copy: undefined,
  layout: undefined,
};
const noop = async () => {};
vi.mock("../src/lib/manifest-convex-react", () => ({
  useListScreenCopyOverride: () => queries.copy,
  useListScreenLayoutOverride: () => queries.layout,
  useCreateScreenCopyOverride: () => noop,
  useScreenCopyOverrideChange: () => noop,
  useScreenCopyOverrideRevert: () => noop,
  useCreateScreenLayoutOverride: () => noop,
  useScreenLayoutOverrideChange: () => noop,
  useScreenLayoutOverrideRevert: () => noop,
}));
vi.mock("../src/lib/useAuthStatus", () => ({
  useAuthStatus: () => ({ role: "admin" }),
}));

import { StudioCopyApplier } from "../src/features/studio/StudioCopyApplier";
import { StudioCopyManager } from "../src/features/studio/StudioCopyManager";
import { StudioCopySpot } from "../src/features/studio/StudioCopySpot";
import { StudioProvider } from "../src/features/studio/StudioContext";
import { StudioEditorLayer } from "../src/features/studio/StudioEditorLayer";

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

type Row = ConstructorParameters<typeof StudioCopyManager>[0][number];

/** An in-memory stand-in for the saved-wording table. */
function store() {
  const rows: Row[] = [];
  const manager = () =>
    new StudioCopyManager(
      rows,
      async (args) => {
        rows.push({
          ...args,
          _id: `row-${rows.length}` as Row["_id"],
          version: 1,
          deletedAt: null,
        });
      },
      async ({ docId, version: _version, ...args }) => {
        const row = rows.find((item) => item._id === docId)!;
        Object.assign(row, args, {
          deletedAt: null,
          version: (row.version ?? 0) + 1,
        });
      },
      async ({ docId }) => {
        rows.find((item) => item._id === docId)!.deletedAt = Date.now();
      },
    );
  return { rows, manager };
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("screen editor saved wording", () => {
  it("updates the same row on a second edit and restores the true original", async () => {
    document.body.innerHTML = `<main data-copy><h1>Prep list</h1></main>`;
    const heading = document.querySelector("h1")!;
    const db = store();
    const apply = () => new StudioCopyApplier(db.rows).apply("/kitchen");

    const first = StudioCopySpot.fromElement(heading, "/kitchen")!;
    await db.manager().save(first, "Today's prep");
    apply();
    expect(heading.textContent).toBe("Today's prep");

    // Pick the spot again while it shows the saved words.
    const second = StudioCopySpot.fromElement(heading, "/kitchen")!;
    expect(second.copyKey).toBe(first.copyKey);
    expect(db.manager().matching(second)?.text).toBe("Today's prep");
    expect(db.manager().originalText(second)).toBe("Prep list");
    await db.manager().save(second, "Kitchen prep");
    apply();

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      originalText: "Prep list",
      text: "Kitchen prep",
    });
    expect(heading.textContent).toBe("Kitchen prep");

    await db.manager().revertKey("/kitchen", db.rows[0]!.copyKey);
    apply();
    expect(heading.textContent).toBe("Prep list");

    // Editing after a restore brings the same row back to life.
    const third = StudioCopySpot.fromElement(heading, "/kitchen")!;
    await db.manager().save(third, "Prep for today");
    apply();
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]!.deletedAt).toBeNull();
    expect(heading.textContent).toBe("Prep for today");
  });

  it("keeps saved words that hold a number and settles after one pass", async () => {
    document.body.innerHTML = `<main data-copy><h1>Dishes</h1></main>`;
    const heading = document.querySelector("h1")!;
    const db = store();
    const apply = () => new StudioCopyApplier(db.rows).apply("/kitchen");
    await db
      .manager()
      .save(StudioCopySpot.fromElement(heading, "/kitchen")!, "Top 10 dishes");
    const writes = vi.fn();
    const observer = new MutationObserver(writes);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    apply();
    await Promise.resolve();
    writes.mockClear();
    // The page watcher runs the applier again after its own write: it must
    // leave the saved words alone, not flip back to the first words.
    apply();
    await Promise.resolve();
    observer.disconnect();
    expect(heading.textContent).toBe("Top 10 dishes");
    expect(writes).not.toHaveBeenCalled();

    // The spot can still be picked and changed while it shows them.
    const again = StudioCopySpot.fromElement(heading, "/kitchen");
    expect(again?.copyKey).toBeDefined();
    expect(db.manager().originalText(again!)).toBe("Dishes");
  });

  it("keeps a second edit made after a restore, as the live list hides restored rows", async () => {
    document.body.innerHTML = `<main data-copy><h1>Dishes</h1></main>`;
    const heading = document.querySelector("h1")!;
    const rows: Row[] = [];
    const seenKeys = new Set<string>();
    // Like the real backend: the list shows live rows only, and a create
    // with a key it has seen before replays and writes nothing.
    const manager = () =>
      new StudioCopyManager(
        rows.filter((row) => row.deletedAt == null),
        async ({ idempotencyKey, ...args }) => {
          if (idempotencyKey && seenKeys.has(idempotencyKey)) return;
          if (idempotencyKey) seenKeys.add(idempotencyKey);
          rows.push({
            ...args,
            _id: `row-${rows.length}` as Row["_id"],
            version: 1,
            deletedAt: null,
          });
        },
        async () => {},
        async ({ docId }) => {
          rows.find((item) => item._id === docId)!.deletedAt = Date.now();
        },
      );
    const spot = () => StudioCopySpot.fromElement(heading, "/kitchen")!;
    await manager().save(spot(), "Our dishes");
    await manager().revertKey("/kitchen", spot().copyKey);
    await manager().save(spot(), "All dishes");
    expect(
      manager()
        .liveOn("/kitchen")
        .map((row) => row.text),
    ).toEqual(["All dishes"]);
  });

  it("typing the first words back restores them", async () => {
    document.body.innerHTML = `<main data-copy><h1>Prep list</h1></main>`;
    const heading = document.querySelector("h1")!;
    const db = store();
    await db
      .manager()
      .save(StudioCopySpot.fromElement(heading, "/kitchen")!, "Prep");
    new StudioCopyApplier(db.rows).apply("/kitchen");
    await db
      .manager()
      .save(StudioCopySpot.fromElement(heading, "/kitchen")!, "Prep list");
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]!.deletedAt).not.toBeNull();
  });

  it("never turns record names, money, dates or counts into saved wording", () => {
    document.body.innerHTML = `<main>
      <h1 id="dish">Chicken Marsala</h1>
      <nav data-copy>
        <a href="/menus">Menus</a>
        <span data-copy="live">Ashley's Wedding</span>
        <span id="price">$42.50</span>
        <span id="date">Oct 18</span>
        <span id="count">120 guests</span>
      </nav>
    </main>`;
    const pick = (selector: string) =>
      StudioCopySpot.fromElement(
        document.querySelector(selector)!,
        "/kitchen/dishes/:id",
      );
    // An unmarked record name, a live part inside a marked area, money, a
    // date and a count are all refused; marked interface words are offered.
    expect(pick("#dish")).toBeNull();
    expect(pick("[data-copy='live']")).toBeNull();
    expect(pick("#price")).toBeNull();
    expect(pick("#date")).toBeNull();
    expect(pick("#count")).toBeNull();
    expect(pick("a")?.originalText).toBe("Menus");

    // A saved row that points at a record name never changes it.
    new StudioCopyApplier([
      {
        pagePattern: "/kitchen/dishes/:id",
        copyKey: "body > main > h1",
        originalText: "Chicken Marsala",
        text: "Beef Stew",
        targetSelector: "#dish",
      },
    ]).apply("/kitchen/dishes/:id");
    expect(document.querySelector("#dish")!.textContent).toBe(
      "Chicken Marsala",
    );
  });

  it("offers no split label and no control with its own screen-reader name", () => {
    document.body.innerHTML = `<main data-copy>
      <a href="/orders">Orders <b>3</b></a>
      <button aria-label="Delete the chicken dish">Delete</button>
    </main>`;
    expect(
      StudioCopySpot.fromElement(document.querySelector("a")!, "/kitchen"),
    ).toBeNull();
    expect(
      StudioCopySpot.fromElement(document.querySelector("button")!, "/kitchen"),
    ).toBeNull();
  });

  it("keeps a named control's screen-reader name in step through edit, re-edit and restore", async () => {
    document.body.innerHTML = `<main data-copy>
      <button aria-label="Save"><svg></svg>Save</button>
      <a href="/menus" aria-label="Menus"><span>Menus</span></a>
    </main>`;
    const button = document.querySelector("button")!;
    const span = document.querySelector("span")!;
    const link = document.querySelector("a")!;
    const db = store();
    const apply = () => new StudioCopyApplier(db.rows).apply("/kitchen");

    await db
      .manager()
      .save(StudioCopySpot.fromElement(button, "/kitchen")!, "Keep");
    await db
      .manager()
      .save(StudioCopySpot.fromElement(span, "/kitchen")!, "Our menus");
    apply();
    expect(button.textContent).toBe("Keep");
    expect(button.getAttribute("aria-label")).toBe("Keep");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(link.getAttribute("aria-label")).toBe("Our menus");

    await db
      .manager()
      .save(StudioCopySpot.fromElement(button, "/kitchen")!, "Keep it");
    apply();
    expect(db.rows).toHaveLength(2);
    expect(button.textContent).toBe("Keep it");
    expect(button.getAttribute("aria-label")).toBe("Keep it");

    for (const row of [...db.rows])
      await db.manager().revertKey("/kitchen", row.copyKey);
    apply();
    expect(button.textContent).toBe("Save");
    expect(button.getAttribute("aria-label")).toBe("Save");
    expect(span.textContent).toBe("Menus");
    expect(link.getAttribute("aria-label")).toBe("Menus");
  });

  it("keeps editor actions off until saved edits have loaded", () => {
    queries.copy = undefined;
    queries.layout = undefined;
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const render = () =>
      act(() =>
        root!.render(
          createElement(
            MemoryRouter,
            { initialEntries: ["/kitchen"] },
            createElement(
              StudioProvider,
              null,
              createElement(StudioEditorLayer),
            ),
          ),
        ),
      );
    render();
    const button = (label: string) =>
      Array.from(document.querySelectorAll("button")).find(
        (node) => node.textContent?.trim() === label,
      );
    act(() => button("Edit app")!.click());
    expect(button("Edit a spot")!.disabled).toBe(true);
    expect(document.body.textContent).toContain("Loading saved edits");

    // One list arrives; still loading.
    queries.copy = [];
    render();
    expect(button("Edit a spot")!.disabled).toBe(true);

    queries.layout = [];
    render();
    expect(button("Edit a spot")!.disabled).toBe(false);
    expect(document.body.textContent).toContain("No edits on this screen yet.");
  });
});
