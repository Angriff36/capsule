// @vitest-environment jsdom
// Screen comments (src/app/shell/ReviewerToolbar.tsx): owners and admins get
// the Feedback tab on every screen; other staff never see it. Saving a spot
// comment creates the record, then sends it to Claude as a GitHub issue.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const status = vi.hoisted(() => ({ role: "staff" as string | undefined }));
const calls = vi.hoisted(() => ({
  create: vi.fn(async (_args: unknown) => ({ docId: "fb1" })),
  fileIssue: vi.fn(async (_args: unknown) => ({ skipped: "no-token" })),
}));

vi.mock("../src/lib/useAuthStatus", () => ({
  useAuthStatus: () => (status.role ? { role: status.role } : undefined),
}));
vi.mock("convex/react", () => ({ useAction: () => calls.fileIssue }));
vi.mock("../src/lib/api", () => ({
  api: { pageFeedback: { fileIssue: "fileIssue" } },
}));
vi.mock("../src/lib/manifest-convex-react", () => ({
  useListPageFeedback: () => [],
  useCreatePageFeedback: () => calls.create,
  usePageFeedbackMarkResolved: () => vi.fn(),
  usePageFeedbackReopen: () => vi.fn(),
  usePageFeedbackRemove: () => vi.fn(),
}));

import { ReviewerToolbar } from "../src/app/shell/ReviewerToolbar";

let host: HTMLDivElement;
let root: Root;

async function renderAs(role: string | undefined) {
  status.role = role;
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/events"] },
        createElement(ReviewerToolbar),
      ),
    );
  });
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find(
    (b) =>
      b.textContent?.trim() === label ||
      b.getAttribute("aria-label")?.startsWith(label),
  );
  if (!found) throw new Error(`No button "${label}"`);
  return found;
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  calls.create.mockClear();
  calls.fileIssue.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("screen comments", () => {
  it("shows the Feedback tab to owners and admins", async () => {
    await renderAs("owner");
    expect(button("Screen comments")).toBeTruthy();
    await renderAs("admin");
    expect(button("Screen comments")).toBeTruthy();
  });

  it("never shows for other staff or before sign-in finishes", async () => {
    for (const role of ["staff", "kitchen_staff", undefined]) {
      await renderAs(role);
      expect(host.querySelector("button")).toBeNull();
    }
  });

  it("saves a comment on a picked spot and sends it to Claude", async () => {
    const target = document.createElement("h2");
    target.textContent = "Guest count";
    document.body.append(target);
    document.elementsFromPoint = () => [target];
    await renderAs("admin");

    await act(async () => button("Screen comments").click());
    await act(async () => button("Comment on a spot").click());
    const overlay = host.querySelector(".cursor-crosshair") as HTMLElement;
    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }),
      );
    });
    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(textarea, "Show the venue here");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Send").click());

    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pagePath: "/events",
        kind: "improvement",
        body: "Show the venue here",
        targetLabel: 'h2 "Guest count"',
        targetSelector: "body > h2",
      }),
    );
    expect(calls.fileIssue).toHaveBeenCalledWith({ id: "fb1" });
    target.remove();
  });
});
