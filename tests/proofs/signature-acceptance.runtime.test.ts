/**
 * PL-REVISION acceptance (AC-266, AC-267, AC-097 acceptance legs).
 *
 *   - a signature request completes once through its token: status, time and
 *     signed-record reference are stored, the proposal is accepted on the
 *     exact revision, and a second completion changes nothing
 *   - a request for a proposal that was replaced is refused, and the refusal
 *     writes nothing (the request stays open, the proposal stays replaced)
 *   - an expired request is refused
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-signature-accept";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
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

async function setup() {
  const proof = harness();
  const owner = proof.asRole({
    subject: "signature-owner",
    role: "owner",
    tenantId: TENANT,
  });
  await proof.seedEntity(owner, "people", {
    tenantId: TENANT,
    givenName: "Sid",
    familyName: "Owner",
    email: "signature-owner@example.com",
    role: "owner",
    employmentType: "full_time",
    status: "active",
    authSubjectId: "signature-owner",
    version: 1,
  });
  const client = (await proof.executeCommand(
    owner,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: "Signature client" },
  )) as { docId: string };
  return { proof, owner, clientId: client.docId };
}

async function sentProposal(
  proof: Proof,
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
      subtotal: 800,
      taxAmount: 0,
      discountAmount: 0,
      total: 800,
      guestCount: 20,
    },
  )) as { docId: string };
  await proof.executeCommand(
    owner,
    api.mutations.ProposalLineItem_createViaAddLine,
    {
      proposalId: proposal.docId,
      description: "Buffet",
      pricingBasis: "flat",
      unitPrice: 800,
      amount: 800,
    },
  );
  await proof.executeCommand(
    owner,
    api.lib.proposalRevision.sendProposalWithRevisionCapture,
    { docId: proposal.docId },
  );
  const [revision] = (await owner.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId: proposal.docId },
  )) as Array<{ _id: string }>;
  return { proposalId: proposal.docId, revisionId: revision._id };
}

async function requestSignature(
  proof: Proof,
  owner: Actor,
  sent: { proposalId: string; revisionId: string },
  expiresAt?: number,
) {
  const request = (await proof.executeCommand(
    owner,
    api.mutations.SignatureRequest_createViaRequestSignature,
    {
      proposalRevisionId: sent.revisionId,
      proposalId: sent.proposalId,
      recipientEmail: "signer@example.com",
      recipientName: "Casey Contact",
      ...(expiresAt ? { expiresAt } : {}),
    },
  )) as { docId: string };
  return request.docId;
}

const row = async (owner: Actor, id: string) =>
  (await owner.run((ctx) => ctx.db.get(id as never))) as any;

describe("runtime proof: signature acceptance", () => {
  it("completes once, records the signed revision, and a second completion changes nothing", async () => {
    const { proof, owner, clientId } = await setup();
    const sent = await sentProposal(proof, owner, clientId, "Spring lunch");
    const token = await requestSignature(proof, owner, sent);
    expect((await row(owner, token)).status).toBe("requested");

    await proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
      token,
      signerUserAgent: "phone",
    });
    const done = await row(owner, token);
    expect(done).toMatchObject({
      status: "completed",
      proposalRevisionId: sent.revisionId,
      signerUserAgent: "phone",
    });
    expect(typeof done.completedAt).toBe("number");
    expect(done.signedArtifactReference).toMatch(/^internal:click-accept:/);
    expect(await row(owner, sent.proposalId)).toMatchObject({
      status: "accepted",
      acceptedRevisionId: sent.revisionId,
    });

    // The same callback again: same result, nothing rewritten.
    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token,
      }),
    ).resolves.toEqual({ ok: true });
    const again = await row(owner, token);
    expect(again.completedAt).toBe(done.completedAt);
    expect(again.signedArtifactReference).toBe(done.signedArtifactReference);
    expect(again.version).toBe(done.version);
    const accepted = (await owner.run((ctx) =>
      ctx.db.query("manifestEvents").collect(),
    )) as any[];
    expect(
      accepted.filter(
        (event) =>
          event.type === "ProposalAccepted" &&
          event.entityId === sent.proposalId,
      ),
    ).toHaveLength(1);
  });

  it("refuses a replaced proposal's request and writes nothing", async () => {
    const { proof, owner, clientId } = await setup();
    const first = await sentProposal(proof, owner, clientId, "Summer lunch");
    const token = await requestSignature(proof, owner, first);

    // Revise and send the new version: the first proposal is replaced.
    const revised = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: first.proposalId },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: revised.docId },
    );
    expect((await row(owner, first.proposalId)).status).toBe("superseded");

    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token,
      }),
    ).rejects.toThrow();
    const request = await row(owner, token);
    expect(request.status).toBe("requested");
    expect(request.completedAt ?? null).toBeNull();
    expect(await row(owner, first.proposalId)).toMatchObject({
      status: "superseded",
    });
    expect(
      (await row(owner, first.proposalId)).acceptedRevisionId ?? null,
    ).toBeNull();
    const completions = (
      (await owner.run((ctx) =>
        ctx.db.query("manifestEvents").collect(),
      )) as any[]
    ).filter((event) => event.type === "SignatureCompleted");
    expect(completions).toHaveLength(0);
  });

  it("refuses an expired request", async () => {
    const { proof, owner, clientId } = await setup();
    const sent = await sentProposal(proof, owner, clientId, "Autumn lunch");
    const token = await requestSignature(proof, owner, sent, Date.now() + 1000);
    await owner.run((ctx) =>
      ctx.db.patch(token as never, { expiresAt: Date.now() - 1000 }),
    );
    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token,
      }),
    ).rejects.toThrow(/no longer valid/);
    expect((await row(owner, token)).status).toBe("requested");
    expect((await row(owner, sent.proposalId)).status).toBe("sent");
  });
});
