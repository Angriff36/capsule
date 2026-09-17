// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  change,
  button,
  click,
} from "./support/mounted-app";
import { MessageInboxPage } from "../src/features/sales/MessageInboxPage";

it("logs pasted client mail through the inbox and opens the returned thread", async () => {
  backend.values.set("useListMessageThread", [
    {
      _id: "thread-a",
      provider: "email",
      providerAccountId: "mailbox-a",
      providerThreadId: "external-thread",
      subject: "Harborview menu",
      status: "open",
      version: 1,
    },
  ]);
  const ingest = command("messageInbox:ingestInboundMessage", {
    threadId: "thread-a",
    isDuplicate: false,
    threadCreated: false,
  });
  await mount(createElement(MessageInboxPage));
  await click(button("Paste incoming message"));
  change(
    container.querySelector<HTMLInputElement>('[aria-label="From"]')!,
    " ada@example.test ",
  );
  change(
    container.querySelector<HTMLSelectElement>('[aria-label="Thread"]')!,
    "thread-a",
  );
  change(
    container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Message text"]',
    )!,
    " Please add two vegan meals. ",
  );
  await click(button("Log message"));
  expect(ingest).toHaveBeenCalledExactlyOnceWith({
    provider: "email",
    providerAccountId: "mailbox-a",
    providerThreadId: "external-thread",
    providerMessageId: expect.stringMatching(/^paste:.+/),
    senderIdentity: "ada@example.test",
    bodyText: "Please add two vegan meals.",
  });
  expect(container.textContent).toContain(
    "Logged the message in the existing thread.",
  );
  expect(container.querySelector('[aria-label="Message text"]')).toBeNull();
  expect(container.textContent).toContain("external-thread");
});
