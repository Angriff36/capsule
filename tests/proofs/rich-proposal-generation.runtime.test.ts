/**
 * PL-PROPOSAL-DRAFT runtime proof (AC-377, AC-409 P leg, AC-262, AC-096): a
 * proposal built from the event keeps, per section, the records it came from;
 * missing material shows as draft issues (never an invented price); the sent
 * revision, the PDF and the web share page all show the same money; and no
 * placeholder company name is ever frozen into a sent revision.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { projectProposalPdf } from "../../src/features/clients/proposalPdfProjection";
import { linkStaffProfile } from "./reconciliation-failure-isolation.runtime.helpers";
import {
  generate,
  liveLines,
  proposalRow,
  report,
  seedWorld,
} from "./proposal-generate.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function sendAndReadRevision(
  w: Awaited<ReturnType<typeof seedWorld>>,
  proposalId: string,
) {
  await w.sales.mutation(
    (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
    {
      docId: proposalId,
    },
  );
  const revisions = (await w.sales.query(
    api.queries.listProposalRevisionByProposalId,
    {
      proposalId,
    } as never,
  )) as unknown as { _id: string; snapshot: string }[];
  expect(revisions).toHaveLength(1);
  return revisions[0];
}

describe("rich proposal generation (AC-377 / AC-409)", () => {
  it("draft sections carry sources and totals agree with web/PDF", async () => {
    const tenantId = "tenant-rich-generation";
    const w = await seedWorld(tenantId);
    // A dish with no menu price is surfaced, not priced by guesswork.
    const special = (await w.runOwner(M.Dish_createViaIntroduce, {
      name: "Chef's special",
      portionSize: 1,
      portionUnit: "serving",
    })) as { docId: string };
    const specialLine = (await w.runOwner(M.EventDish_createViaAddToEvent, {
      eventId: w.eventId,
      dishId: special.docId,
      quantityServings: 10,
    })) as { docId: string };

    const built = await generate(w);
    const lines = await liveLines(w, built.proposalId);
    expect(lines.map((l) => l.description)).toEqual([
      "Cedar salmon",
      "Smoked brisket",
    ]);

    const r = await report(w, built.proposalId);
    const section = (key: string) => r.sections.find((s) => s.key === key)!;
    expect(section("event").sources).toContainEqual({
      table: "events",
      id: w.eventId,
    });
    const menuTables = section("menu").sources.map((s) => `${s.table}:${s.id}`);
    expect(menuTables).toContain(`eventDishes:${w.eventDishes.salmon}`);
    expect(menuTables).toContain(`eventDishes:${w.eventDishes.brisket}`);
    expect(
      section("menu").sources.filter((s) => s.table === "menuDishes"),
    ).toHaveLength(2);
    expect(
      section("pricing")
        .sources.filter((s) => s.table === "proposalLineItems")
        .map((s) => s.id)
        .sort(),
    ).toEqual(lines.map((l) => l._id).sort());
    expect(r.sections.every((s) => !s.stale)).toBe(true);
    const unpriced = r.issues.find((i) => i.code === "dish_no_menu_price");
    expect(unpriced?.recordIds).toEqual([specialLine.docId]);
    expect(unpriced?.message).toContain("Chef's special");
    expect(r.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["no_venue", "no_terms"]),
    );
    expect(r.issues.map((i) => i.code)).not.toContain("no_company_name");

    // Sending stays its own explicit step; the revision, PDF and web page agree.
    const row = await proposalRow(w, built.proposalId);
    const revision = await sendAndReadRevision(w, built.proposalId);
    const snapshot = JSON.parse(revision.snapshot);
    const money = {
      subtotal: row.subtotal,
      taxAmount: row.taxAmount,
      total: row.total,
    };
    expect(snapshot.proposal).toMatchObject(money);
    expect(
      snapshot.lineItems.map((l: { amount: number }) => l.amount).sort(),
    ).toEqual(lines.map((l) => l.amount).sort());
    expect(snapshot.tenant.name).toBe("Proof Kitchen Catering");
    const pdf = projectProposalPdf(
      { ...row, subtotal: 1, total: 1 } as never,
      "Live client",
      {
        snapshot: revision.snapshot,
      },
    );
    expect(pdf.source).toBe("revision");
    expect(pdf.proposal).toMatchObject(money);
    await linkStaffProfile(w.proof, tenantId, `sales-${tenantId}`);
    const link = (await w.proof.executeCommand(w.sales, M.ShareLink_create, {
      proposalId: built.proposalId,
      proposalRevisionId: revision._id,
    } as never)) as { _id: string };
    const shared = (await w.sales.query(api.shareLinks.getSharedProposal, {
      token: link._id,
    })) as {
      proposal: Record<string, unknown>;
    } | null;
    expect(shared?.proposal).toMatchObject(money);
  });
});

describe("no placeholder company name (AC-096)", () => {
  it('publishing with no organization row never freezes "Tenant"', async () => {
    const w = await seedWorld("tenant-rich-no-org", { organization: false });
    const built = await generate(w);
    const r = await report(w, built.proposalId);
    expect(r.issues.find((i) => i.code === "no_company_name")?.message).toMatch(
      /company name/,
    );
    const revision = await sendAndReadRevision(w, built.proposalId);
    const snapshot = JSON.parse(revision.snapshot);
    expect(snapshot.tenant.name).toBeNull();
    expect(revision.snapshot).not.toContain('"Tenant"');
  });
});
