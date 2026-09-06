// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageInboxPage } from "../../../src/features/sales/MessageInboxPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  provider: "email",
  createMessage: vi.fn(async () => ({ _id: "message-new" })),
}));

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(async () => ({})),
}));

vi.mock("../../../src/lib/manifest-convex-react", () => {
  const commandHook = () => vi.fn(async () => ({}));
  return new Proxy(
    {},
    {
      has: () => true,
      get(_target, prop) {
        if (typeof prop !== "string" || prop === "then" || prop === "default")
          return undefined;
        if (prop === "useListMessageThread") {
          return () => [
            {
              _id: "thread-1",
              provider: harness.provider,
              subject: "Client question",
              status: "open",
              version: 1,
              deletedAt: null,
            },
          ];
        }
        if (prop === "useListMessage") {
          return () => [
            {
              _id: "message-old",
              threadId: "thread-1",
              direction: "outbound",
              status: "queued",
              bodyText: "Legacy draft",
              createdAt: 1,
              deletedAt: null,
            },
          ];
        }
        if (
          prop === "useListLead" ||
          prop === "useListClientContact" ||
          prop === "useListSyncError"
        )
          return () => [];
        if (prop === "useCreateMessage") return () => harness.createMessage;
        return commandHook;
      },
    },
  );
});

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("MessageInboxPage delivery honesty", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    harness.createMessage.mockClear();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderSelectedThread() {
    await act(async () => {
      root.render(
        createElement(MemoryRouter, {}, createElement(MessageInboxPage)),
      );
    });
    const thread = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.includes("Client question"),
    );
    act(() => thread?.click());
  }

  for (const provider of ["email", "sms", "social", "other"]) {
    it(`keeps the ${provider} draft and creates no row when only manual delivery is available`, async () => {
      harness.provider = provider;
      await renderSelectedThread();

      const input = container.querySelector<HTMLInputElement>(
        'input[aria-label="Reply text"]',
      )!;
      setInputValue(input, "Please review this draft");

      expect(container.textContent).toContain(
        "No external delivery provider is connected",
      );
      expect(container.textContent).toContain(
        "Legacy queued — not delivered; no provider is connected",
      );
      const action = Array.from(container.querySelectorAll("button")).find(
        (node) => node.textContent === "Copy draft",
      );
      await act(async () => action?.click());

      expect(input.value).toBe("Please review this draft");
      expect(harness.createMessage).not.toHaveBeenCalled();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "Please review this draft",
      );
    });
  }

  it("records an internal note and clears its draft", async () => {
    harness.provider = "internal";
    await renderSelectedThread();
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Reply text"]',
    )!;
    setInputValue(input, "Called client and left voicemail");
    const action = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent === "Log note",
    );
    await act(async () => action?.click());

    expect(harness.createMessage).toHaveBeenCalledWith({
      threadId: "thread-1",
      direction: "outbound",
      status: "sent",
      bodyText: "Called client and left voicemail",
    });
    expect(input.value).toBe("");
  });
});
