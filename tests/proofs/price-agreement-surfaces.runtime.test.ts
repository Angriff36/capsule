/**
 * Runtime proof (AC-094, PR06-01): one menu choice, one set of prices on every
 * surface. A quote picks a menu from the public menu; after conversion the
 * proposal is sent and accepted. The share page, the proposal PDF, the
 * signing page and the client portal all show the totals the central
 * calculation gives for the public menu's prices — and none of them carries
 * food cost, margin or kitchen-only words.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { computeProposalPricing } from "../../src/lib/pricing";
import { projectProposalPdf } from "../../src/features/clients/proposalPdfProjection";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const GUESTS = 80;
const PRIVATE = ["PRIVATE-RECIPE-STEP", "PRIVATE-LINE-NOTE"];

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
type ActionRunner = { action: (fn: unknown, args?: unknown) => Promise<any> };
const asActions = (actor: Actor) => actor as unknown as ActionRunner;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function seedMenu(proof: Proof, owner: Actor) {
  await proof.executeCommand(owner, M.Organization_createViaRegister, {
    name: "Agreement kitchen",
  });
  const menu = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name: "Harvest supper",
  })) as { docId: string };
  for (const [sortOrder, [name, price]] of (
    [
      ["Roast chicken", 21.75],
      ["Root vegetables", 7.5],
    ] as const
  ).entries()) {
    const dish = (await proof.executeCommand(owner, M.Dish_createViaIntroduce, {
      name,
      portionSize: 1,
      portionUnit: "serving",
    })) as { docId: string };
    await owner.run(async (ctx) => {
      await ctx.db.patch(dish.docId as never, {
        recipeInstructions: "PRIVATE-RECIPE-STEP",
      });
    });
    await proof.executeCommand(owner, M.MenuDish_createViaAdd, {
      menuId: menu.docId,
      dishId: dish.docId,
      sortOrder,
      sellingPrice: price,
      specialInstructions: "PRIVATE-LINE-NOTE",
    });
  }
  await proof.executeCommand(owner, M.Menu_markPublished, {
    docId: menu.docId,
  });
  return menu.docId;
}

describe("every client surface shows the same prices (AC-094)", () => {
  it("share page, PDF, signing page and portal agree with the central calc", async () => {
    const proof = harness();
    const tenantId = "tenant-agreement";
    const subject = "o-agreement";
    const owner = proof.asRole({ subject, role: "owner", tenantId });
    await proof.seedEntity(owner, "people", {
      tenantId,
      givenName: "Ada",
      familyName: "Owner",
      email: `${subject}@example.com`,
      role: "owner",
      employmentType: "full_time",
      status: "active",
      authSubjectId: subject,
      version: 1,
    });
    const menuId = await seedMenu(proof, owner);

    const [shown] = (await proof.anonymous.query(
      api.publicMenu.getPublicMenu,
      {},
    )) as any[];
    const expected = computeProposalPricing({
      lines: shown.dishes.map((d: any) => ({
        pricingBasis: "per_person" as const,
        unitPrice: d.price,
      })),
      guestCount: GUESTS,
    });

    const submitted = await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      {
        clientName: "Morgan Prospect",
        email: "morgan@example.com",
        eventDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        guestCount: GUESTS,
        consent: true,
        menuId,
      },
    );
    const converted = await asActions(owner).action(
      api.quoteBuilder.processQuoteSubmission,
      { submissionId: submitted.submissionId },
    );
    expect(converted.errors).toEqual([]);
    const proposalId = converted.proposalId as string;

    await proof.executeCommand(
      owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposalId },
    );
    const [revision] = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId },
    )) as any[];

    // Share page.
    const share = (await proof.executeCommand(owner, M.ShareLink_create, {
      proposalId,
      proposalRevisionId: revision._id,
    })) as { docId?: string; _id?: string };
    const shared = (await proof.anonymous.query(
      api.shareLinks.getSharedProposal,
      { token: (share.docId ?? share._id) as string },
    )) as any;
    expect(shared.proposal.subtotal).toBe(expected.subtotal);
    expect(shared.proposal.total).toBe(expected.total);

    // PDF (built from the sent revision).
    const live = (await owner.query(api.queries.getProposal, {
      id: proposalId,
    })) as any;
    const pdf = projectProposalPdf(live, "Morgan Prospect", revision);
    expect(pdf.source).toBe("revision");
    expect(pdf.proposal.total).toBe(expected.total);

    // Signing page.
    const request = (await proof.executeCommand(
      owner,
      M.SignatureRequest_createViaRequestSignature,
      {
        proposalRevisionId: revision._id,
        proposalId,
        recipientEmail: "morgan@example.com",
        recipientName: "Morgan Prospect",
      },
    )) as { docId: string };
    const signing = (await proof.anonymous.query(
      api.signatureAcceptance.getPendingSignatureRequest,
      { token: request.docId },
    )) as any;
    expect(signing.proposal.total).toBe(expected.total);
    // The client sees the menu and the priced lines they accept.
    expect(
      signing.lines.reduce((sum: number, l: any) => sum + l.amount, 0),
    ).toBe(expected.subtotal);
    expect(signing.dishes.map((d: any) => d.name).sort()).toEqual(
      shown.dishes.map((d: any) => d.name).sort(),
    );

    // Accepted → client portal.
    await proof.executeCommand(owner, M.Proposal_markViewed, {
      docId: proposalId,
    });
    await proof.executeCommand(owner, M.Proposal_accept, { docId: proposalId });
    const link = (await proof.executeCommand(
      owner,
      api.lib.clientPortalLinks.issueClientPortalLink,
      { eventId: converted.eventId },
    )) as string;
    const portal = (await proof.anonymous.query(api.clientPortal.getEvent, {
      token: link,
    })) as any;
    const portalProposal = portal.documents.proposals.find(
      (p: any) => p._id === proposalId,
    );
    expect(portalProposal.total).toBe(expected.total);
    expect(
      portalProposal.pricingLines.map((l: any) => l.unitPrice).sort(),
    ).toEqual(shown.dishes.map((d: any) => d.price).sort());

    const everything = JSON.stringify([shown, shared, pdf, signing, portal]);
    for (const secret of PRIVATE) expect(everything).not.toContain(secret);
    expect(everything.toLowerCase()).not.toContain("margin");
    expect(everything.toLowerCase()).not.toContain("foodcost");
  });
});
