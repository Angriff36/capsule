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
  linkEvent: vi.fn(async () => ({})),
  extraThreads: [] as Record<string, unknown>[],
  extraMessages: [] as Record<string, unknown>[],
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
            ...harness.extraThreads,
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
            ...harness.extraMessages,
          ];
        }
        if (prop === "useListEvent") {
          return () => [
            {
              _id: "event-1",
              title: "Smith wedding",
              eventNumber: "6014",
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
        if (prop === "useMessageThreadLinkEvent")
          return () => harness.linkEvent;
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
    harness.linkEvent.mockClear();
    harness.extraThreads = [];
    harness.extraMessages = [];
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
        "Queued — not delivered; no provider is connected",
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

  // PL-INBOX AC-106: every outside delivery state has its own words, and a
  // provider hand-off is never called delivered.
  it("names each delivery state on an outside thread", async () => {
    harness.provider = "email";
    harness.extraMessages = ["sent", "delivered", "bounced", "unknown"].map(
      (status, i) => ({
        _id: `message-${status}`,
        threadId: "thread-1",
        direction: "outbound",
        status,
        bodyText: `Reply ${status}`,
        createdAt: 10 + i,
        deletedAt: null,
      }),
    );
    await renderSelectedThread();
    const text = container.textContent ?? "";
    expect(text).toContain("Accepted by the provider — delivery not confirmed");
    expect(text).toContain("Delivered");
    expect(text).toContain("Bounced — not delivered");
    expect(text).toContain("Delivery not known");
  });

  // PL-INBOX AC-106/AC-249: staff link the conversation to an event.
  it("links the conversation to an event", async () => {
    harness.provider = "email";
    await renderSelectedThread();
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Link event"]',
    )!;
    expect(select.textContent).toContain("#6014 Smith wedding");
    await act(async () => {
      select.value = "event-1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(harness.linkEvent).toHaveBeenCalledWith({
      docId: "thread-1",
      eventId: "event-1",
    });
  });

  // PL-INBOX AC-248 + AC-104/AC-112: a merged duplicate keeps its messages
  // and they show in the target; attachments are named, never linked.
  it("shows merged messages and names attachments without links", async () => {
    harness.provider = "social";
    harness.extraThreads = [
      {
        _id: "thread-2",
        provider: "social",
        subject: "Same client, second chat",
        status: "archived",
        mergedIntoThreadId: "thread-1",
        version: 2,
        deletedAt: null,
      },
    ];
    harness.extraMessages = [
      {
        _id: "message-merged",
        threadId: "thread-2",
        direction: "inbound",
        status: "received",
        bodyText: "Photo of the venue",
        mediaJson: JSON.stringify([
          { id: "m1", kind: "image/jpeg", name: "venue.jpg" },
        ]),
        createdAt: 5,
        deletedAt: null,
      },
    ];
    await renderSelectedThread();
    expect(container.textContent).toContain("Photo of the venue");
    expect(container.textContent).toContain(
      "venue.jpg (image/jpeg) — open it in Social",
    );
    expect(container.querySelector('a[href*="venue.jpg"]')).toBeNull();
  });
});
