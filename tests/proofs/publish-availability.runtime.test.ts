/**
 * Runtime proof (AC-419 BE-7.2-09): before a proposal goes out, rental and
 * menu lines are checked where Capsule knows enough, and a conflict is an
 * issue on that one line - never a silently dropped line.
 *
 * We own 100 gold chargers; another event already holds 80 on the same day.
 * The proposal asks for 50 chargers and 10 linens (we own 40, none booked),
 * plus one dish from a menu that is later taken off sale. The draft report
 * names the charger line (20 free, asks for 50, booked by the other event)
 * and the dish line; the linen line has no issue. The charger line stays on
 * the proposal: sending is not blocked by it and the sent revision keeps it.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const TENANT = "tenant-ac419-availability";
const HOUR = 3600_000;
const SAT = Date.UTC(2026, 10, 14, 16, 0);

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("availability before a proposal is sent (AC-419)", () => {
  it("publish raises a scoped availability exception instead of silently omitting", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "owner-ac419",
      role: "owner",
      tenantId: TENANT,
    });
    const run = (cmd: unknown, args: object) =>
      proof.executeCommand(owner, cmd as never, args as never) as Promise<{
        docId: string;
      }>;

    const chargers = await run(M.Equipment_createViaRegister, {
      name: "Gold charger plate",
      assetTag: "CHG-GOLD",
      category: "Tabletop",
      ownership: "owned",
      quantity: 100,
      customerPrice: 2,
    });
    const linens = await run(M.Equipment_createViaRegister, {
      name: "Ivory linen",
      assetTag: "LIN-IV",
      category: "Linens",
      ownership: "owned",
      quantity: 40,
      customerPrice: 12,
    });
    const client = await run(M.Client_createViaRegister, {
      clientType: "company",
      companyName: "Harbor gala client",
    });
    const other = await run(M.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title: "Harbor gala",
      eventType: "gala",
      startsAt: SAT,
      endsAt: SAT + 6 * HOUR,
      expectedHeadcount: 80,
      primaryContactName: "Riley Host",
      budgetAmount: 5000,
      quotedPrice: 7000,
    });
    await owner.mutation(api.equipmentCheckout.reserve, {
      equipmentId: chargers.docId as never,
      eventId: other.docId as never,
      startsAt: SAT,
      endsAt: SAT + 6 * HOUR,
      quantity: 80,
    });

    const menu = await run(M.Menu_createViaDraft, { name: "Autumn menu" });
    const dish = await run(M.Dish_createViaIntroduce, {
      name: "Maple duck",
      portionSize: 1,
      portionUnit: "serving",
    });
    const menuDish = await run(M.MenuDish_createViaAdd, {
      menuId: menu.docId,
      dishId: dish.docId,
      sellingPrice: 48,
    });
    await run(M.Menu_markPublished, { docId: menu.docId });

    await owner.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "Garden wedding",
        guestCount: 50,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        eventDate: SAT + HOUR,
        eventEndDate: SAT + 7 * HOUR,
        venueName: "Rose garden",
        terms: "Standard terms",
        lines: [
          {
            description: "Gold charger plate",
            pricingBasis: "per_unit",
            unitPrice: 2,
            quantity: 50,
            equipmentId: chargers.docId,
          },
          {
            description: "Ivory linen",
            pricingBasis: "per_unit",
            unitPrice: 12,
            quantity: 10,
            equipmentId: linens.docId,
          },
          {
            description: "Maple duck",
            pricingBasis: "flat",
            unitPrice: 48,
            quantity: 1,
            menuDishId: menuDish.docId,
          },
        ],
      },
    );
    const [proposal] = (await owner.query(
      api.queries.listProposal,
      {},
    )) as any[];
    const lines = (
      (await owner.run(async (ctx) =>
        ctx.db.query("proposalLineItems").collect(),
      )) as any[]
    ).filter((row) => row.proposalId === proposal._id);
    const lineId = (text: string) =>
      String(lines.find((row) => row.description === text)._id);

    const report = async () =>
      (
        (await owner.query(
          (api.lib as any).proposalDraftReport.getProposalDraftReport,
          {
            proposalId: proposal._id,
          },
        )) as {
          issues: Array<{ code: string; message: string; recordIds: string[] }>;
        }
      ).issues;

    let issues = await report();
    const rental = issues.filter((row) => row.code === "rental_unavailable");
    expect(rental).toEqual([
      {
        code: "rental_unavailable",
        message:
          "Gold charger plate: 20 free on Nov 14, this proposal asks for 50. Already booked by Harbor gala (80). Rent the rest from a vendor or change the amount.",
        recordIds: [lineId("Gold charger plate")],
      },
    ]);
    // The linen line has enough and raises nothing.
    expect(
      issues.some((row) => row.recordIds.includes(lineId("Ivory linen"))),
    ).toBe(false);
    expect(issues.some((row) => row.code === "menu_item_unavailable")).toBe(
      false,
    );

    // Taking the menu off sale makes the dish line an issue too.
    const menuRow = (await owner.run(async (ctx) =>
      ctx.db.get(menu.docId as never),
    )) as { version: number };
    await run(M.Menu_unpublish, {
      docId: menu.docId,
      version: menuRow.version,
      reason: "Season over",
    });
    issues = await report();
    expect(issues.find((row) => row.code === "menu_item_unavailable")).toEqual({
      code: "menu_item_unavailable",
      message:
        '"Maple duck" is no longer on a published menu. Pick another dish or remove the menu link.',
      recordIds: [lineId("Maple duck")],
    });
    // Put the menu back; the rental conflict alone never blocks sending.
    const again = (await owner.run(async (ctx) =>
      ctx.db.get(menu.docId as never),
    )) as { version: number };
    await run(M.Menu_markPublished, {
      docId: menu.docId,
      version: again.version,
    });

    const fresh = (await owner.query(api.queries.listProposal, {})) as any[];
    await owner.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: fresh[0]._id, version: fresh[0].version },
    );
    const revisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: fresh[0]._id },
    )) as any[];
    expect(revisions).toHaveLength(1);
    const snapshot = JSON.parse(revisions[0].snapshot);
    expect(
      snapshot.lineItems.find(
        (row: { description: string }) =>
          row.description === "Gold charger plate",
      ),
    ).toMatchObject({ quantity: 50, unitPrice: 2 });
  });
});
