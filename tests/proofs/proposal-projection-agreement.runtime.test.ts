/**
 * Runtime proof (AC-418 / AC-432): one accepted revision's total is the SAME
 * number on every projection surface — proposal web view (share portal), PDF,
 * signature payload, acceptance, Event booking seed, and invoice seed. The
 * stored revision snapshot is the source: live totals and caller-provisional
 * numbers are seeded wrong (1/1 at draft, 9999 as live PDF bait) so any
 * surface that reads anything but the snapshot fails.
 *
 * Harness/seed follow proposal-central-path-snapshot.runtime.test.ts;
 * booking/approve/invoice follow no-premature-effects.runtime.test.ts; the
 * SignatureRequest fixture follows signature-acceptance-equivalence.runtime.
 * test.ts; the booking seed comes from the real UI helper
 * src/features/events/ProposalEventPrefill.ts.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  computeProposalPricing,
  type PricingBasis,
} from "../../src/lib/pricing";
import { projectProposalPdf } from "../../src/features/clients/proposalPdfProjection";
import { proposalEventPrefill } from "../../src/features/events/ProposalEventPrefill";

const M = api.mutations;

const SEED_LINES: Array<{
  description: string;
  pricingBasis: PricingBasis;
  unitPrice: number;
  quantity: number;
  unit?: string;
}> = [
  {
    description: "Plated dinner",
    pricingBasis: "per_person",
    unitPrice: 48,
    quantity: 1,
  },
  {
    description: "Room rental",
    pricingBasis: "flat",
    unitPrice: 120,
    quantity: 1,
  },
  {
    description: "Service charge",
    pricingBasis: "percentage",
    unitPrice: 20,
    quantity: 1,
    unit: "%",
  },
];

// The one totals object: per_person 48×10=480, flat 120, percentage 20% of
// 600=120 → subtotal 720, +40 tax, −15 discount → 745.
const TOTALS = {
  subtotal: 720,
  taxAmount: 40,
  discountAmount: 15,
  total: 745,
};

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

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;

/** Client + draft proposal with WRONG provisional totals (1/1) for the seed lines. */
async function seedDraftedProposal(proof: Proof, owner: Actor, title: string) {
  const client = (await proof.executeCommand(
    owner,
    M.Client_createViaRegister,
    { clientType: "company", companyName: `AC-418 client ${title}` },
  )) as { docId: string };
  await owner.mutation((api.lib as any).proposalDraft.draftProposalWithLines, {
    clientId: client.docId,
    title,
    guestCount: 10,
    // WRONG on purpose: the server's central calc must overwrite these.
    subtotal: 1,
    taxAmount: 40,
    discountAmount: 15,
    total: 1,
    eventDate: Date.parse("2026-10-01T18:00:00Z"),
    eventEndDate: Date.parse("2026-10-01T23:00:00Z"),
    eventType: "gala dinner",
    venueName: "Riverside Hall",
    lines: SEED_LINES,
  });
  const proposals = (await owner.query(api.queries.listProposal, {})) as any[];
  expect(proposals).toHaveLength(1);
  expect(proposals[0]).toMatchObject({ ...TOTALS, status: "draft" });
  return { clientId: client.docId, proposal: proposals[0] };
}

/** Live (deletedAt == null) ProposalLineItem amounts keyed by description. */
async function liveLineAmounts(owner: Actor, proposalId: string) {
  const rows = (await owner.query(
    api.queries.listProposalLineItemByProposalId,
    { proposalId },
  )) as any[];
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (row.deletedAt == null) map[row.description] = row.amount;
  }
  return map;
}

/** A live record whose money is wrong on every field — snapshot bait. */
function liveBait(proposalId: string, total: number) {
  return {
    _id: proposalId,
    title: "Changed live title",
    eventDate: 99,
    eventType: "changed live type",
    guestCount: 99,
    venueName: "Changed live venue",
    venueAddress: "Changed live address",
    subtotal: 9999,
    taxAmount: 999,
    discountAmount: 0,
    total,
    terms: "Changed live terms",
    notes: "Changed live notes",
    pricingLines: [],
    timelineItems: [],
    venueLogistics: {},
  };
}

/** Draft → send with revision capture → the one snapshot for the proposal. */
async function captureRevision(proof: Proof, owner: Actor, title: string) {
  const { clientId, proposal } = await seedDraftedProposal(proof, owner, title);
  expect(await liveLineAmounts(owner, proposal._id)).toEqual({
    "Plated dinner": 480,
    "Room rental": 120,
    "Service charge": 120,
  });
  await owner.mutation(
    (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
    { docId: proposal._id, version: proposal.version },
  );
  const revisions = (await owner.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId: proposal._id },
  )) as any[];
  expect(revisions).toHaveLength(1);
  const snapshot = JSON.parse(revisions[0].snapshot);
  expect(snapshot.proposal).toMatchObject(TOTALS);
  return {
    clientId,
    proposal,
    revisionId: revisions[0]._id as string,
    snapshot,
  };
}

/** Accept → book via the real UI prefill → submit → approve → the invoice seed. */
async function acceptBookAndApprove(
  proof: Proof,
  owner: Actor,
  tenantId: string,
  fx: Awaited<ReturnType<typeof captureRevision>>,
) {
  await proof.executeCommand(owner, M.Proposal_accept, {
    docId: fx.proposal._id,
  });
  const acceptedRows = (await owner.query(
    api.queries.listProposal,
    {},
  )) as any[];
  expect(acceptedRows).toHaveLength(1);
  const acceptedProposal = acceptedRows[0];
  expect(acceptedProposal).toMatchObject({ ...TOTALS, status: "accepted" });

  // The booking seed is the UI's own prefill of the stored proposal, not a
  // hardcoded literal.
  const prefill = proposalEventPrefill.values(acceptedProposal);
  expect(prefill.quotedPrice).toBe(745);
  const booked = (await proof.executeCommand(
    owner,
    api.lib.proposalEventCreation.createEventFromAcceptedProposal,
    {
      proposalId: fx.proposal._id,
      event: {
        clientId: fx.clientId,
        title: acceptedProposal.title,
        eventType: acceptedProposal.eventType,
        startsAt: acceptedProposal.eventDate,
        endsAt: acceptedProposal.eventEndDate,
        expectedHeadcount: acceptedProposal.guestCount,
        primaryContactName: "Casey Contact",
        budgetAmount: 0,
        quotedPrice: prefill.quotedPrice,
        venueName: acceptedProposal.venueName,
      },
    },
  )) as { docId: string };

  const event = (await owner.query(api.queries.getEvent, {
    id: booked.docId,
  })) as any;
  expect(event.quotedPrice).toBe(745);
  expect(event.expectedHeadcount).toBe(10);

  // Use the Event's live version: booking may already have bumped it.
  const live = (await owner.run(async (ctx) =>
    ctx.db.get(booked.docId as never),
  )) as { version: number };
  await proof.executeCommand(owner, M.Event_submitForApproval, {
    docId: booked.docId,
    version: live.version,
  });
  await proof.executeCommand(owner, M.Event_approve, {
    docId: booked.docId,
    version: live.version + 1,
  });

  const invoices = (
    (await owner.run(async (ctx) =>
      ctx.db.query("invoices").collect(),
    )) as any[]
  ).filter(
    (row) =>
      row.deletedAt == null &&
      row.tenantId === tenantId &&
      row.eventId === booked.docId,
  );
  expect(invoices).toHaveLength(1);
  const invoice = invoices[0];
  expect(invoice.status).toBe("draft");
  expect(invoice.sentAt == null).toBe(true);
  return { acceptedProposal, event, invoice };
}

describe("proposal projection agreement (AC-418 / AC-432)", () => {
  it("web/PDF/signature/acceptance/invoice-seed totals identical for one revision", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "o-ac418",
      role: "owner",
      tenantId: "tenant-ac418",
    });

    // Preview — the exact function the draft form uses for its live total.
    const preview = computeProposalPricing({
      lines: SEED_LINES,
      guestCount: 10,
      discountAmount: 15,
      taxAmount: 40,
    });
    expect(preview).toMatchObject(TOTALS);
    expect(preview.lines.map((line) => line.amount)).toEqual([480, 120, 120]);

    const fx = await captureRevision(proof, owner, "AC-418 plated dinner");
    const revisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: fx.proposal._id },
    )) as any[];

    // PDF reads the snapshot even though every live money field is wrong.
    const pdf = projectProposalPdf(
      liveBait(fx.proposal._id, 9999),
      "Live client",
      {
        snapshot: revisions[0].snapshot,
      },
    );
    expect(pdf.source).toBe("revision");
    expect(pdf.proposal).toMatchObject(TOTALS);

    // Web view (share portal) reads the same revision snapshot.
    const link = (await proof.executeCommand(owner, M.ShareLink_create, {
      proposalId: fx.proposal._id,
      proposalRevisionId: fx.revisionId,
    })) as { _id: string };
    const shared = (await owner.query(api.shareLinks.getSharedProposal, {
      token: link._id,
    })) as any;
    expect(shared?.proposal).toMatchObject(TOTALS);

    // Signature payload: the request points at THE revision, and that
    // revision's snapshot carries the totals the signer sees.
    await proof.seedEntity(owner, "people", {
      tenantId: "tenant-ac418",
      givenName: "Sig",
      familyName: "Owner",
      email: "o-ac418@example.com",
      role: "owner",
      employmentType: "full_time",
      status: "active",
      authSubjectId: "o-ac418",
      version: 1,
    });
    const signature = (await proof.executeCommand(
      owner,
      M.SignatureRequest_createViaRequestSignature,
      {
        proposalRevisionId: fx.revisionId,
        proposalId: fx.proposal._id,
        recipientEmail: "signer@example.com",
        recipientName: "Casey Contact",
      },
    )) as { docId: string };
    const request = (await owner.run(async (ctx) =>
      ctx.db.get(signature.docId as never),
    )) as any;
    expect(request.proposalRevisionId).toBe(fx.revisionId);
    expect(JSON.parse(revisions[0].snapshot).proposal).toMatchObject(TOTALS);

    // Acceptance does not rewrite money: totals and snapshot stay put.
    const { event, invoice } = await acceptBookAndApprove(
      proof,
      owner,
      "tenant-ac418",
      fx,
    );
    expect(
      (await owner.query(api.queries.listProposal, {})) as any[],
    ).toHaveLength(1);
    const afterAccept = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: fx.proposal._id },
    )) as any[];
    expect(afterAccept).toHaveLength(1);
    expect(JSON.parse(afterAccept[0].snapshot).proposal).toMatchObject(TOTALS);

    // Invoice seed: a lump sum of the quoted price, to the cent.
    expect(invoice.total).toBe(745);
    expect(invoice.amountDue).toBe(745);
    expect(event.quotedPrice).toBe(invoice.total);
  });

  it("accepted revision total equals invoice seed and booking seed to the cent", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "o-ac432",
      role: "owner",
      tenantId: "tenant-ac432",
    });

    const fx = await captureRevision(proof, owner, "AC-432 plated dinner");
    const { event, invoice } = await acceptBookAndApprove(
      proof,
      owner,
      "tenant-ac432",
      fx,
    );

    // One identity, not three hardcoded literals: snapshot → event → invoice.
    const storedRevisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: fx.proposal._id },
    )) as any[];
    expect(storedRevisions).toHaveLength(1);
    const revisionTotal = JSON.parse(storedRevisions[0].snapshot).proposal
      .total;
    expect(revisionTotal).toBe(745);
    expect(event.quotedPrice).toBe(revisionTotal);
    expect(invoice.total).toBe(revisionTotal);
    expect(invoice.amountDue).toBe(invoice.total);

    // Headcount agrees with the snapshot too.
    expect(event.expectedHeadcount).toBe(
      JSON.parse(storedRevisions[0].snapshot).proposal.guestCount,
    );
    expect(event.expectedHeadcount).toBe(10);
  });
});
