// @vitest-environment jsdom
// AC-166 (PL-STALE-ASSETS): an old open page learns a newer Capsule is live,
// says so with both versions, and a reload (or a missing screen file) keeps
// every unsaved form draft.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewVersionBanner } from "../src/app/shell/NewVersionBanner";
import {
  fetchLiveBuild,
  isMissingCodeError,
  newerBuild,
} from "../src/app/shell/newVersion";
import { RouteErrorBoundary } from "../src/app/shell/RouteErrorBoundary";
import { useFormDraft } from "../src/ui/formDraft";
import { hasUnsavedDrafts, saveUnsavedDrafts } from "../src/ui/unsavedDrafts";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OLD = "a".repeat(40);
const NEW = "b".repeat(40);

function DraftForm() {
  const { formRef } = useFormDraft("stale-test");
  return createElement(
    "form",
    { ref: formRef },
    createElement("input", { name: "title", defaultValue: "" }),
  );
}

function typeInto(container: HTMLElement, value: string) {
  const input = container.querySelector("input") as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function storedDraft() {
  const raw = localStorage.getItem("capsule:draft:stale-test");
  return raw ? (JSON.parse(raw) as { values: Record<string, string> }) : null;
}

describe("which version is live", () => {
  it("names a newer commit only when both are known and differ", () => {
    expect(newerBuild(OLD, NEW)).toBe(NEW);
    expect(newerBuild(OLD, OLD)).toBeNull();
    expect(newerBuild(OLD, null)).toBeNull();
    expect(newerBuild(null, NEW)).toBeNull();
  });

  it("reads version.json; offline or a page answer is no answer", async () => {
    const json = vi.fn(
      async () => new Response(JSON.stringify({ commit: NEW })),
    ) as unknown as typeof fetch;
    expect(await fetchLiveBuild(json)).toBe(NEW);
    const html = vi.fn(
      async () => new Response("<!doctype html><html></html>"),
    ) as unknown as typeof fetch;
    expect(await fetchLiveBuild(html)).toBeNull();
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await fetchLiveBuild(offline)).toBeNull();
  });

  it("knows the browsers' words for a missing screen file", () => {
    expect(
      isMissingCodeError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://x/assets/Page-1.js",
        ),
      ),
    ).toBe(true);
    expect(
      isMissingCodeError(new TypeError("Importing a module script failed.")),
    ).toBe(true);
    expect(isMissingCodeError(new Error("Server Error"))).toBe(false);
  });
});

describe("old page with unsaved work", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows both versions when a newer one is live, and nothing otherwise", async () => {
    await act(async () => {
      root.render(
        createElement(NewVersionBanner, {
          running: OLD,
          checkLive: async () => NEW,
        }),
      );
    });
    const text = container.textContent ?? "";
    expect(text).toContain("A newer version of Capsule is out");
    expect(text).toContain("aaaaaaa");
    expect(text).toContain("bbbbbbb");

    await act(async () => {
      root.render(
        createElement(NewVersionBanner, {
          running: OLD,
          checkLive: async () => OLD,
        }),
      );
    });
    expect(container.textContent).toBe("");

    await act(async () => {
      root.render(
        createElement(NewVersionBanner, {
          running: OLD,
          checkLive: async () => null,
        }),
      );
    });
    expect(container.textContent).toBe("");
  });

  it("writes the draft at once (inside the save delay) before a reload", () => {
    act(() => root.render(createElement(DraftForm)));
    act(() => typeInto(container, "Smith wedding"));
    expect(storedDraft()).toBeNull(); // still inside the 600 ms delay
    expect(hasUnsavedDrafts()).toBe(true);
    saveUnsavedDrafts();
    expect(storedDraft()?.values.title).toBe("Smith wedding");
    expect(hasUnsavedDrafts()).toBe(false); // guard dropped, draft is safe
  });

  it("keeps the last edits when the form leaves the screen inside the delay", () => {
    act(() => root.render(createElement(DraftForm)));
    act(() => typeInto(container, "Jones lunch"));
    act(() => root.render(createElement("div")));
    expect(storedDraft()?.values.title).toBe("Jones lunch");
  });

  it("a missing screen file explains the update and its button keeps drafts", () => {
    function MissingScreen(): null {
      throw new TypeError(
        "Failed to fetch dynamically imported module: https://x/assets/Gone-1.js",
      );
    }
    act(() =>
      root.render(
        createElement(
          MemoryRouter,
          {},
          createElement(DraftForm),
          createElement(RouteErrorBoundary, {
            children: createElement(MissingScreen),
          }),
        ),
      ),
    );
    expect(container.textContent).toContain(
      "Capsule was updated while this page was open",
    );
    act(() => typeInto(container, "Corporate picnic"));
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Try again",
    ) as HTMLButtonElement;
    act(() => button.click()); // jsdom does not navigate; the save is the proof
    expect(storedDraft()?.values.title).toBe("Corporate picnic");
  });
});
