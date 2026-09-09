// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  input,
  button,
  click,
  submit,
} from "./support/mounted-app";
import { QuoteSubmissionsReviewPage } from "../src/features/sales/QuoteSubmissionsReviewPage";

const submission = {
  _id: "submission-a",
  clientName: "Garden Club",
  email: "ada@example.test",
  phone: "555-0123",
  eventDate: new Date(2099, 6, 4).getTime(),
  guestCount: 40,
  serviceStyleId: "style-a",
  occasionId: "occasion-a",
  serviceStyleText: "Custom service",
  occasionText: "Community meal",
  venueName: "Garden",
  venueAddress: "14 Main Street",
  menuPreferences: "Roast vegetables",
  dietaryRestrictions: "No nuts",
  notes: "Use east entrance",
  status: "pending",
  submittedAt: 1,
};
const page = () => createElement(QuoteSubmissionsReviewPage);

it("renders the submitted details, resolves retired catalog names, falls back to free text, and explains an offline public form", async () => {
  backend.values.set("useListQuoteSubmission", [submission]);
  backend.values.set("useListServiceStyle", [
    { _id: "style-a", name: "Plated service", status: "inactive" },
  ]);
  backend.values.set("useListOccasion", [
    { _id: "occasion-a", name: "Anniversary", status: "inactive" },
  ]);
  await mount(page());
  for (const text of [
    "Garden Club",
    "ada@example.test",
    "555-0123",
    "40 guests",
    "Plated service",
    "Anniversary",
    "Garden — 14 Main Street",
    "Roast vegetables",
    "No nuts",
    "Use east entrance",
    "2099",
  ])
    expect(container.textContent).toContain(text);
  expect(container.textContent).toContain("public quote form is offline");
  expect(container.querySelector('a[href="/admin/branding"]')).not.toBeNull();
  backend.values.set("useListOrganization", [
    { _id: "org-a", status: "active" },
  ]);
  backend.values.set("useListServiceStyle", []);
  backend.values.set("useListOccasion", []);
  await mount(page());
  expect(container.textContent).toContain("Custom service");
  expect(container.textContent).toContain("Community meal");
  expect(container.textContent).not.toContain("public quote form is offline");
});

it("dismisses with the entered reason and keeps the returned dismissed request reachable through the toggle", async () => {
  backend.values.set("useListQuoteSubmission", [submission]);
  const dismiss = command("useQuoteSubmissionDismiss");
  await mount(page());
  await click(button("Dismiss"));
  expect(dismiss).not.toHaveBeenCalled();
  input("reason", "Client withdrew");
  await submit(
    container.querySelector<HTMLFormElement>("[data-action-prompt]")!,
  );
  expect(dismiss).toHaveBeenCalledExactlyOnceWith({
    docId: "submission-a",
    reason: "Client withdrew",
  });
  backend.values.set("useListQuoteSubmission", [
    { ...submission, status: "dismissed", errorMessage: "Client withdrew" },
  ]);
  await mount(page());
  expect(container.textContent).not.toContain("Garden Club");
  await click(button("Show dismissed (1)"));
  expect(container.textContent).toContain("Garden Club");
  expect(container.textContent).toContain("Dismissed — Client withdrew");
  expect(container.textContent).toContain("No nuts");
});

it("links records from an incomplete conversion and retries the same submission only after reopening succeeds", async () => {
  backend.values.set("useListQuoteSubmission", [
    {
      ...submission,
      status: "failed",
      clientId: "client-a",
      eventId: "event-a",
      leadId: "lead-a",
      proposalId: "proposal-a",
      processingErrors: "Could not finish proposal",
    },
  ]);
  const retry = command("useQuoteSubmissionRetry");
  const process = command("quoteBuilder:processQuoteSubmission", {
    errors: [],
    clientId: "client-a",
    eventId: "event-a",
    leadId: "lead-a",
    proposalId: "proposal-a",
  });
  retry.mockRejectedValueOnce(new Error("Temporary failure"));
  await mount(page());
  expect(container.textContent).toContain("Created before the failure");
  expect(
    container.querySelector('a[href="/clients/proposals?proposal=proposal-a"]'),
  ).not.toBeNull();
  expect(container.querySelector('a[href="/events/event-a"]')).not.toBeNull();
  expect(container.querySelector('a[href="/clients/client-a"]')).not.toBeNull();
  await click(button("Retry conversion"));
  expect(process).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Temporary failure");
  await click(button("Retry conversion"));
  expect(retry).toHaveBeenLastCalledWith({ docId: "submission-a" });
  expect(process).toHaveBeenCalledExactlyOnceWith({
    submissionId: "submission-a",
  });
  expect(retry.mock.invocationCallOrder[1]).toBeLessThan(
    process.mock.invocationCallOrder[0],
  );
  expect(container.textContent).toContain(
    "Converted “Garden Club” into a lead, event, and draft proposal.",
  );
});
