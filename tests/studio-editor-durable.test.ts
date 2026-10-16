// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Saved screen-editor wording must survive a button that re-renders its own
// label, and the picker's "Stop (Esc)" must answer a real Escape key.

const copyRows = [
  {
    pagePattern: "/kitchen",
    copyKey: "save-button",
    originalText: "Save",
    text: "Send to kitchen",
    targetSelector: "[data-test-save]",
  },
];
vi.mock("../src/features/studio/StudioContext", () => ({
  useStudio: () => ({
    pagePattern: "/kitchen",
    canEdit: true,
    ready: true,
    copy: { liveOn: () => copyRows, matching: () => null },
    layout: { liveOn: () => [], componentId: () => "PageHeader" },
  }),
}));
vi.mock("../src/lib/useAuthStatus", () => ({
  useAuthStatus: () => ({ role: "admin" }),
}));

import { StudioCopyApplierHost } from "../src/features/studio/StudioCopyApplierHost";
import { StudioEditorLayer } from "../src/features/studio/StudioEditorLayer";

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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

function SaveButton() {
  const [saving, setSaving] = useState(false);
  return createElement(
    "button",
    {
      type: "button",
      "data-test-save": "",
      onClick: () => setSaving((value) => !value),
    },
    saving ? "Saving" : "Save",
  );
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === label,
  );
}

describe("screen editor wording and keys", () => {
  it("brings the saved words back after a button changes its own label", async () => {
    mount(
      createElement(
        "div",
        null,
        createElement(SaveButton),
        createElement(StudioCopyApplierHost),
      ),
    );
    const target = document.querySelector("[data-test-save]")!;
    expect(target.textContent).toBe("Send to kitchen");

    await act(async () => {
      (target as HTMLButtonElement).click();
    });
    expect(target.textContent).toBe("Saving");

    await act(async () => {
      (target as HTMLButtonElement).click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(target.textContent).toBe("Send to kitchen");
  });

  it("stops picking on a real Escape key from the page", () => {
    mount(createElement(StudioEditorLayer));
    act(() => button("Edit app")!.click());
    act(() => button("Edit a spot")!.click());
    expect(button("Stop (Esc)")).toBeDefined();

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(button("Stop (Esc)")).toBeUndefined();
  });

  it("gives every editor control a 40px button or link surface", () => {
    mount(createElement(StudioEditorLayer));
    act(() => button("Edit app")!.click());
    expect(button("Close")!.className).toContain("btn");
    const restore = button("Use original words")!;
    expect(restore.className).toContain("text-link");
    expect(restore.className).toContain("min-h-10");
    act(() => button("Edit a spot")!.click());
    expect(button("Stop (Esc)")!.className).toContain("btn");
  });
});
