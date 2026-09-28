/**
 * Runtime proof (AC-388 readiness slice): the invoice, proposal and closeout
 * reconciliations keep a bill, proposal or closeout a person changed, sent,
 * accepted or finalized and flag it on the section 8.2 receipt. The live event
 * readiness view now shows that flag to the office (section 8.3) with the
 * command that settles it in the status the record has now, and drops it once
 * that command runs, a person edits the record, or the event moves back. Each
 * test runs the advertised command for real, so an action the record cannot
 * take fails here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  approveEvent,
  createPlannedEvent,
  harness,
  listedInvoiceFacts,
  readEventRow,
  rolesFor,
  runner,
  sendInvoice,
  type InvoiceFactRow,
  type Proof,
  type Role,
} from "./plan-vs-fact-sent-invoice.runtime.helpers";
import {
  captureCloseout,
  correctCommercial,
  finalizeCloseout,
  listedCloseoutFacts,
  rolesFor as closeoutRolesFor,
  walkToStage,
} from "./plan-vs-fact-finalized-closeout.runtime.helpers";
import {
  createPlannedEvent as createHeadcountEvent,
  harness as headcountHarness,
  listedProposals,
  rolesFor as proposalRolesFor,
  runner as proposalRunner,
  seedAcceptedProposal,
} from "./headcount-proposal-reconciliation.runtime.helpers";
import { readEventVersion } from "./single-reconciliation.runtime.helpers";

const QUOTED_PRICE = 4500;
const NEW_PRICE = 5200;
const BUDGET = 3000;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Issue = {
  code: string;
  affectedIds: string[];
  severity: string;
  reason: string;
  resolvingAction: string;
};
type Readiness = {
  domains: Array<{ domain: string; issues: Issue[] }>;
} | null;

async function issuesIn(
  actor: Role,
  eventId: string,
  domain: string,
): Promise<Issue[]> {
  const projection = (await actor.query(api.eventReadiness.getEventReadiness, {
    eventId,
  })) as Readiness;
  expect(projection).not.toBeNull();
  return projection!.domains.find((entry) => entry.domain === domain)!.issues;
}

const flagIssues = (issues: Issue[]) =>
  issues.filter((issue) => /_review$|_change_required$/.test(issue.code));

const flagsIn = async (actor: Role, eventId: string, domain: string) =>
  flagIssues(await issuesIn(actor, eventId, domain));

async function changePricing(
  proof: Proof,
  tenantId: string,
  eventId: string,
  quotedPrice: number,
): Promise<void> {
  const { sales } = rolesFor(proof, tenantId);
  const event = await readEventRow(sales, eventId);
  await runner(proof, sales)(api.mutations.Event_changePricing, {
    docId: eventId,
    version: event.version,
    budgetAmount: BUDGET,
    quotedPrice,
  });
}

async function approvedWithDraft(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; draft: InvoiceFactRow }> {
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  await approveEvent(proof, tenantId, eventId);
  const rows = await listedInvoiceFacts(
    rolesFor(proof, tenantId).finance,
    eventId,
  );
  expect(rows).toHaveLength(1);
  return { eventId, draft: rows[0]! };
}

describe("runtime proof: AC-388 readiness shows records a change did not reach", () => {
  it("a sent bill shows until the price moves back, shows again on a return to the new price, and goes once the bill is voided", async () => {
    const tenantId = "tenant-ac388-flag-sent";
    const proof = harness();
    const { eventId, draft } = await approvedWithDraft(
      proof,
      tenantId,
      "AC-388 flag sent",
    );
    const { finance } = rolesFor(proof, tenantId);
    await sendInvoice(proof, tenantId, draft._id);
    expect(await flagsIn(finance, eventId, "commercial")).toEqual([]);

    await changePricing(proof, tenantId, eventId, NEW_PRICE);

    const flagged = await flagsIn(finance, eventId, "commercial");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.code).toBe("commercial.invoice_change_required");
    expect(flagged[0]!.affectedIds).toEqual([String(draft._id)]);
    expect(flagged[0]!.severity).toBe("warning");
    expect(flagged[0]!.reason).toContain("went to the client");
    expect(flagged[0]!.resolvingAction).toBe("Invoice.markVoided");

    await changePricing(proof, tenantId, eventId, QUOTED_PRICE);
    expect(await flagsIn(finance, eventId, "commercial")).toEqual([]);

    // Back to the new price: the reconciliation finds its earlier receipt and
    // writes nothing, and the flag still shows.
    await changePricing(proof, tenantId, eventId, NEW_PRICE);
    const again = await flagsIn(finance, eventId, "commercial");
    expect(again.map((issue) => issue.code)).toEqual([
      "commercial.invoice_change_required",
    ]);

    const [sent] = await listedInvoiceFacts(finance, eventId);
    expect(sent!.status).toBe("sent");
    await runner(proof, finance)(api.mutations.Invoice_markVoided, {
      docId: sent!._id,
      version: sent!.version,
      reason: "Price changed after sending",
    });
    expect(await flagsIn(finance, eventId, "commercial")).toEqual([]);
  });

  it("a hand-changed draft bill shows for review until finance moves it to the new price", async () => {
    const tenantId = "tenant-ac388-flag-draft";
    const proof = harness();
    const { eventId, draft } = await approvedWithDraft(
      proof,
      tenantId,
      "AC-388 flag draft",
    );
    const { finance } = rolesFor(proof, tenantId);
    await runner(proof, finance)(api.mutations.Invoice_setDeposit, {
      docId: draft._id,
      version: draft.version,
      depositAmount: 1000,
    });

    await changePricing(proof, tenantId, eventId, NEW_PRICE);

    const flagged = await flagsIn(finance, eventId, "commercial");
    expect(flagged.map((issue) => issue.code)).toEqual([
      "commercial.invoice_review",
    ]);
    expect(flagged[0]!.affectedIds).toEqual([String(draft._id)]);
    expect(flagged[0]!.resolvingAction).toBe("Invoice.followEventPrice");

    const [kept] = await listedInvoiceFacts(finance, eventId);
    expect(kept!.status).toBe("draft");
    expect(kept!.total).toBe(QUOTED_PRICE);
    await runner(proof, finance)(api.mutations.Invoice_followEventPrice, {
      docId: kept!._id,
      version: kept!.version,
      total: NEW_PRICE,
    });
    const [saved] = await listedInvoiceFacts(finance, eventId);
    expect(saved!.total).toBe(NEW_PRICE);
    expect(await flagsIn(finance, eventId, "commercial")).toEqual([]);
  });

  it("an untouched draft bill follows the price and shows no flag", async () => {
    const tenantId = "tenant-ac388-flag-none";
    const proof = harness();
    const { eventId } = await approvedWithDraft(
      proof,
      tenantId,
      "AC-388 flag none",
    );
    await changePricing(proof, tenantId, eventId, NEW_PRICE);
    const { finance } = rolesFor(proof, tenantId);
    expect(await flagsIn(finance, eventId, "commercial")).toEqual([]);
  });

  it("a captured draft closeout shows for review until finance captures it again", async () => {
    const tenantId = "tenant-ac388-flag-captured";
    const proof = harness();
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "closed_out",
      "AC-388 flag captured",
    );
    const { finance } = closeoutRolesFor(proof, tenantId);
    const [draft] = await listedCloseoutFacts(finance, eventId);
    await captureCloseout(proof, tenantId, draft!._id, eventId);

    await correctCommercial(
      proof,
      tenantId,
      eventId,
      4000,
      6000,
      "Client restated the quote before finance finalized",
    );

    const flagged = await flagsIn(finance, eventId, "closeout");
    expect(flagged.map((issue) => issue.code)).toEqual([
      "closeout.closeout_review",
    ]);
    expect(flagged[0]!.resolvingAction).toBe("EventCloseout.capture");

    await captureCloseout(proof, tenantId, draft!._id, eventId);
    expect(await flagsIn(finance, eventId, "closeout")).toEqual([]);
  });

  it("a finalized closeout shows under closeout until the event budget is set back", async () => {
    const tenantId = "tenant-ac388-flag-closeout";
    const proof = harness();
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "closed_out",
      "AC-388 flag closeout",
    );
    const { finance } = closeoutRolesFor(proof, tenantId);
    const [draft] = await listedCloseoutFacts(finance, eventId);
    await captureCloseout(proof, tenantId, draft!._id, eventId);
    const [captured] = await listedCloseoutFacts(finance, eventId);
    await finalizeCloseout(proof, tenantId, captured!._id, captured!.version);
    expect(await flagsIn(finance, eventId, "closeout")).toEqual([]);

    await correctCommercial(
      proof,
      tenantId,
      eventId,
      4000,
      6000,
      "Client restated the quote after closeout",
    );

    const flagged = await flagsIn(finance, eventId, "closeout");
    expect(flagged.map((issue) => issue.code)).toEqual([
      "closeout.closeout_change_required",
    ]);
    expect(flagged[0]!.affectedIds).toEqual([String(draft!._id)]);
    expect(flagged[0]!.resolvingAction).toBe("Event.correctCommercial");
    expect(await flagsIn(finance, eventId, "commercial")).toEqual([]);

    await correctCommercial(
      proof,
      tenantId,
      eventId,
      BUDGET,
      QUOTED_PRICE,
      "The restated quote was a mistake",
    );
    expect(await flagsIn(finance, eventId, "closeout")).toEqual([]);
  });

  it("proposals the guest count did not reach show with a command each can take, and go once it runs", async () => {
    const tenantId = "tenant-ac388-flag-proposal";
    const proof = headcountHarness();
    const { sales, events } = proposalRolesFor(proof, tenantId);
    const runSales = proposalRunner(proof, sales);
    const { eventId, clientId } = await createHeadcountEvent(
      proof,
      tenantId,
      "AC-388 flag proposal",
    );
    const draftAt = async (title: string, guestCount: number) =>
      (
        await runSales(api.mutations.Proposal_createViaDraft, {
          clientId,
          title,
          subtotal: 1200,
          taxAmount: 100,
          discountAmount: 0,
          total: 1300,
          guestCount,
          eventId,
        })
      ).docId as string;
    const handSizedId = await draftAt("Sized by a person", 50);
    const sentId = await draftAt("Sent proposal", 40);
    await runSales(api.mutations.Proposal_send, { docId: sentId });
    const acceptedId = await seedAcceptedProposal(
      proof,
      tenantId,
      eventId,
      clientId,
    );

    await proposalRunner(proof, events)(api.mutations.Event_changeHeadcount, {
      docId: eventId,
      version: await readEventVersion(events, eventId),
      newHeadcount: 60,
    });

    const flagged = await flagsIn(sales, eventId, "commercial");
    const byId = Object.fromEntries(
      flagged.map((issue) => [issue.affectedIds[0], issue]),
    );
    expect(Object.keys(byId).sort()).toEqual(
      [handSizedId, sentId, acceptedId].sort(),
    );
    expect(byId[handSizedId]!.code).toBe("commercial.proposal_review");
    expect(byId[handSizedId]!.resolvingAction).toBe(
      "Proposal.followEventHeadcount",
    );
    expect(byId[sentId]!.code).toBe("commercial.proposal_change_required");
    expect(byId[sentId]!.resolvingAction).toBe("Proposal.supersede");
    expect(byId[acceptedId]!.code).toBe("commercial.proposal_change_required");
    expect(byId[acceptedId]!.resolvingAction).toBe("Proposal.draft");

    const rowOf = async (id: string) =>
      (await listedProposals(sales, eventId)).find((row) => row._id === id)!;
    const handSized = await rowOf(handSizedId);
    await runSales(api.mutations.Proposal_followEventHeadcount, {
      docId: handSizedId,
      version: handSized.version,
      guestCount: 60,
      subtotal: 1200,
      total: 1300,
    });
    const replacementId = await draftAt("Replacement proposal", 60);
    const sent = await rowOf(sentId);
    await runSales(api.mutations.Proposal_supersede, {
      docId: sentId,
      version: sent.version,
      revisedById: replacementId,
      reason: "Guest count changed",
    });
    await proof.executeCommand(
      sales,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: acceptedId },
    );

    expect(await flagsIn(sales, eventId, "commercial")).toEqual([]);
  });
});
