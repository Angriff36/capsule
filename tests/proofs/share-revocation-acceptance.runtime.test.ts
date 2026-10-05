/**
 * PL-REVISION share links (AC-253, AC-254, AC-097 share legs).
 *
 * A share link always shows the frozen revision it was made for:
 *   - a later change to the live proposal does not reach it
 *   - a revoked link and an expired link show nothing and record no view
 *   - a view is recorded: first view stays, last view moves, viewer kept
 *   - when the proposal is replaced, the old link still shows what was shared
 *     and names the newer proposal, with its working link when it has one
 */
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 8, 28, 12);
const TENANT = "tenant-share-links";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  vi.useFakeTimers({ toFake: ["Date"], now: START });
});
afterAll(() => {
  vi.useRealTimers();
});

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

async function owner(proof: Proof) {
  const actor = proof.asRole({
    subject: "share-owner",
    role: "owner",
    tenantId: TENANT,
  });
  await proof.seedEntity(actor, "people", {
    tenantId: TENANT,
    givenName: "Sam",
    familyName: "Seller",
    email: "share-owner@example.com",
    role: "owner",
    employmentType: "full_time",
    status: "active",
    authSubjectId: "share-owner",
    version: 1,
  });
  return actor;
}

/** Draft, price and send a proposal; returns it with its frozen revision. */
async function sentProposal(
  proof: Proof,
  actor: Actor,
  clientId: string,
  title: string,
) {
  const proposal = (await proof.executeCommand(
    actor,
    api.mutations.Proposal_createViaDraft,
    {
      clientId,
      title,
      subtotal: 900,
      taxAmount: 0,
      discountAmount: 0,
      total: 900,
      guestCount: 30,
      terms: `${title} terms`,
    },
  )) as { docId: string };
  await proof.executeCommand(
    actor,
    api.mutations.ProposalLineItem_createViaAddLine,
    {
      proposalId: proposal.docId,
      description: `${title} dinner`,
      pricingBasis: "flat",
      unitPrice: 900,
      amount: 900,
    },
  );
  await proof.executeCommand(
    actor,
    api.lib.proposalRevision.sendProposalWithRevisionCapture,
    { docId: proposal.docId },
  );
  const [revision] = (await actor.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId: proposal.docId },
  )) as Array<{ _id: string }>;
  return { proposalId: proposal.docId, revisionId: revision._id };
}

async function share(
  proof: Proof,
  actor: Actor,
  sent: { proposalId: string; revisionId: string },
  expiresAt?: number,
) {
  const link = (await proof.executeCommand(
    actor,
    api.mutations.ShareLink_create,
    {
      proposalId: sent.proposalId,
      proposalRevisionId: sent.revisionId,
      ...(expiresAt ? { expiresAt } : {}),
    },
  )) as { _id?: string; docId?: string };
  return String(link._id ?? link.docId);
}

describe("runtime proof: share links", () => {
  it("serves the frozen revision, records views, and dies when revoked or expired", async () => {
    const proof = harness();
    const actor = await owner(proof);
    const client = (await proof.executeCommand(
      actor,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Share client" },
    )) as { docId: string };
    const sent = await sentProposal(
      proof,
      actor,
      client.docId,
      "Harvest supper",
    );
    const token = await share(proof, actor, sent);
    const view = () =>
      proof.anonymous.query(api.shareLinks.getSharedProposal, { token });

    // A later change to the live proposal never reaches the shared copy.
    await actor.run((ctx) =>
      ctx.db.patch(sent.proposalId as never, {
        title: "Changed later",
        terms: "Changed later",
      }),
    );
    const shared = (await view()) as any;
    expect(shared.proposal).toMatchObject({
      title: "Harvest supper",
      terms: "Harvest supper terms",
      total: 900,
    });
    expect(shared.revisionNumber).toBe(1);
    expect(shared.replacedBy).toBeNull();

    // First view stays, last view moves, the viewer is kept.
    await proof.anonymous.mutation(api.shareLinks.recordShareView, {
      token,
      viewerIdentity: "203.0.113.5 · phone",
    });
    vi.setSystemTime(START + 2 * DAY);
    await proof.anonymous.mutation(api.shareLinks.recordShareView, { token });
    const linkRow = async () =>
      (await actor.run((ctx) => ctx.db.get(token as never))) as any;
    expect(await linkRow()).toMatchObject({
      viewCount: 2,
      firstViewedAt: START,
      lastViewedAt: START + 2 * DAY,
      lastViewerIdentity: "203.0.113.5 · phone",
      proposalRevisionId: sent.revisionId,
    });

    // Revoked: nothing shown, no view recorded.
    await proof.executeCommand(actor, api.mutations.ShareLink_revoke, {
      docId: token,
    });
    expect(await view()).toBeNull();
    await proof.anonymous.mutation(api.shareLinks.recordShareView, { token });
    expect((await linkRow()).viewCount).toBe(2);

    // Expired: works until its end date, then shows nothing.
    const shortLived = await share(proof, actor, sent, START + 5 * DAY);
    expect(
      await proof.anonymous.query(api.shareLinks.getSharedProposal, {
        token: shortLived,
      }),
    ).not.toBeNull();
    vi.setSystemTime(START + 6 * DAY);
    expect(
      await proof.anonymous.query(api.shareLinks.getSharedProposal, {
        token: shortLived,
      }),
    ).toBeNull();
    vi.setSystemTime(START);
  });

  it("an old link to a replaced proposal still shows what was shared and names the newer one", async () => {
    const proof = harness();
    const actor = await owner(proof);
    const client = (await proof.executeCommand(
      actor,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Replace client" },
    )) as { docId: string };
    const first = await sentProposal(proof, actor, client.docId, "First menu");
    const oldToken = await share(proof, actor, first);
    const second = await sentProposal(
      proof,
      actor,
      client.docId,
      "Second menu",
    );
    await proof.executeCommand(actor, api.mutations.Proposal_supersede, {
      docId: first.proposalId,
      revisedById: second.proposalId,
      reason: "Client changed the menu",
    });
    const oldView = () =>
      proof.anonymous.query(api.shareLinks.getSharedProposal, {
        token: oldToken,
      });

    // No link for the newer proposal yet: the old link names it only.
    let replaced = (await oldView()) as any;
    expect(replaced.proposal.title).toBe("First menu");
    expect(replaced.replacedBy).toEqual({
      title: "Second menu",
      shareToken: null,
    });

    // Once the newer proposal is shared, the old link points to it.
    const newToken = await share(proof, actor, second);
    replaced = (await oldView()) as any;
    expect(replaced.replacedBy).toEqual({
      title: "Second menu",
      shareToken: newToken,
    });
    const next = (await proof.anonymous.query(
      api.shareLinks.getSharedProposal,
      { token: newToken },
    )) as any;
    expect(next.proposal.title).toBe("Second menu");
    expect(next.replacedBy).toBeNull();
  });
});
