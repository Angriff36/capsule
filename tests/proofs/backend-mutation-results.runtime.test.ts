/**
 * Runtime proof (AC-640, BE-18.4; AC-421 booking retry): authored steps that
 * make records keep the generated envelope and also return the record id,
 * whether this call made it or found the one an earlier call made, and its
 * version. A screen never has to scan lists to learn what happened, and a
 * retried booking opens the same Event with no second Event.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-ac640-results";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Result = { outcome: string; version: number };

describe("runtime proof: authored steps say what they made", () => {
  it("booking, proposal draft, proposal change, generated draft and event copy", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-ac640",
      role: "owner",
      tenantId: TENANT,
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Results client" },
    )) as { docId: string };

    const drafted = (await proof.executeCommand(
      owner,
      api.lib.proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "Results proposal",
        guestCount: 60,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        lines: [],
      },
    )) as { docId: string } & Result;
    expect(drafted).toMatchObject({ outcome: "created", version: 1 });
    expect(typeof drafted.docId).toBe("string");

    await proof.executeCommand(
      owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: drafted.docId },
    );
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: drafted.docId,
    });

    const eventArgs = {
      clientId: client.docId,
      title: "Results gala",
      eventType: "gala dinner",
      startsAt: Date.UTC(2026, 10, 20, 23, 0),
      endsAt: Date.UTC(2026, 10, 21, 4, 0),
      expectedHeadcount: 60,
      primaryContactName: "Casey Results",
      budgetAmount: 0,
      quotedPrice: 0,
    };
    const first = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      { proposalId: drafted.docId, event: eventArgs },
    )) as { docId: string } & Result;
    const retry = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      { proposalId: drafted.docId, event: eventArgs },
    )) as { docId: string } & Result;
    expect(first.outcome).toBe("created");
    expect(retry).toMatchObject({ docId: first.docId, outcome: "reused" });
    expect(retry.version).toBeGreaterThanOrEqual(first.version);
    const events = (await owner.run(async (ctx) =>
      ctx.db.query("events").collect(),
    )) as Array<{ tenantId: string }>;
    expect(events.filter((e) => e.tenantId === TENANT)).toHaveLength(1);

    const change = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: drafted.docId },
    )) as { docId: string } & Result;
    const changeAgain = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: drafted.docId },
    )) as { docId: string } & Result;
    expect(change.outcome).toBe("created");
    expect(changeAgain).toMatchObject({
      docId: change.docId,
      outcome: "reused",
      version: change.version,
    });

    const generated = (await proof.executeCommand(
      owner,
      api.lib.proposalGenerate.generateProposalDraft,
      { eventId: first.docId },
    )) as { proposalId: string } & Result;
    const generatedAgain = (await proof.executeCommand(
      owner,
      api.lib.proposalGenerate.generateProposalDraft,
      { eventId: first.docId },
    )) as { proposalId: string } & Result;
    expect(generated.outcome).toBe("created");
    expect(generatedAgain).toMatchObject({
      proposalId: generated.proposalId,
      outcome: "reused",
      version: generated.version,
    });

    const copy = (await proof.executeCommand(
      owner,
      api.lib.eventDuplicate.duplicateEvent,
      { sourceEventId: first.docId },
    )) as { docId: string } & Result;
    expect(copy).toMatchObject({ outcome: "created", version: 1 });
    expect(copy.docId).not.toBe(first.docId);
  });
});
