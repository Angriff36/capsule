/**
 * PL-REVISION (AC-256, AC-257, AC-258): proposal versions and stages.
 *
 *   - sending freezes a numbered copy; revising a sent proposal opens the next
 *     version as a draft, and sending it freezes Revision 2 and replaces the
 *     sent one - Revision 1 stays byte-for-byte what the client saw
 *   - stages run draft -> sent -> viewed -> accepted; a replaced or accepted
 *     proposal takes no further stage change
 *   - accepting a proposal never moves its event's stage
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const DAY = 24 * 60 * 60 * 1000;
const TENANT = "tenant-proposal-versions";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: proposal versions and stages", () => {
  it("a revised sent proposal becomes Revision 2 and replaces the first; stages hold", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "versions-owner",
      role: "owner",
      tenantId: TENANT,
    });
    await proof.seedEntity(owner, "people", {
      tenantId: TENANT,
      givenName: "Val",
      familyName: "Owner",
      email: "versions-owner@example.com",
      role: "owner",
      employmentType: "full_time",
      status: "active",
      authSubjectId: "versions-owner",
      version: 1,
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Versions client" },
    )) as { docId: string };
    const startsAt = Date.now() + 20 * DAY;
    const event = (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Harbor dinner",
        eventType: "catering",
        startsAt,
        endsAt: startsAt + 4 * 60 * 60 * 1000,
        expectedHeadcount: 40,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2400,
      },
    )) as { docId: string };
    const first = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: client.docId,
        title: "Harbor dinner",
        subtotal: 1200,
        taxAmount: 0,
        discountAmount: 0,
        total: 1200,
        guestCount: 40,
        eventId: event.docId,
      },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.mutations.ProposalLineItem_createViaAddLine,
      {
        proposalId: first.docId,
        description: "Plated dinner",
        pricingBasis: "flat",
        unitPrice: 1200,
        amount: 1200,
      },
    );
    await proof.executeCommand(
      owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: first.docId },
    );
    const revisionsOf = async (proposalId: string) =>
      (await owner.query(api.queries.listProposalRevisionByProposalId, {
        proposalId,
      })) as Array<{ _id: string; revisionNumber: number; snapshot: string }>;
    const [revisionOne] = await revisionsOf(first.docId);
    expect(revisionOne.revisionNumber).toBe(1);
    const proposalRow = async (id: string) =>
      (await owner.run((ctx) => ctx.db.get(id as never))) as any;
    const eventStage = (await proposalRow(event.docId)).stage;

    // Revise the sent proposal: a new draft, the sent one untouched for now.
    const revised = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: first.docId },
    )) as { docId: string; alreadyStarted: boolean };
    expect(revised.alreadyStarted).toBe(false);
    expect(await proposalRow(revised.docId)).toMatchObject({
      status: "draft",
      replacesProposalId: first.docId,
      eventId: event.docId,
    });
    expect((await proposalRow(first.docId)).status).toBe("sent");
    await owner.mutation(
      (api.lib as any).proposalPricing.addProposalLineAndRecompute,
      {
        proposalId: revised.docId,
        description: "Late-night snack",
        pricingBasis: "flat",
        unitPrice: 300,
      },
    );

    // Sending the new version freezes Revision 2 and replaces the first.
    await proof.executeCommand(
      owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: revised.docId },
    );
    const [revisionTwo] = await revisionsOf(revised.docId);
    expect(revisionTwo.revisionNumber).toBe(2);
    expect(JSON.parse(revisionTwo.snapshot).proposal.total).toBe(1500);
    expect(await proposalRow(first.docId)).toMatchObject({
      status: "superseded",
      supersededById: revised.docId,
    });
    const [firstAgain] = await revisionsOf(first.docId);
    expect(firstAgain.snapshot).toBe(revisionOne.snapshot);
    expect(firstAgain.revisionNumber).toBe(1);

    // A replaced proposal takes no further stage change.
    for (const command of [
      api.mutations.Proposal_markViewed,
      api.mutations.Proposal_accept,
      api.mutations.Proposal_decline,
    ]) {
      await expect(
        proof.executeCommand(owner, command as never, { docId: first.docId }),
      ).rejects.toThrow();
    }

    // sent -> viewed -> accepted; accepted is final.
    await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
      docId: revised.docId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: revised.docId,
      acceptedRevisionId: revisionTwo._id,
    });
    expect(await proposalRow(revised.docId)).toMatchObject({
      status: "accepted",
      acceptedRevisionId: revisionTwo._id,
    });
    for (const command of [
      api.mutations.Proposal_decline,
      api.mutations.Proposal_expire,
      api.mutations.Proposal_markViewed,
    ]) {
      await expect(
        proof.executeCommand(owner, command as never, {
          docId: revised.docId,
        }),
      ).rejects.toThrow();
    }
    await expect(
      proof.executeCommand(owner, api.mutations.Proposal_supersede, {
        docId: revised.docId,
        revisedById: first.docId,
        reason: "no",
      }),
    ).rejects.toThrow();

    // Acceptance leaves the event's stage where it was (AC-258).
    expect((await proposalRow(event.docId)).stage).toBe(eventStage);
  });
});
