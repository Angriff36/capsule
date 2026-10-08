// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it, vi } from "vitest";
import {
  backend,
  container,
  mount,
  button,
  click,
  command,
  input,
  submit,
} from "./support/mounted-app";
// Scoped and paged reads answer from the rows the test gives each table's
// generated list hook.
vi.mock("../src/lib/financeScopedQueries", async () => {
  const { financeScopedMock, fromListHooks } =
    await import("./helpers/financeScopedQueriesMock");
  const { backend } = await import("./support/mounted-app");
  return financeScopedMock(fromListHooks(backend.values));
});
import { LeadPipelinePage } from "../src/features/clients/LeadPipelinePage";

it("persists the edited lead value, stage and probability and links its existing proposal", async () => {
  backend.values.set("useListLead", [
    {
      _id: "lead-a",
      version: 7,
      leadType: "company",
      companyName: "Harborview",
      source: "Referral",
      estimatedValue: 100,
      stage: "new",
      probability: 20,
      capturedAt: 1,
      convertedAt: 1,
      proposalId: "proposal-a",
      clientId: "client-a",
    },
  ]);
  const update = command("useLeadUpdatePipeline");
  await mount(createElement(LeadPipelinePage));
  expect(container.querySelector(".lead-card-editor")).toBeNull();
  await click(button("Move or price"));
  const form = container.querySelector<HTMLFormElement>(".lead-card-editor");
  expect(form).not.toBeNull();
  input("estimatedValue", "500000", form!);
  input("probability", "75", form!);
  input("stage", "proposalSent", form!);
  await submit(form!);
  expect(update).toHaveBeenCalledExactlyOnceWith({
    docId: "lead-a",
    version: 7,
    stage: "proposalSent",
    estimatedValue: 500000,
    probability: 75,
  });
  expect(container.textContent).toContain("Harborview pipeline updated.");
  expect(container.querySelector(".lead-card-editor")).toBeNull();
  expect(
    container.querySelector('a[href="/clients/proposals?proposal=proposal-a"]')
      ?.textContent,
  ).toBe("Open proposal");
});
