// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PasteIncomingMessageForm,
  type PasteIncomingMessageFormProps,
} from "../../../src/features/sales/PasteIncomingMessageForm";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RAW_JSON_TEXTAREA = '[aria-label="Raw provider message payload"]';

function makeProps(
  overrides: Partial<PasteIncomingMessageFormProps> = {},
): PasteIncomingMessageFormProps {
  return {
    threads: [],
    ingestMessage: vi.fn().mockResolvedValue({
      threadId: "t1",
      isDuplicate: false,
      threadCreated: true,
    }),
    ingestEnvelope: vi.fn().mockResolvedValue({
      recorded: "ingested",
      threadId: "t1",
    }),
    onLogged: vi.fn(),
    onRejected: vi.fn(),
    onFailure: vi.fn(),
    ...overrides,
  };
}

function setFieldValue(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  act(() => {
    const proto = Object.getPrototypeOf(field) as object;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitForm(container: HTMLElement): Promise<void> {
  const form = container.querySelector("form");
  if (!form) throw new Error("form not rendered");
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

describe("PasteIncomingMessageForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function render(props: PasteIncomingMessageFormProps): void {
    act(() => {
      root.render(createElement(PasteIncomingMessageForm, props));
    });
  }

  it("defaults to a human form — NOT a raw JSON textarea", () => {
    render(makeProps());
    // A sales coordinator sees plain fields: who it's from and what they said.
    expect(container.querySelector('[aria-label="From"]')).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Message text"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="Thread"]')).not.toBeNull();
    // The raw JSON payload textarea must NOT be the default UI.
    expect(container.querySelector(RAW_JSON_TEXTAREA)).toBeNull();
    expect(container.innerHTML).not.toContain('"threadId"');
    expect(container.innerHTML).not.toContain('"messageId"');
  });

  it("submits the human form through the same ingest action (thread + message records)", async () => {
    const props = makeProps();
    render(props);

    setFieldValue(
      container.querySelector('[aria-label="From"]') as HTMLInputElement,
      "pat@client.example",
    );
    setFieldValue(
      container.querySelector(
        '[aria-label="Message text"]',
      ) as HTMLTextAreaElement,
      "Can you cater 40 people on the 12th?",
    );
    await submitForm(container);

    expect(props.ingestMessage).toHaveBeenCalledTimes(1);
    const args = vi.mocked(props.ingestMessage).mock.calls[0]![0];
    expect(args.provider).toBe("email");
    expect(args.senderIdentity).toBe("pat@client.example");
    expect(args.bodyText).toBe("Can you cater 40 people on the 12th?");
    // No thread chosen → a fresh provider thread/message key is generated so
    // the idempotent ingest opens a new thread.
    expect(args.providerThreadId).toBeTruthy();
    expect(args.providerMessageId).toBeTruthy();
    expect(props.onLogged).toHaveBeenCalledWith(
      "Started a new thread and logged the message.",
      "t1",
    );
  });

  it("logs into a chosen existing thread using that thread's provider identity", async () => {
    const props = makeProps({
      threads: [
        {
          _id: "thread-a",
          provider: "email",
          providerAccountId: "acct-1",
          providerThreadId: "ext-thread-9",
          subject: "Tasting follow-up",
        },
      ],
    });
    render(props);

    setFieldValue(
      container.querySelector('[aria-label="Thread"]') as HTMLSelectElement,
      "thread-a",
    );
    setFieldValue(
      container.querySelector('[aria-label="From"]') as HTMLInputElement,
      "pat@client.example",
    );
    setFieldValue(
      container.querySelector(
        '[aria-label="Message text"]',
      ) as HTMLTextAreaElement,
      "Yes, let's confirm.",
    );
    await submitForm(container);

    const args = vi.mocked(props.ingestMessage).mock.calls[0]![0];
    expect(args.providerThreadId).toBe("ext-thread-9");
    expect(args.providerAccountId).toBe("acct-1");
  });

  it("keeps raw JSON available only behind the Advanced toggle", async () => {
    const props = makeProps();
    render(props);

    const toggle = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Advanced"),
    );
    expect(toggle).toBeDefined();
    act(() => toggle!.click());

    const jsonField = container.querySelector(
      RAW_JSON_TEXTAREA,
    ) as HTMLTextAreaElement | null;
    expect(jsonField).not.toBeNull();

    setFieldValue(jsonField!, '{"threadId":"x","messageId":"y","body":"hi"}');
    await submitForm(container);

    expect(props.ingestEnvelope).toHaveBeenCalledWith({
      provider: "email",
      rawJson: '{"threadId":"x","messageId":"y","body":"hi"}',
    });
    expect(props.ingestMessage).not.toHaveBeenCalled();
  });
});

describe("MessageInboxPage paste wiring", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/features/sales/MessageInboxPage.tsx"),
    "utf8",
  );

  it("renders PasteIncomingMessageForm for the paste flow", () => {
    expect(source).toContain("PasteIncomingMessageForm");
  });

  it("no longer ships an inline raw-JSON textarea as the paste default", () => {
    expect(source).not.toContain('"threadId": "…"');
    expect(source).not.toContain("Raw provider message payload");
  });
});
