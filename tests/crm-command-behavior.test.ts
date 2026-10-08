// @vitest-environment jsdom
import { act, createElement } from "react";
import { expect, it, vi } from "vitest";
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
// Scoped and paged reads answer from the rows the test gives each table's
// generated list hook.
vi.mock("../src/lib/financeScopedQueries", async () => {
  const { financeScopedMock, fromListHooks } =
    await import("./helpers/financeScopedQueriesMock");
  const { backend } = await import("./support/mounted-app");
  return financeScopedMock(fromListHooks(backend.values));
});

/** Proposal rows open to show their tools, as a user would open them. */
async function openProposalRows() {
  for (const open of [...container.querySelectorAll("button")].filter(
    (node) => node.textContent === "Open",
  ))
    await click(open);
}
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
    sectionOrder: [],
  });
  await click(button("Archive"));
  // Archive is one click — reversible via Reactivate below, so it carries
  // the standard reason instead of demanding a typed one.
  expect(archive).toHaveBeenCalledExactlyOnceWith({
    docId: "template-a",
    reason: "Archived in review",
  });
  backend.values.set("useListProposalTemplate", [
    { ...row, status: "archived" },
  ]);
  await mount(createElement(ProposalTemplatesPage));
  await click(button("Reactivate"));
  expect(reactivate).toHaveBeenCalledExactlyOnceWith({ docId: "template-a" });
});
// AC-259: staff move sections on the template; the saved order follows.
it("saves the section order staff set on a proposal template", async () => {
  backend.values.set("useListProposalTemplate", [
    {
      _id: "template-b",
      name: "Wedding",
      status: "active",
      visibleSections: [],
      sectionOrder: ["pricing_summary"],
    },
  ]);
  const revise = command("useProposalTemplateRevise");
  await mount(createElement(ProposalTemplatesPage));
  await click(button("Revise"));
  expect(button("Move Pricing Summary up").disabled).toBe(true);
  await click(button("Move Terms & Conditions up"));
  await click(button("Move Terms & Conditions up"));
  await click(button("Save changes"));
  expect(revise.mock.calls[0]?.[0]).toMatchObject({
    docId: "template-b",
    sectionOrder: [
      "pricing_summary",
      "event_summary",
      "menu_sections",
      "timeline",
      "terms",
      "venue_logistics",
      "enhancements",
      "acceptance_cta",
    ],
  });
});
// AC-255: share, copy, revoke and replace a proposal link from the list.
it("shares, copies, revokes and replaces a proposal link", async () => {
  const writeText = vi.fn(async (_text: string) => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const sent = {
    _id: "proposal-s",
    title: "Supper",
    status: "sent",
    version: 2,
    clientId: "client-a",
  };
  backend.values.set("useListProposal", [sent]);
  backend.values.set("useListProposalRevision", [
    { _id: "revision-1", proposalId: "proposal-s", revisionNumber: 1 },
  ]);
  const create = command("useShareLinkCreate", { _id: "link-1" });
  const revoke = command("useShareLinkRevoke");

  // Share: a new link pinned to the published revision, copied at once.
  await mount(createElement(ProposalsPage));
  await openProposalRows();
  await click(button("Share link"));
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]?.[0]).toMatchObject({
    proposalId: "proposal-s",
    proposalRevisionId: "revision-1",
  });
  expect(writeText).toHaveBeenLastCalledWith(
    `${window.location.origin}/share/link-1`,
  );

  // Copy: the working link is copied again, no second link is made.
  const active = {
    _id: "link-1",
    proposalId: "proposal-s",
    status: "active",
    version: 1,
    createdAt: 1,
  };
  backend.values.set("useListShareLink", [active]);
  await mount(createElement(ProposalsPage));
  await openProposalRows();
  await click(button("Copy link"));
  expect(create).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenLastCalledWith(
    `${window.location.origin}/share/link-1`,
  );

  // Revoke: confirmed, then the link is switched off.
  await click(button("Revoke link"));
  await act(async () => new Promise((done) => setTimeout(done, 450)));
  const confirm = container.querySelector<HTMLButtonElement>(
    '[data-testid="action-prompt-confirm"]',
  );
  expect(confirm?.textContent).toBe("Revoke link");
  await click(confirm!);
  expect(revoke).toHaveBeenCalledExactlyOnceWith({
    docId: "link-1",
    version: 1,
  });

  // Replace: with the old link revoked, sharing makes a new one.
  backend.values.set("useListShareLink", [{ ...active, status: "revoked" }]);
  create.mockResolvedValue({ _id: "link-2" });
  await mount(createElement(ProposalsPage));
  await openProposalRows();
  await click(button("Share link"));
  expect(create).toHaveBeenCalledTimes(2);
  expect(writeText).toHaveBeenLastCalledWith(
    `${window.location.origin}/share/link-2`,
  );
});
it("reports proposal publication and contract sent-recording as internal status changes", async () => {
  backend.values.set("useListProposal", [
    {
      _id: "proposal-a",
      title: "Supper",
      status: "draft",
      version: 3,
      total: 1200,
    },
  ]);
  const publish = command(
    "lib/proposalRevision:sendProposalWithRevisionCapture",
  );
  await mount(createElement(ProposalsPage));
  await openProposalRows();
  await click(button("Publish proposal"));
  expect(publish).toHaveBeenCalledExactlyOnceWith({
    docId: "proposal-a",
    version: 3,
  });
  expect(container.textContent).toContain("Proposal published.");
  expect(container.textContent).toContain(
    "Press Email the proposal to send the client the PDF",
  );
  backend.values.set("useListContract", [
    { _id: "contract-a", title: "Supper terms", status: "draft", version: 4 },
  ]);
  const send = command("useContractSend");
  await mount(createElement(ContractsPage));
  await click(button("Mark sent"));
  expect(send).toHaveBeenCalledExactlyOnceWith({
    docId: "contract-a",
    version: 4,
  });
  expect(container.textContent).toContain(
    "Contract marked sent in Capsule. Deliver its document or signature link through your external channel.",
  );
});
