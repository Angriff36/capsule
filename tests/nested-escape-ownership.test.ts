// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ActionMenu } from "../src/ui/primitives";
import { RecordPreviewSheet } from "../src/ui/RecordPreviewSheet";

// AC-171: nested dialogs keep Escape ownership. The innermost open thing
// (a menu in a sheet) closes first; the sheet closes only on the next press.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mountSheet(onClose: () => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      createElement(RecordPreviewSheet, {
        open: true,
        title: "Dana Reyes",
        onClose,
        children: createElement(ActionMenu, {
          children: createElement("button", { type: "button" }, "Archive"),
        }),
      }),
    ),
  );
}

function escape(target: EventTarget = document.activeElement ?? document) {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

it("an open menu inside a sheet takes the first Escape and keeps the sheet open", () => {
  const onClose = vi.fn();
  mountSheet(onClose);
  const menu = document.querySelector<HTMLDetailsElement>("details")!;
  menu.open = true;

  const first = escape(menu.querySelector("button")!);
  expect(menu.open).toBe(false);
  // The press is marked as used, so a native <dialog> around it does not
  // cancel either.
  expect(first.defaultPrevented).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  // Focus goes back to the menu button, still inside the sheet.
  expect(document.activeElement).toBe(menu.querySelector("summary"));

  escape();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("a closed menu leaves Escape to the sheet", () => {
  const onClose = vi.fn();
  mountSheet(onClose);
  escape();
  expect(onClose).toHaveBeenCalledTimes(1);
});
