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
import { ProposalTemplatesPage } from "../src/features/clients/ProposalTemplatesPage";
import { ProposalsPage } from "../src/features/clients/ProposalsPage";
import { ContractsPage } from "../src/features/clients/ContractsPage";

it("revises, archives and reactivates the selected proposal template", async () => {
  const row = {
    _id: "template-a",
    name: "Dinner",
    status: "active",
    defaultTaxRate: 0.085,
    visibleSections: ["terms"],
  };
  backend.values.set("useListProposalTemplate", [row]);
  const revise = command("useProposalTemplateRevise"),
    archive = command("useProposalTemplateArchive"),
    reactivate = command("useProposalTemplateReactivate");
  await mount(createElement(ProposalTemplatesPage));
  await click(button("Revise"));
  input("name", "Supper");
  await click(button("Save changes"));
  expect(revise).toHaveBeenCalledExactlyOnceWith({
    docId: "template-a",
    name: "Supper",
    description: undefined,
    visibleSections: ["terms"],
    defaultTerms: undefined,
    defaultNotes: undefined,
    defaultTaxRate: 0.085,
    defaultServiceChargePercent: undefined,
    validityDays: undefined,
  });
  await click(button("Archive"));
  expect(archive).not.toHaveBeenCalled();
  input("reason", "Replaced by the supper template");
  await submit(
    container.querySelector<HTMLFormElement>("[data-action-prompt]")!,
  );
  expect(archive).toHaveBeenCalledExactlyOnceWith({
    docId: "template-a",
    reason: "Replaced by the supper template",
  });
  backend.values.set("useListProposalTemplate", [
    { ...row, status: "archived" },
  ]);
  await mount(createElement(ProposalTemplatesPage));
  await click(button("Reactivate"));
  expect(reactivate).toHaveBeenCalledExactlyOnceWith({ docId: "template-a" });
});
it("reports proposal publication and contract sent-recording as internal status changes", async () => {
  backend.values.set("useListProposal", [
    { _id: "proposal-a", title: "Supper", status: "draft", version: 3 },
  ]);
  const publish = command(
    "lib/proposalRevision:sendProposalWithRevisionCapture",
  );
  await mount(createElement(ProposalsPage));
  await click(button("Publish proposal"));
  expect(publish).toHaveBeenCalledExactlyOnceWith({
    docId: "proposal-a",
    version: 3,
  });
  expect(container.textContent).toContain("Proposal published in Capsule.");
  expect(container.textContent).toContain(
    "Capsule does not send it externally.",
  );
  backend.values.set("useListContract", [
    { _id: "contract-a", title: "Supper terms", status: "draft", version: 4 },
  ]);
  const send = command("useContractSend");
  await mount(createElement(ContractsPage));
  await click(button("Record sent"));
  expect(send).toHaveBeenCalledExactlyOnceWith({
    docId: "contract-a",
    version: 4,
  });
  expect(container.textContent).toContain(
    "Contract marked sent in Capsule. Deliver its document or signature link through your external channel.",
  );
});
