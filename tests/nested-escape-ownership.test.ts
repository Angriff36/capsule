// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../src/ui/DropdownMenu";
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
        children: createElement(
          DropdownMenu,
          null,
          createElement(
            DropdownMenuTrigger,
            { asChild: true },
            createElement("button", { type: "button" }, "More"),
          ),
          createElement(
            DropdownMenuContent,
            null,
            createElement(DropdownMenuItem, null, "Archive"),
          ),
        ),
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

it("an open menu inside a sheet takes the first Escape and keeps the sheet open", async () => {
  const onClose = vi.fn();
  mountSheet(onClose);
  const trigger = document.querySelector<HTMLButtonElement>(
    "button[aria-haspopup='menu']",
  )!;
  act(() => {
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(document.querySelector("[role='menu']")).not.toBeNull();

  const first = escape(document.querySelector("[role='menuitem']")!);
  expect(document.querySelector("[role='menu']")).toBeNull();
  // The press is marked as used, so a native <dialog> around it does not
  // cancel either.
  expect(first.defaultPrevented).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  // Focus goes back to the menu button, still inside the sheet.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(document.activeElement).toBe(trigger);

  escape();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("a closed menu leaves Escape to the sheet", () => {
  const onClose = vi.fn();
  mountSheet(onClose);
  escape();
  expect(onClose).toHaveBeenCalledTimes(1);
});
