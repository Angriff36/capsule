/**
 * Runtime proof: co-branded proposals (work/mangia-venue-partner-playbook.pdf,
 * section 06). A proposal sent for an event at a partner venue carries the
 * venue's name, logo and brand colour, frozen at send; the shared proposal
 * shows them next to the company. A venue that is not a partner shows no
 * venue brand, and a logo file another company owns is never shown.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  M,
  run,
  seedVenueEvent,
  type Proof,
  type Role,
} from "./venue-layout.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

async function storeBlob(role: Role, text: string): Promise<string> {
  return (await role.run((ctx: any) =>
    ctx.storage.store(new Blob([text], { type: "image/png" })),
  )) as string;
}

async function sendAndShare(
  proof: Proof,
  owner: Role,
  clientId: string,
  eventId: string,
  title: string,
) {
  const proposal = await run(proof, owner, M.Proposal_createViaDraft, {
    clientId,
    title,
    subtotal: 1200,
    taxAmount: 0,
    discountAmount: 0,
    total: 1200,
    guestCount: 90,
    eventId,
  });
  await run(proof, owner, M.ProposalLineItem_createViaAddLine, {
    proposalId: proposal.docId,
    description: "Plated dinner",
    pricingBasis: "flat",
    unitPrice: 1200,
    amount: 1200,
  });
  await proof.executeCommand(
    owner,
    api.lib.proposalRevision.sendProposalWithRevisionCapture,
    { docId: proposal.docId },
  );
  const revisions = (await owner.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId: proposal.docId },
  )) as Array<{ _id: string; revisionNumber: number }>;
  const revision = revisions.sort(
    (a, b) => b.revisionNumber - a.revisionNumber,
  )[0];
  const link = (await proof.executeCommand(owner, M.ShareLink_create, {
    proposalId: proposal.docId,
    proposalRevisionId: revision._id,
  })) as { _id?: string; docId?: string };
  return String(link._id ?? link.docId);
}

describe("runtime proof: co-branded proposals", () => {
  it("a partner venue's name, logo and colour show on the shared proposal and stay as sent", async () => {
    const proof = harness();
    const tenantId = "tenant-cobrand";
    const { roles, venueId, clientId, eventId } = await seedVenueEvent(
      proof,
      tenantId,
    );
    const view = (token: string) =>
      roles.owner.query(api.shareLinks.getSharedProposal, {
        token,
      }) as Promise<any>;

    // Not a partner: no venue brand.
    const plainToken = await sendAndShare(
      proof,
      roles.owner,
      clientId,
      eventId,
      "Before partnership",
    );
    expect((await view(plainToken)).brand.partnerVenue).toBeNull();

    // Partner with a logo and colour.
    const logo = await storeBlob(roles.owner, "garden-hall-logo");
    await proof.executeCommand(roles.events, M.Venue_setPartnership, {
      docId: venueId,
      partnerTier: "catering_only",
    });
    await proof.executeCommand(roles.events, M.Venue_setBrand, {
      docId: venueId,
      logoStorageId: logo,
      brandColor: "#1f3a5f",
    });
    expect(
      await roles.events.query(api.brandLogo.getVenueLogoUrl, {
        venueId: venueId as never,
      }),
    ).toEqual(expect.any(String));

    const token = await sendAndShare(
      proof,
      roles.owner,
      clientId,
      eventId,
      "Garden dinner",
    );
    const shared = await view(token);
    expect(shared.brand.partnerVenue).toEqual({
      name: "Garden Hall",
      logoUrl: expect.any(String),
      color: "#1f3a5f",
    });

    // A later logo change or a cleared colour does not change what was sent.
    const newLogo = await storeBlob(roles.owner, "garden-hall-logo-2");
    await proof.executeCommand(roles.events, M.Venue_setBrand, {
      docId: venueId,
      logoStorageId: newLogo,
    });
    const after = await view(token);
    expect(after.brand.partnerVenue.color).toBe("#1f3a5f");
    expect(after.brand.partnerVenue.logoUrl).toBe(
      shared.brand.partnerVenue.logoUrl,
    );
  });

  it("a logo file another company owns is never shown", async () => {
    const proof = harness();
    const tenantId = "tenant-cobrand-own";
    const { roles, venueId, clientId, eventId } = await seedVenueEvent(
      proof,
      tenantId,
    );
    // Another company's attachment owns this file.
    const foreign = await storeBlob(roles.owner, "other-company-logo");
    await roles.owner.run((ctx: any) =>
      ctx.db.insert("attachments", {
        tenantId: "tenant-someone-else",
        storageId: foreign,
        parentType: "venue",
        parentId: "other-venue",
        fileName: "logo.png",
        contentType: "image/png",
        fileSize: 10,
        uploadedAt: Date.now(),
        version: 1,
      }),
    );
    await proof.executeCommand(roles.events, M.Venue_setPartnership, {
      docId: venueId,
      partnerTier: "catering_only",
    });
    await proof.executeCommand(roles.events, M.Venue_setBrand, {
      docId: venueId,
      logoStorageId: foreign,
      brandColor: "not a colour",
    });
    expect(
      await roles.events.query(api.brandLogo.getVenueLogoUrl, {
        venueId: venueId as never,
      }),
    ).toBeNull();
    const token = await sendAndShare(
      proof,
      roles.owner,
      clientId,
      eventId,
      "Garden dinner",
    );
    const shared = (await roles.owner.query(api.shareLinks.getSharedProposal, {
      token,
    })) as any;
    expect(shared.brand.partnerVenue).toEqual({
      name: "Garden Hall",
      logoUrl: null,
      color: null,
    });
  });
});
