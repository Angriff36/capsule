/**
 * AC-547 (BE-13-gs-rental-proposals): rental/decor proposal lines.
 *
 * A proposal line can name a rentable item (Equipment). The line then:
 *   - prices through the one central calc like every other line
 *   - is checked to be the same company's item (a foreign or retired item is
 *     refused)
 *   - is frozen into the revision the client accepts, with the item's name
 *   - counts in the accepted total, the one amount the deposit and invoice
 *     follow
 *   - is copied into a change started from the accepted proposal
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { linkStaffProfile } from "./reconciliation-failure-isolation.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-rental-lines";

async function equipment(
  actor: { run: (fn: (ctx: any) => Promise<unknown>) => Promise<unknown> },
  tenantId: string,
  name: string,
  status: "active" | "retired" = "active",
) {
  return (await actor.run((ctx) =>
    ctx.db.insert("equipments", {
      tenantId,
      name,
      assetTag: `${name}-tag`,
      category: "Decor",
      ownership: "rented",
      quantity: 12,
      purchaseValue: 950,
      condition: "good",
      status,
      registeredAt: 1,
      version: 1,
    }),
  )) as string;
}

describe("runtime proof: rental proposal lines", () => {
  it("rental lines price, approve and change-order like other proposal lines", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "rental-sales",
      role: "sales_manager",
      tenantId: TENANT,
    });
    await linkStaffProfile(proof, TENANT, "rental-sales", "sales_manager");

    const arch = await equipment(sales, TENANT, "Birch arch");
    const retired = await equipment(sales, TENANT, "Old arch", "retired");
    const foreign = await equipment(
      sales,
      "tenant-other-company",
      "Their arch",
    );

    // Sales see the company's usable rental items - name and kind only.
    const choices = (await sales.query(
      (api.lib as any).proposalPricing.listRentalItems,
      {},
    )) as any[];
    expect(choices).toEqual([
      {
        equipmentId: arch,
        name: "Birch arch",
        category: "Decor",
        ownership: "rented",
      },
    ]);

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Rental client" },
    )) as { docId: string };
    const draftArgs = (equipmentId: string) => ({
      clientId: client.docId,
      title: "Garden wedding",
      guestCount: 50,
      subtotal: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 0,
      lines: [
        {
          description: "Plated dinner",
          pricingBasis: "per_person",
          unitPrice: 40,
        },
        {
          description: "Birch arch rental",
          pricingBasis: "per_unit",
          unitPrice: 150,
          quantity: 2,
          unit: "arch",
          equipmentId,
        },
      ],
    });

    // Another company's item, or a retired one, never reaches a proposal.
    for (const bad of [foreign, retired]) {
      await expect(
        sales.mutation(
          (api.lib as any).proposalDraft.draftProposalWithLines,
          draftArgs(bad),
        ),
      ).rejects.toThrow(/not in your equipment list/);
    }

    await sales.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      draftArgs(arch),
    );
    const proposal = (
      (await sales.query(api.queries.listProposal, {})) as any[]
    )[0];
    // Priced by the central calc: 50 x 40 + 2 x 150.
    expect(proposal).toMatchObject({ subtotal: 2300, total: 2300 });

    const lines = async (proposalId: string) =>
      ((await sales.query(api.queries.listProposalLineItem, {})) as any[])
        .filter((row) => row.proposalId === proposalId && row.deletedAt == null)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    const rentalLine = (await lines(proposal._id))[1];
    expect(rentalLine).toMatchObject({ equipmentId: arch, amount: 300 });

    // Revising the rental line re-prices it and keeps the item.
    await sales.mutation(
      (api.lib as any).proposalPricing.reviseProposalLineAndRecompute,
      {
        docId: rentalLine._id,
        version: rentalLine.version,
        description: "Birch arch rental",
        pricingBasis: "per_unit",
        unitPrice: 175,
        quantity: 2,
        unit: "arch",
        sortOrder: rentalLine.sortOrder,
        equipmentId: arch,
      },
    );
    expect((await lines(proposal._id))[1]).toMatchObject({
      equipmentId: arch,
      amount: 350,
    });
    await expect(
      sales.mutation(
        (api.lib as any).proposalPricing.addProposalLineAndRecompute,
        {
          proposalId: proposal._id,
          description: "Their arch",
          pricingBasis: "flat",
          unitPrice: 10,
          equipmentId: foreign,
        },
      ),
    ).rejects.toThrow(/not in your equipment list/);

    // The client approves the frozen revision, rental line and item name in it.
    const current = (
      (await sales.query(api.queries.listProposal, {})) as any[]
    )[0];
    expect(current.total).toBe(2350);
    await sales.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: current._id, version: current.version },
    );
    const revision = (
      (await sales.query(api.queries.listProposalRevisionByProposalId, {
        proposalId: current._id,
      })) as any[]
    )[0];
    const snapshot = JSON.parse(revision.snapshot);
    expect(snapshot.lineItems[1]).toMatchObject({
      description: "Birch arch rental",
      amount: 350,
      rentalItem: { id: arch, name: "Birch arch", ownership: "rented" },
    });
    expect(snapshot.lineItems[0].rentalItem).toBeNull();
    expect(snapshot.proposal.total).toBe(2350);

    await proof.executeCommand(sales, api.mutations.Proposal_markViewed, {
      docId: current._id,
    });
    await proof.executeCommand(sales, api.mutations.Proposal_accept, {
      docId: current._id,
      acceptedRevisionId: revision._id,
    });
    const accepted = (
      (await sales.query(api.queries.listProposal, {})) as any[]
    ).find((row) => row._id === current._id);
    // The accepted total - the amount the deposit and invoice follow - holds
    // the rental line.
    expect(accepted).toMatchObject({ status: "accepted", total: 2350 });

    // A change order starts from the accepted proposal and keeps the rental.
    const change = (await proof.executeCommand(
      sales,
      (api.lib as any).proposalChangeDraft.startProposalChange,
      { proposalId: current._id },
    )) as { docId: string };
    const changeLines = await lines(change.docId);
    expect(changeLines.map((row) => row.equipmentId ?? null)).toEqual([
      null,
      arch,
    ]);
    expect(changeLines[1]).toMatchObject({ amount: 350, unitPrice: 175 });
    expect(
      ((await lines(current._id)) as any[]).map((row) => row.amount),
    ).toEqual([2000, 350]);
  });
});
