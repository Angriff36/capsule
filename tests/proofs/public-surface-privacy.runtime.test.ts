/**
 * AC-152 (PR12-06): revoked/expired links, changed revisions, and another
 * tenant's tokens reveal nothing private on /share, /portal, /accept and
 * /quote.
 *
 * Every public page reads through one token-authorized query. This proof
 * seeds private words (internal notes, line notes, override reasons, crew
 * notes, crew contact details, tax ID) and checks that no public answer ever
 * contains them, and that a link with no saved end date still ends.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createClientPortalToken } from "../../convex/lib/clientPortalToken";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const DAY = 24 * 60 * 60 * 1000;
const PRIVATE = [
  "PRIVATE-LINE-NOTE",
  "PRIVATE-OVERRIDE-REASON",
  "PRIVATE-EVENT-NOTE",
  "PRIVATE-CREW-NOTE",
  "crew-private@example.com",
  "12-3456789",
  "PRIVATE-LATER-EDIT",
];

function harness() {
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
type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function expectNothingPrivate(view: unknown) {
  const text = JSON.stringify(view);
  for (const secret of PRIVATE) expect(text).not.toContain(secret);
}

/** A sent proposal with private words on its lines, event, client and crew. */
async function sentProposal(proof: Proof, tenantId: string, title: string) {
  const subject = `owner-${tenantId}`;
  const owner = proof.asRole({ subject, role: "owner", tenantId });
  await proof.seedEntity(owner, "people", {
    tenantId,
    givenName: "Sig",
    familyName: "Owner",
    email: `${subject}@example.com`,
    role: "owner",
    employmentType: "full_time",
    status: "active",
    authSubjectId: subject,
    version: 1,
  });
  const client = (await proof.executeCommand(
    owner,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: `${title} client` },
  )) as { docId: string };
  const startsAt = Date.now() + 10 * DAY;
  const event = (await proof.executeCommand(
    owner,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "catering",
      startsAt,
      endsAt: startsAt + 5 * 60 * 60 * 1000,
      expectedHeadcount: 40,
      primaryContactName: "Pat Planner",
      budgetAmount: 2000,
      quotedPrice: 2400,
    },
  )) as { docId: string };
  const proposal = (await proof.executeCommand(
    owner,
    api.mutations.Proposal_createViaDraft,
    {
      clientId: client.docId,
      title,
      subtotal: 1200,
      taxAmount: 100,
      discountAmount: 0,
      total: 1300,
      guestCount: 40,
      eventId: event.docId,
    },
  )) as { docId: string };
  await proof.executeCommand(
    owner,
    api.mutations.ProposalLineItem_createViaAddLine,
    {
      proposalId: proposal.docId,
      description: "Plated dinner",
      pricingBasis: "flat",
      unitPrice: 1200,
      amount: 1200,
      notes: "PRIVATE-LINE-NOTE",
      overrideReason: "PRIVATE-OVERRIDE-REASON",
    },
  );
  await proof.executeCommand(
    owner,
    api.lib.proposalRevision.sendProposalWithRevisionCapture,
    { docId: proposal.docId },
  );
  const revisions = (await owner.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId: proposal.docId },
  )) as Array<{ _id: string }>;
  expect(revisions).toHaveLength(1);

  await owner.run(async (ctx) => {
    await ctx.db.patch(client.docId as never, { taxId: "12-3456789" });
    await ctx.db.patch(event.docId as never, {
      archiveReason: "PRIVATE-EVENT-NOTE",
      importDraftJson: JSON.stringify({ note: "PRIVATE-EVENT-NOTE" }),
    });
    const personId = await ctx.db.insert("people", {
      tenantId,
      givenName: "Jamie",
      familyName: "Server",
      email: "crew-private@example.com",
      role: "event_staff",
      employmentType: "full_time",
      status: "active",
      deletedAt: null,
      version: 1,
    });
    await ctx.db.insert("eventAssignments", {
      tenantId,
      eventId: event.docId as never,
      personId,
      role: "Captain",
      notes: "PRIVATE-CREW-NOTE",
      status: "assigned",
      deletedAt: null,
      version: 1,
    });
  });

  const share = (await proof.executeCommand(
    owner,
    api.mutations.ShareLink_create,
    { proposalId: proposal.docId, proposalRevisionId: revisions[0]._id },
  )) as { docId?: string; _id?: string };
  const shareToken = share.docId ?? share._id;
  expect(shareToken).toBeTruthy();
  return {
    owner,
    subject,
    eventId: event.docId,
    proposalId: proposal.docId,
    revisionId: revisions[0]._id,
    shareToken: shareToken as string,
  };
}

type SharedView = {
  proposal: { title: string };
  lineItems: Array<{ description: string }>;
  linkExpiresAt: number | null;
} | null;

async function shared(proof: Proof, token: string) {
  return (await proof.anonymous.query(api.shareLinks.getSharedProposal, {
    token,
  })) as SharedView;
}

async function viewCount(owner: Actor, token: string) {
  return (await owner.run(async (ctx) => {
    const row = (await ctx.db.get(token as never)) as {
      viewCount: number;
    } | null;
    return row?.viewCount ?? -1;
  })) as number;
}

describe("AC-152 public pages reveal nothing private", () => {
  it("/share shows the frozen copy only, and every closed link shows nothing", async () => {
    const proof = harness();
    const a = await sentProposal(proof, "tenant-public-a", "Porter dinner");
    const b = await sentProposal(proof, "tenant-public-b", "Other lunch");

    const view = await shared(proof, a.shareToken);
    expect(view?.proposal.title).toBe("Porter dinner");
    expect(view?.lineItems.map((line) => line.description)).toEqual([
      "Plated dinner",
    ]);
    expectNothingPrivate(view);

    // A link saved without an end date still ends 90 days after it was made.
    expect(view?.linkExpiresAt).toBeGreaterThan(Date.now() + 89 * DAY);
    expect(view?.linkExpiresAt).toBeLessThanOrEqual(Date.now() + 90 * DAY);

    // Later edits to the proposal never reach the shared frozen copy.
    await a.owner.run(async (ctx) => {
      await ctx.db.patch(a.proposalId as never, {
        title: "PRIVATE-LATER-EDIT",
        notes: "PRIVATE-LATER-EDIT",
      });
    });
    const afterEdit = await shared(proof, a.shareToken);
    expect(afterEdit?.proposal.title).toBe("Porter dinner");
    expectNothingPrivate(afterEdit);

    // Another company's link shows only that company's proposal.
    const other = await shared(proof, b.shareToken);
    expect(other?.proposal.title).toBe("Other lunch");
    expect(JSON.stringify(other)).not.toContain("Porter dinner");

    // A revision that is not frozen yet, or that belongs to another
    // proposal, never opens.
    const { unfrozen, crossed } = (await a.owner.run(async (ctx) => {
      const draftRevision = await ctx.db.insert("proposalRevisions", {
        tenantId: "tenant-public-a",
        proposalId: a.proposalId as never,
        revisionNumber: 2,
        changeSummary: "draft",
        capturedByName: "Sig Owner",
        capturedAt: null,
        snapshot: JSON.stringify({ proposal: { title: "PRIVATE-LATER-EDIT" } }),
        deletedAt: null,
        version: 1,
      });
      const base = {
        tenantId: "tenant-public-a",
        status: "active" as const,
        viewCount: 0,
        deletedAt: null,
        createdAt: Date.now(),
        version: 1,
      };
      return {
        unfrozen: await ctx.db.insert("shareLinks", {
          ...base,
          proposalId: a.proposalId as never,
          proposalRevisionId: draftRevision,
        }),
        crossed: await ctx.db.insert("shareLinks", {
          ...base,
          proposalId: b.proposalId as never,
          proposalRevisionId: a.revisionId as never,
        }),
      };
    })) as { unfrozen: string; crossed: string };
    expect(await shared(proof, unfrozen)).toBeNull();
    expect(await shared(proof, crossed)).toBeNull();

    // Old link: made 91 days ago with no end date — closed, and a visit is
    // not counted.
    await a.owner.run(async (ctx) => {
      await ctx.db.patch(a.shareToken as never, {
        createdAt: Date.now() - 91 * DAY,
      });
    });
    expect(await shared(proof, a.shareToken)).toBeNull();
    const before = await viewCount(a.owner, a.shareToken);
    await proof.anonymous.mutation(api.shareLinks.recordShareView, {
      token: a.shareToken,
    });
    expect(await viewCount(a.owner, a.shareToken)).toBe(before);

    // Revoked link and deleted proposal both close the link.
    await proof.executeCommand(b.owner, api.mutations.ShareLink_revoke, {
      docId: b.shareToken,
    });
    expect(await shared(proof, b.shareToken)).toBeNull();
    const c = await sentProposal(proof, "tenant-public-c", "Gone brunch");
    expect((await shared(proof, c.shareToken))?.proposal.title).toBe(
      "Gone brunch",
    );
    await c.owner.run(async (ctx) => {
      await ctx.db.patch(c.proposalId as never, { deletedAt: Date.now() });
    });
    expect(await shared(proof, c.shareToken)).toBeNull();
    expect(await shared(proof, "not-a-link")).toBeNull();
  });

  it("/portal hides private words, and an old signed link ends 90 days after the event", async () => {
    const proof = harness();
    const a = await sentProposal(proof, "tenant-portal-a", "Porter dinner");
    const b = await sentProposal(proof, "tenant-portal-b", "Other lunch");

    const link = (await proof.executeCommand(
      a.owner,
      api.lib.clientPortalLinks.issueClientPortalLink,
      { eventId: a.eventId },
    )) as string;
    const view = (await proof.anonymous.query(api.clientPortal.getEvent, {
      token: link,
    })) as { event?: { title?: string } } | null;
    expect(view?.event?.title).toBe("Porter dinner");
    expect(JSON.stringify(view)).toContain("Captain");
    expectNothingPrivate(view);

    const otherLink = (await proof.executeCommand(
      b.owner,
      api.lib.clientPortalLinks.issueClientPortalLink,
      { eventId: b.eventId },
    )) as string;
    const other = await proof.anonymous.query(api.clientPortal.getEvent, {
      token: otherLink,
    });
    expect(JSON.stringify(other)).toContain("Other lunch");
    expect(JSON.stringify(other)).not.toContain("Porter dinner");

    // An old signed link for B (no saved link row) works near the event and
    // stops 90 days after it ended.
    const legacy = await createClientPortalToken({
      eventId: b.eventId,
      tenantId: "tenant-portal-b",
    });
    await b.owner.run(async (ctx) => {
      const rows = (await ctx.db
        .query("clientPortalLinks")
        .collect()) as Array<{
        _id: string;
        eventId: string;
      }>;
      for (const row of rows.filter((link) => link.eventId === b.eventId)) {
        await ctx.db.patch(row._id as never, { deletedAt: Date.now() });
      }
    });
    expect(
      await proof.anonymous.query(api.clientPortal.getEvent, { token: legacy }),
    ).not.toBeNull();
    await b.owner.run(async (ctx) => {
      await ctx.db.patch(b.eventId as never, {
        startsAt: Date.now() - 100 * DAY,
        endsAt: Date.now() - 91 * DAY,
      });
    });
    expect(
      await proof.anonymous.query(api.clientPortal.getEvent, { token: legacy }),
    ).toBeNull();
  });

  it("/accept hides private words and refuses expired or finished requests", async () => {
    const proof = harness();
    const a = await sentProposal(proof, "tenant-accept-a", "Porter dinner");
    const request = (await proof.executeCommand(
      a.owner,
      api.mutations.SignatureRequest_createViaRequestSignature,
      {
        proposalRevisionId: a.revisionId,
        proposalId: a.proposalId,
        recipientEmail: "signer@example.com",
        recipientName: "Casey Contact",
      },
    )) as { docId: string };
    const view = await proof.anonymous.query(
      api.signatureAcceptance.getPendingSignatureRequest,
      { token: request.docId },
    );
    expect(JSON.stringify(view)).toContain("Porter dinner");
    expectNothingPrivate(view);

    await a.owner.run(async (ctx) => {
      await ctx.db.patch(request.docId as never, {
        expiresAt: Date.now() - 60_000,
      });
    });
    expect(
      await proof.anonymous.query(
        api.signatureAcceptance.getPendingSignatureRequest,
        { token: request.docId },
      ),
    ).toBeNull();
    // A share-link id is not a signing token.
    expect(
      await proof.anonymous.query(
        api.signatureAcceptance.getPendingSignatureRequest,
        { token: a.shareToken },
      ),
    ).toBeNull();
  });

  it("/quote offers only service style and occasion names", async () => {
    const proof = harness();
    await sentProposal(proof, "tenant-quote-a", "Porter dinner");
    const options = (await proof.anonymous.query(
      api.quoteBuilder.getQuoteFormOptions,
      {},
    )) as {
      serviceStyles: Array<Record<string, unknown>>;
      occasions: Array<Record<string, unknown>>;
      company: Record<string, unknown> | null;
    };
    for (const row of [...options.serviceStyles, ...options.occasions]) {
      for (const key of Object.keys(row)) {
        expect(["_id", "name", "sortOrder"]).toContain(key);
      }
    }
    // The caterer's public name, address, phone and website only (#125),
    // nothing else of the organization record.
    for (const key of Object.keys(options.company ?? {})) {
      expect(["name", "address", "phone", "website"]).toContain(key);
    }
    expectNothingPrivate(options);
    expect(JSON.stringify(options)).not.toContain("Porter dinner");
  });
});
