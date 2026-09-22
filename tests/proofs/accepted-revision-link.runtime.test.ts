/**
 * AC-413 / AC-434 (spec §7.1/§7.2.3): acceptance stores WHICH proposal
 * revision the client agreed to, as an immutable reference — never inferred
 * from the proposal's latest mutable draft.
 *
 * Defects these tests catch:
 *   - acceptance stores nothing, so a later revision silently rewrites what
 *     the client signed and the event card relabels it;
 *   - the public/signed path accepting proposal B while showing revision A;
 *   - a second acceptance (ledger row) on booking retry, signature re-click,
 *     or a later signature on an already-accepted proposal;
 *   - accepting a supplied revision from another proposal or another tenant.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  // ONE raw anonymous instance, shared with the proof-kit root through a
  // factory — a second convexTest() call would create a separate database,
  // not the one the owner actor writes to.
  const anonymous = convexTest(schema, modules);
  return Object.assign(
    createManifestTestContext({
      convexTest: (() => anonymous) as never,
      schema,
      modules,
    }),
    { anonymous },
  );
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

async function seedClient(
  proof: ReturnType<typeof harness>,
  owner: Actor,
  tenantId: string,
) {
  const client = (await proof.executeCommand(
    owner,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: `Revision-link client ${tenantId}` },
  )) as { docId: string };
  return client.docId;
}

/** Draft → send with revision capture (the UI path) → viewed. */
async function sentProposalWithCapture(
  proof: ReturnType<typeof harness>,
  owner: Actor,
  clientId: string,
  title: string,
) {
  const proposal = (await proof.executeCommand(
    owner,
    api.mutations.Proposal_createViaDraft,
    {
      clientId,
      title,
      subtotal: 1200,
      taxAmount: 100,
      discountAmount: 0,
      total: 1300,
    },
  )) as { docId: string };
  await proof.executeCommand(
    owner,
    api.lib.proposalRevision.sendProposalWithRevisionCapture,
    { docId: proposal.docId },
  );
  await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
    docId: proposal.docId,
  });
  const revisions = (await owner.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId: proposal.docId },
  )) as Array<{ _id: string; revisionNumber: number; snapshot: string }>;
  expect(revisions).toHaveLength(1);
  return {
    proposalId: proposal.docId,
    revision1Id: revisions[0]._id,
    revision1: revisions[0],
  };
}

/** Draft + raw send (no capture) + viewed — the agent-bundle path (#241). */
async function sentProposalWithoutCapture(
  proof: ReturnType<typeof harness>,
  owner: Actor,
  clientId: string,
  title: string,
) {
  const proposal = (await proof.executeCommand(
    owner,
    api.mutations.Proposal_createViaDraft,
    {
      clientId,
      title,
      subtotal: 500,
      taxAmount: 0,
      discountAmount: 0,
      total: 500,
    },
  )) as { docId: string };
  await proof.executeCommand(owner, api.mutations.Proposal_send, {
    docId: proposal.docId,
  });
  await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
    docId: proposal.docId,
  });
  return proposal.docId;
}

/**
 * A later revision through the generated governed creation command, with a
 * valid snapshot payload (non-empty, proposal-shaped) — the same shape a
 * post-acceptance change capture would freeze.
 */
async function captureLaterRevision(
  proof: ReturnType<typeof harness>,
  owner: Actor,
  proposalId: string,
  revisionNumber: number,
) {
  const snapshot = JSON.stringify({
    proposal: { title: "Later revision proposal", total: 1300 },
    client: { name: "Revision-link client" },
    dishSelections: [],
    lineItems: [],
    enhancements: [],
    tenant: { name: "Proof Kitchen" },
  });
  await proof.executeCommand(
    owner,
    api.mutations.ProposalRevision_createViaCapture,
    {
      proposalId,
      revisionNumber,
      capturedByName: "Proof Owner",
      changeSummary: `Later revision ${revisionNumber}`,
      snapshot,
    },
  );
  const revisions = (await owner.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId },
  )) as Array<{ _id: string; revisionNumber: number }>;
  return revisions.find((row) => row.revisionNumber === revisionNumber);
}

async function acceptanceLedgerRows(actor: Actor, proposalId: string) {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as Array<{
    type: string;
    entityId: string;
    payload: Record<string, unknown>;
  }>;
  return rows.filter(
    (row) => row.type === "ProposalAccepted" && row.entityId === proposalId,
  );
}

async function acceptedRevisionIdOf(actor: Actor, proposalId: string) {
  const row = (await actor.run(async (ctx) =>
    ctx.db.get(proposalId as never),
  )) as { acceptedRevisionId?: string | null };
  return row.acceptedRevisionId ?? null;
}

const EVENT_ARGS = {
  title: "Revision-link gala",
  eventType: "gala dinner",
  startsAt: Date.parse("2026-10-01T18:00:00Z"),
  endsAt: Date.parse("2026-10-01T23:00:00Z"),
  expectedHeadcount: 80,
  primaryContactName: "Casey Contact",
  budgetAmount: 0,
  quotedPrice: 1300,
  venueName: "Riverside Hall",
};

async function book(
  proof: ReturnType<typeof harness>,
  owner: Actor,
  clientId: string,
  proposalId: string,
) {
  return (await proof.executeCommand(
    owner,
    api.lib.proposalEventCreation.createEventFromAcceptedProposal,
    { proposalId, event: { clientId, ...EVENT_ARGS } },
  )) as { docId: string };
}

describe("accepted revision link (AC-413 / AC-434)", () => {
  it("operator accept stores the captured revision; a later revision cannot relabel it (AC-434)", async () => {
    const tenantId = "tenant-revlink-operator";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-revlink-operator",
      role: "owner",
      tenantId,
    });
    const clientId = await seedClient(proof, owner, tenantId);
    const { proposalId, revision1Id, revision1 } =
      await sentProposalWithCapture(
        proof,
        owner,
        clientId,
        "Operator accept proposal",
      );

    // Accept without an explicit revision: the operator path captures the
    // highest live captured revision at that moment — revision 1.
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: proposalId,
    });
    expect(await acceptedRevisionIdOf(owner, proposalId)).toBe(revision1Id);

    // The ProposalAccepted ledger payload carries the same id — exactly one
    // acceptance.
    const ledger = await acceptanceLedgerRows(owner, proposalId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].payload.acceptedRevisionId).toBe(revision1Id);

    // After acceptance a later revision is captured. The original snapshot
    // must stay byte-for-byte unchanged.
    const revision2 = await captureLaterRevision(proof, owner, proposalId, 2);
    expect(revision2).toBeTruthy();
    const revision1After = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId },
    )) as Array<{ _id: string; revisionNumber: number; snapshot: string }>;
    const stored1 = revision1After.find((row) => row._id === revision1Id);
    expect(stored1?.revisionNumber).toBe(revision1.revisionNumber);
    expect(stored1?.snapshot).toBe(revision1.snapshot);

    // The stored reference and the event-side label still name revision 1 —
    // the accepted snapshot is never inferred from the latest mutable draft.
    expect(await acceptedRevisionIdOf(owner, proposalId)).toBe(revision1Id);
    const booked = await book(proof, owner, clientId, proposalId);
    const booking = (await owner.query(
      api.quoteBuilder.getEventBookingDetails,
      { eventId: booked.docId },
    )) as { proposalId: string; revisionLabel: string } | null;
    expect(booking?.proposalId).toBe(proposalId);
    expect(booking?.revisionLabel).toBe("Revision 1");

    // Booking retry returns the SAME event and creates no second acceptance.
    const retry = await book(proof, owner, clientId, proposalId);
    expect(retry.docId).toBe(booked.docId);
    expect(await acceptanceLedgerRows(owner, proposalId)).toHaveLength(1);
  });

  it("event resolves the exact accepted revision id for both signature and operator acceptance (AC-413)", async () => {
    const tenantId = "tenant-revlink-signed";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-revlink-signed",
      role: "owner",
      tenantId,
    });
    const clientId = await seedClient(proof, owner, tenantId);
    const { proposalId, revision1Id } = await sentProposalWithCapture(
      proof,
      owner,
      clientId,
      "Signed proposal",
    );

    // The signature commands guard on user.personId, which only a linked
    // Person row provides (person-first auth, convex/lib/authContext.ts).
    await proof.seedEntity(owner, "people", {
      tenantId,
      givenName: "Sig",
      familyName: "Owner",
      email: "sig-owner@example.com",
      role: "owner",
      employmentType: "full_time",
      status: "active",
      authSubjectId: "owner-revlink-signed",
      version: 1,
    });

    const signature = (await proof.executeCommand(
      owner,
      api.mutations.SignatureRequest_createViaRequestSignature,
      {
        proposalRevisionId: revision1Id,
        proposalId,
        recipientEmail: "signer@example.com",
        recipientName: "Casey Contact",
      },
    )) as { docId: string };
    // No generated command sets callbackToken (the authored acceptance seam
    // owns it); seed it the way that seam does so complete's guard passes.
    await owner.run(async (ctx) =>
      ctx.db.patch(signature.docId as never, { callbackToken: "proof-token" }),
    );

    // Revision 2 exists BEFORE completion: the signed evidence must win over
    // "highest revision" inference.
    const revision2 = await captureLaterRevision(proof, owner, proposalId, 2);
    expect(revision2).toBeTruthy();

    await proof.executeCommand(owner, api.mutations.SignatureRequest_complete, {
      docId: signature.docId,
      callbackToken: "proof-token",
      signedArtifactReference: "proof://signed",
    });

    // The request's proposalRevisionId — not the highest revision — is what
    // was accepted.
    expect(await acceptedRevisionIdOf(owner, proposalId)).toBe(revision1Id);
    const ledger = await acceptanceLedgerRows(owner, proposalId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].payload.acceptedRevisionId).toBe(revision1Id);

    const booked = await book(proof, owner, clientId, proposalId);
    const booking = (await owner.query(
      api.quoteBuilder.getEventBookingDetails,
      { eventId: booked.docId },
    )) as { revisionLabel: string } | null;
    expect(booking?.revisionLabel).toBe("Revision 1 — signed digitally");
    expect(await acceptanceLedgerRows(owner, proposalId)).toHaveLength(1);
  });

  it("public click-to-accept stores the token-bound revision; a re-click cannot overwrite it", async () => {
    const tenantId = "tenant-revlink-public";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-revlink-public",
      role: "owner",
      tenantId,
    });
    const clientId = await seedClient(proof, owner, tenantId);
    const { proposalId, revision1Id } = await sentProposalWithCapture(
      proof,
      owner,
      clientId,
      "Public acceptance proposal",
    );

    // The signature commands guard on user.personId — link the operator.
    await proof.seedEntity(owner, "people", {
      tenantId,
      givenName: "Pub",
      familyName: "Owner",
      email: "pub-owner@example.com",
      role: "owner",
      employmentType: "full_time",
      status: "active",
      authSubjectId: "owner-revlink-public",
      version: 1,
    });

    const signature = (await proof.executeCommand(
      owner,
      api.mutations.SignatureRequest_createViaRequestSignature,
      {
        proposalRevisionId: revision1Id,
        proposalId,
        recipientEmail: "signer@example.com",
        recipientName: "Casey Contact",
      },
    )) as { docId: string };

    // Revision 2 exists BEFORE the signer clicks: the token-bound revision
    // must win over "highest revision" inference.
    const revision2 = await captureLaterRevision(proof, owner, proposalId, 2);
    expect(revision2).toBeTruthy();

    // The public seam (convex/signatureAcceptance.completeSignature) is
    // bearer-token authorized — the request row's id IS the token — and
    // reads no Clerk identity, so the shared raw anonymous instance is
    // exactly the caller the anonymous acceptance page presents.
    // Identity-only: no menu selections, no dish cascade involved.
    expect(
      await proof.anonymous.run(async (ctx) => ctx.auth.getUserIdentity()),
    ).toBeNull();
    const firstClick = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: signature.docId },
    )) as { ok: boolean };
    expect(firstClick.ok).toBe(true);

    expect(await acceptedRevisionIdOf(owner, proposalId)).toBe(revision1Id);
    const ledger = await acceptanceLedgerRows(owner, proposalId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].payload.acceptedRevisionId).toBe(revision1Id);

    // The operator books, then the signer re-clicks the same link (reload /
    // double click): the stored reference and the single acceptance row must
    // survive unchanged.
    await book(proof, owner, clientId, proposalId);
    const reClick = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: signature.docId },
    )) as { ok: boolean };
    expect(reClick.ok).toBe(true);
    expect(await acceptedRevisionIdOf(owner, proposalId)).toBe(revision1Id);
    expect(await acceptanceLedgerRows(owner, proposalId)).toHaveLength(1);
    const linkedProposal = (await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    )) as { eventId?: string | null };
    const booking = (await owner.query(
      api.quoteBuilder.getEventBookingDetails,
      { eventId: linkedProposal.eventId as string },
    )) as { revisionLabel: string } | null;
    expect(booking?.revisionLabel).toBe("Revision 1 — signed digitally");

    // Later signature evidence must not overwrite the original acceptance:
    // a NEW internal request for revision 2 on the already-accepted proposal
    // is completed through the same anonymous token seam, and the stored
    // reference, the single ledger row, and the label must all survive.
    const laterSignature = (await proof.executeCommand(
      owner,
      api.mutations.SignatureRequest_createViaRequestSignature,
      {
        proposalRevisionId: revision2?._id,
        proposalId,
        recipientEmail: "signer@example.com",
        recipientName: "Casey Contact",
      },
    )) as { docId: string };
    await owner.run(async (ctx) =>
      ctx.db.patch(laterSignature.docId as never, {
        callbackToken: "proof-token-2",
      }),
    );
    const laterClick = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: laterSignature.docId },
    )) as { ok: boolean };
    expect(laterClick.ok).toBe(true);
    expect(await acceptedRevisionIdOf(owner, proposalId)).toBe(revision1Id);
    expect(await acceptanceLedgerRows(owner, proposalId)).toHaveLength(1);
    const bookingAfter = (await owner.query(
      api.quoteBuilder.getEventBookingDetails,
      { eventId: linkedProposal.eventId as string },
    )) as { revisionLabel: string } | null;
    expect(bookingAfter?.revisionLabel).toBe("Revision 1 — signed digitally");

    // Legacy-traceability regression (records accepted BEFORE the stored
    // reference existed): strip acceptedRevisionId the way a pre-change
    // accepted row lacks it. The booking query must still resolve the
    // ORIGINAL signed revision from the completed signature that is no
    // later than the acceptance itself — the later revision-2 signature
    // (completed after acceptance) must not relabel it.
    await owner.run(async (ctx) =>
      ctx.db.patch(proposalId as never, { acceptedRevisionId: undefined }),
    );
    const bookingLegacy = (await owner.query(
      api.quoteBuilder.getEventBookingDetails,
      { eventId: linkedProposal.eventId as string },
    )) as { revisionLabel: string } | null;
    expect(bookingLegacy?.revisionLabel).toBe("Revision 1 — signed digitally");
  });

  it("public acceptance refuses an uncaptured mutable revision until it is really captured", async () => {
    const tenantId = "tenant-revlink-uncaptured";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-revlink-uncaptured",
      role: "owner",
      tenantId,
    });
    const clientId = await seedClient(proof, owner, tenantId);
    const proposalId = await sentProposalWithoutCapture(
      proof,
      owner,
      clientId,
      "Uncaptured revision proposal",
    );

    // A same-tenant, same-proposal revision that was never captured: it is
    // still mutable, so a later capture would retroactively relabel anything
    // that stored it as accepted evidence (AC-413 / AC-434).
    const uncapturedSnapshot = JSON.stringify({
      proposal: { title: "Uncaptured revision proposal", total: 500 },
      client: { name: `Revision-link client ${tenantId}` },
      dishSelections: [],
      lineItems: [],
      enhancements: [],
      tenant: { name: "Proof Kitchen" },
    });
    const revisionId = await proof.seedEntity(owner, "proposalRevisions", {
      tenantId,
      proposalId,
      revisionNumber: 1,
      changeSummary: "",
      capturedByName: "Proof Owner",
      capturedAt: null,
      snapshot: uncapturedSnapshot,
      createdAt: Date.parse("2026-09-20T09:00:00Z"),
      updatedAt: Date.parse("2026-09-20T09:00:00Z"),
      version: 1,
    });

    // The signature commands guard on user.personId — link the operator.
    await proof.seedEntity(owner, "people", {
      tenantId,
      givenName: "Unc",
      familyName: "Owner",
      email: "unc-owner@example.com",
      role: "owner",
      employmentType: "full_time",
      status: "active",
      authSubjectId: "owner-revlink-uncaptured",
      version: 1,
    });

    const signature = (await proof.executeCommand(
      owner,
      api.mutations.SignatureRequest_createViaRequestSignature,
      {
        proposalRevisionId: revisionId,
        proposalId,
        recipientEmail: "signer@example.com",
        recipientName: "Casey Contact",
      },
    )) as { docId: string };

    // The anonymous acceptance page must show nothing for a mutable revision.
    expect(
      await proof.anonymous.query(
        api.signatureAcceptance.getPendingSignatureRequest,
        { token: signature.docId },
      ),
    ).toBeNull();

    // And the public click-to-accept must refuse with the generic unavailable
    // error — no oracle that the revision merely lacks a capture.
    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token: signature.docId,
      }),
    ).rejects.toThrow(
      "The proposal for this acceptance link is unavailable. Please contact us.",
    );

    // Atomic refusal: the request stays requested, the proposal stays viewed,
    // and neither completion nor acceptance reached the ledger.
    const afterRefusal = (await owner.run(async (ctx) =>
      ctx.db.get(signature.docId as never),
    )) as { status?: string };
    expect(afterRefusal.status).toBe("requested");
    const proposalAfterRefusal = (await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    )) as { status?: string };
    expect(proposalAfterRefusal.status).toBe("viewed");
    const events = (await owner.run(async (ctx) =>
      ctx.db.query("manifestEvents").collect(),
    )) as Array<{ type: string; entityId: string }>;
    expect(
      events.filter(
        (row) =>
          (row.type === "SignatureCompleted" &&
            row.entityId === signature.docId) ||
          (row.type === "ProposalAccepted" && row.entityId === proposalId),
      ),
    ).toHaveLength(0);

    // The valid counterpart: capturing the SAME revision through the real
    // governed command makes the SAME signature request completable — only
    // mutable evidence is refused, not this revision forever.
    await proof.executeCommand(owner, api.mutations.ProposalRevision_capture, {
      docId: revisionId,
      proposalId,
      revisionNumber: 1,
      capturedByName: "Proof Owner",
      changeSummary: "Captured before acceptance",
      snapshot: uncapturedSnapshot,
    });
    const pending = (await proof.anonymous.query(
      api.signatureAcceptance.getPendingSignatureRequest,
      { token: signature.docId },
    )) as { revisionNumber: number; capturedAt: number | null } | null;
    expect(pending?.revisionNumber).toBe(1);
    expect(pending?.capturedAt).not.toBeNull();
    const click = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: signature.docId },
    )) as { ok: boolean };
    expect(click.ok).toBe(true);

    // The acceptance stores exactly this revision, once, and the request is
    // completed.
    expect(await acceptedRevisionIdOf(owner, proposalId)).toBe(revisionId);
    const ledger = await acceptanceLedgerRows(owner, proposalId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].payload.acceptedRevisionId).toBe(revisionId);
    const completed = (await owner.run(async (ctx) =>
      ctx.db.get(signature.docId as never),
    )) as { status?: string };
    expect(completed.status).toBe("completed");
  });

  it("refuses a supplied revision from another proposal or another tenant, atomically", async () => {
    const tenantId = "tenant-revlink-invalid";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-revlink-invalid",
      role: "owner",
      tenantId,
    });
    const clientId = await seedClient(proof, owner, tenantId);

    // A valid same-proposal counterpart: supplying the proposal's OWN
    // captured revision is accepted (the guard is not a blanket rejection).
    const own = await sentProposalWithCapture(
      proof,
      owner,
      clientId,
      "Own-revision proposal",
    );
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: own.proposalId,
      acceptedRevisionId: own.revision1Id,
    });
    expect(await acceptedRevisionIdOf(owner, own.proposalId)).toBe(
      own.revision1Id,
    );

    // Foreign revision A: a real captured revision of a DIFFERENT proposal in
    // the same tenant.
    const other = await sentProposalWithCapture(
      proof,
      owner,
      clientId,
      "Other proposal same tenant",
    );

    // Foreign revision B: a real captured revision in ANOTHER tenant.
    const foreignTenant = "tenant-revlink-invalid-other";
    const foreignOwner = proof.asRole({
      subject: "owner-revlink-invalid-other",
      role: "owner",
      tenantId: foreignTenant,
    });
    const foreignClientId = await seedClient(
      proof,
      foreignOwner,
      foreignTenant,
    );
    const foreign = await sentProposalWithCapture(
      proof,
      foreignOwner,
      foreignClientId,
      "Foreign tenant proposal",
    );

    const cases = [
      { label: "another proposal's revision", revisionId: other.revision1Id },
      { label: "another tenant's revision", revisionId: foreign.revision1Id },
    ] as const;

    for (const { label, revisionId } of cases) {
      const proposalId = await sentProposalWithoutCapture(
        proof,
        owner,
        clientId,
        `Refusal target (${label})`,
      );
      await expect(
        proof.executeCommand(owner, api.mutations.Proposal_accept, {
          docId: proposalId,
          acceptedRevisionId: revisionId,
        }),
      ).rejects.toThrow("Accepted revision not found");

      // Atomic refusal: the proposal stays viewed (markViewed already ran on
      // this target), stores no reference, and no acceptance reached the
      // ledger.
      const row = (await owner.run(async (ctx) =>
        ctx.db.get(proposalId as never),
      )) as { status?: string };
      expect(row.status).toBe("viewed");
      expect(await acceptedRevisionIdOf(owner, proposalId)).toBeNull();
      expect(await acceptanceLedgerRows(owner, proposalId)).toHaveLength(0);
    }
  });

  it("no-revision acceptance stays null and honest; a later captured revision is not relabeled as accepted", async () => {
    const tenantId = "tenant-revlink-nocapture";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-revlink-nocapture",
      role: "owner",
      tenantId,
    });
    const clientId = await seedClient(proof, owner, tenantId);
    const proposalId = await sentProposalWithoutCapture(
      proof,
      owner,
      clientId,
      "No-capture proposal",
    );

    // Historical/agent path (issue #241): raw send captured nothing.
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: proposalId,
    });
    expect(await acceptedRevisionIdOf(owner, proposalId)).toBeNull();

    const booked = await book(proof, owner, clientId, proposalId);
    const booking = (await owner.query(
      api.quoteBuilder.getEventBookingDetails,
      { eventId: booked.docId },
    )) as { revisionLabel: string } | null;
    expect(booking?.revisionLabel).toBe("no revision captured");

    // A revision captured AFTER acceptance is not retro-fitted: the stored
    // reference stays null and the label stays honest.
    const later = await captureLaterRevision(proof, owner, proposalId, 1);
    expect(later).toBeTruthy();
    expect(await acceptedRevisionIdOf(owner, proposalId)).toBeNull();
    const bookingAfter = (await owner.query(
      api.quoteBuilder.getEventBookingDetails,
      { eventId: booked.docId },
    )) as { revisionLabel: string } | null;
    expect(bookingAfter?.revisionLabel).toBe("no revision captured");
  });
});
