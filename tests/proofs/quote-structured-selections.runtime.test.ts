/**
 * Runtime proof (AC-095, AC-243, AC-244, AC-245; spec CF-4-3, PR06-02): one
 * quote-form submission carries structured picks — dishes off the chosen menu
 * with portions, extras from another menu — plus attribution and consent, and
 * the estimate the visitor saw. Conversion lands them on the sales record:
 * priced proposal lines from the central price calculation, dish choices,
 * offered extras, and a lead with its referral source, estimate value and
 * campaign note. A retried conversion adds nothing twice; a repeat of the
 * same form visit or the same contact + date makes no second request; a menu
 * that does not fit the event is refused in plain words.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { computeProposalPricing } from "../../src/lib/pricing";
import { QUOTE_PRIVACY_NOTICE } from "../../src/lib/quoteSelections";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const GUESTS = 60;
const EVENT_DATE = Date.UTC(2026, 10, 7, 17, 0);

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
type ActionRunner = { action: (fn: unknown, args?: unknown) => Promise<any> };
const asActions = (actor: Actor) => actor as unknown as ActionRunner;

async function publishedMenu(
  proof: Proof,
  owner: Actor,
  name: string,
  terms: { minGuests?: number },
  dishes: Array<{ name: string; price?: number }>,
) {
  const menu = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name,
    ...terms,
  })) as { docId: string };
  const menuDishIds: string[] = [];
  for (const [sortOrder, d] of dishes.entries()) {
    const dish = (await proof.executeCommand(owner, M.Dish_createViaIntroduce, {
      name: d.name,
      portionSize: 1,
      portionUnit: "serving",
    })) as { docId: string };
    const md = (await proof.executeCommand(owner, M.MenuDish_createViaAdd, {
      menuId: menu.docId,
      dishId: dish.docId,
      sortOrder,
      sellingPrice: d.price,
    })) as { docId: string };
    menuDishIds.push(md.docId);
  }
  await proof.executeCommand(owner, M.Menu_markPublished, {
    docId: menu.docId,
  });
  return { menuId: menu.docId, menuDishIds };
}

async function setup(tenantId: string) {
  const proof = harness();
  const owner = proof.asRole({
    subject: `o-${tenantId}`,
    role: "owner",
    tenantId,
  });
  await proof.executeCommand(owner, M.Organization_createViaRegister, {
    name: "Structured quote kitchen",
  });
  const main = await publishedMenu(proof, owner, "Garden party", {}, [
    { name: "Herb chicken", price: 18.5 },
    { name: "Summer salad", price: 6 },
    { name: "Lemon tart", price: 4 },
  ]);
  const extras = await publishedMenu(proof, owner, "Late night", {}, [
    { name: "Slider bar", price: 7.25 },
  ]);
  const source = (await proof.executeCommand(
    owner,
    M.ReferralSource_createViaRegister,
    { name: "Wedding show", code: "WEDSHOW" },
  )) as { docId: string };
  return { proof, owner, main, extras, referralSourceId: source.docId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function quoteArgs(s: Setup, overrides: Record<string, unknown> = {}) {
  return {
    clientName: "Robin Prospect",
    email: "robin@example.com",
    eventDate: EVENT_DATE,
    guestCount: GUESTS,
    consent: true,
    menuId: s.main.menuId,
    // Herb chicken for every guest, 20 lemon tarts, salad unticked.
    picks: [
      { menuDishId: s.main.menuDishIds[0] },
      { menuDishId: s.main.menuDishIds[2], quantity: 20 },
    ],
    extras: [{ menuDishId: s.extras.menuDishIds[0], quantity: 40 }],
    submissionKey: "visit-1",
    referralSourceId: s.referralSourceId,
    utmSource: "instagram",
    utmMedium: "social",
    utmCampaign: "fall-weddings",
    referrer: "https://www.instagram.com/",
    landingPage: "/quote?utm_source=instagram",
    marketingConsent: true,
    ...overrides,
  };
}

describe("structured quote picks reach the sales record (AC-095/AC-243/AC-244/AC-245)", () => {
  it("one submission stores picks, estimate, attribution and consent, and conversion lands them", async () => {
    const s = await setup("tenant-quote-structured-a");
    const { owner } = s;

    const shown = (await owner.query(
      (api.lib as any).quoteSelections.estimateQuote,
      {
        eventDate: EVENT_DATE,
        guestCount: GUESTS,
        menuId: s.main.menuId,
        picks: quoteArgs(s).picks,
        extras: quoteArgs(s).extras,
      },
    )) as { ok: true; estimate: any };
    expect(shown.ok).toBe(true);
    const expectedMenu = computeProposalPricing({
      lines: [
        { pricingBasis: "per_person", unitPrice: 18.5 },
        { pricingBasis: "per_unit", unitPrice: 4, quantity: 20 },
      ],
      guestCount: GUESTS,
    });
    expect(shown.estimate.label).toBe("Estimate");
    expect(shown.estimate.menuSubtotal).toBe(expectedMenu.subtotal);
    expect(shown.estimate.extrasTotal).toBe(290);
    expect(shown.estimate.total).toBe(expectedMenu.subtotal + 290);
    expect(shown.estimate.assumptions).toContain(`Based on ${GUESTS} guests.`);

    const submitted = await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      quoteArgs(s),
    );
    const stored = (await owner.run(async (ctx: any) =>
      ctx.db.get(submitted.submissionId),
    )) as any;
    // The estimate stored is the estimate shown.
    expect(JSON.parse(stored.estimateJson)).toEqual(shown.estimate);
    const picks = JSON.parse(stored.selectionsJson);
    expect(
      picks.lines.map((l: any) => [l.kind, l.name, l.quantity, l.unitPrice]),
    ).toEqual([
      ["menu", "Herb chicken", null, 18.5],
      ["menu", "Lemon tart", 20, 4],
      ["extra", "Slider bar", 40, 7.25],
    ]);
    expect(stored).toMatchObject({
      submissionKey: "visit-1",
      referralSourceId: s.referralSourceId,
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "fall-weddings",
      referrer: "https://www.instagram.com/",
      landingPage: "/quote?utm_source=instagram",
      marketingConsent: true,
      consentNotice: QUOTE_PRIVACY_NOTICE,
    });

    const converted = await asActions(owner).action(
      api.quoteBuilder.processQuoteSubmission,
      { submissionId: submitted.submissionId },
    );
    expect(converted.errors).toEqual([]);
    const proposalId = converted.proposalId as string;

    const lines = (
      (await owner.query(api.queries.listProposalLineItemByProposalId, {
        proposalId,
      })) as any[]
    )
      .filter((row) => row.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(
      lines.map((l) => [l.description, l.pricingBasis, l.unitPrice, l.amount]),
    ).toEqual([
      ["Herb chicken", "per_person", 18.5, expectedMenu.lines[0].amount],
      ["Lemon tart", "per_unit", 4, expectedMenu.lines[1].amount],
    ]);
    expect(lines.map((l) => l.menuDishId)).toEqual([
      s.main.menuDishIds[0],
      s.main.menuDishIds[2],
    ]);
    const proposal = (await owner.query(api.queries.getProposal, {
      id: proposalId,
    })) as any;
    expect(proposal.subtotal).toBe(expectedMenu.subtotal);

    const selections = (await owner.run(async (ctx: any) =>
      ctx.db
        .query("proposalDishSelections")
        .withIndex("by_proposalId", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
    )) as any[];
    expect(
      selections.map((row) => row.quantityServings).sort((a, b) => a - b),
    ).toEqual([20, GUESTS]);

    const offers = (await owner.run(async (ctx: any) =>
      ctx.db
        .query("proposalEnhancements")
        .withIndex("by_proposalId", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
    )) as any[];
    expect(offers.map((o) => [o.name, o.price])).toEqual([["Slider bar", 290]]);

    const lead = (await owner.query(api.queries.getLead, {
      id: converted.leadId,
    })) as any;
    expect(lead.referralSourceId).toBe(s.referralSourceId);
    expect(lead.estimatedValue).toBe(shown.estimate.total);
    expect(lead.notes).toContain(
      "Campaign: instagram / social / fall-weddings.",
    );
    expect(lead.notes).toContain("Offers and news: yes");
  });

  it("a retried conversion adds no second set of lines, dish choices or extras", async () => {
    const s = await setup("tenant-quote-structured-b");
    const { owner, proof } = s;
    const submitted = await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      quoteArgs(s),
    );
    const first = await asActions(owner).action(
      api.quoteBuilder.processQuoteSubmission,
      { submissionId: submitted.submissionId },
    );
    expect(first.errors).toEqual([]);

    // The last step failed after everything was written: the row is failed
    // with every checkpointed id, and staff retry it.
    await owner.run(async (ctx: any) => {
      await ctx.db.patch(submitted.submissionId, {
        status: "failed",
        errorMessage: "Conversion could not complete all steps",
      });
    });
    await proof.executeCommand(owner, M.QuoteSubmission_retry, {
      docId: submitted.submissionId,
    });
    const again = await asActions(owner).action(
      api.quoteBuilder.processQuoteSubmission,
      { submissionId: submitted.submissionId },
    );
    expect(again.errors).toEqual([]);
    expect(again.proposalId).toBe(first.proposalId);
    expect(again.leadId).toBe(first.leadId);
    expect(again.eventId).toBe(first.eventId);

    const count = async (table: string) =>
      (await owner.run(async (ctx: any) =>
        ctx.db
          .query(table)
          .withIndex("by_proposalId", (q: any) =>
            q.eq("proposalId", first.proposalId),
          )
          .collect(),
      )) as any[];
    expect((await count("proposalLineItems")).length).toBe(2);
    expect((await count("proposalDishSelections")).length).toBe(2);
    expect((await count("proposalEnhancements")).length).toBe(1);
    const plan = (await owner.query(
      internal.lib.quoteSelections.quoteConversionPlan as never,
      {
        proposalId: first.proposalId,
        submissionId: submitted.submissionId,
      } as never,
    )) as { lines: unknown[] };
    expect(plan.lines).toEqual([]);
  });

  it("dedups by the form visit's key and by contact + event date", async () => {
    const s = await setup("tenant-quote-structured-c");
    const { owner } = s;
    const first = await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      quoteArgs(s),
    );
    expect(first.isDuplicate).toBe(false);

    // Same visit (lost response, retyped email): the same request back.
    const sameVisit = await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      quoteArgs(s, { email: "robin.p@example.com" }),
    );
    expect(sameVisit).toMatchObject({
      submissionId: first.submissionId,
      isDuplicate: true,
    });

    // New visit, same contact and date: still the same request.
    const sameContact = await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      quoteArgs(s, { submissionKey: "visit-2" }),
    );
    expect(sameContact).toMatchObject({
      submissionId: first.submissionId,
      isDuplicate: true,
    });

    // New visit, other date: a new request.
    const other = await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      quoteArgs(s, {
        submissionKey: "visit-3",
        eventDate: EVENT_DATE + 7 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(other.isDuplicate).toBe(false);
    expect(other.submissionId).not.toBe(first.submissionId);
  });

  it("refuses a menu or extra that does not fit the event, in plain words", async () => {
    const s = await setup("tenant-quote-structured-d");
    const { owner, proof } = s;
    const big = await publishedMenu(
      proof,
      owner,
      "Grand buffet",
      { minGuests: 100 },
      [{ name: "Carving station", price: 22 }],
    );
    await expect(
      asActions(owner).action(
        api.quoteBuilder.submitQuote,
        quoteArgs(s, {
          menuId: big.menuId,
          picks: undefined,
          extras: undefined,
        }),
      ),
    ).rejects.toThrow("Grand buffet: Needs at least 100 guests.");
    await expect(
      asActions(owner).action(
        api.quoteBuilder.submitQuote,
        quoteArgs(s, {
          extras: [{ menuDishId: big.menuDishIds[0] }],
        }),
      ),
    ).rejects.toThrow("Grand buffet: Needs at least 100 guests.");
    // A dish from another menu cannot be passed off as a pick.
    await expect(
      asActions(owner).action(
        api.quoteBuilder.submitQuote,
        quoteArgs(s, {
          picks: [{ menuDishId: s.extras.menuDishIds[0] }],
          extras: undefined,
        }),
      ),
    ).rejects.toThrow("Slider bar is not on the menu you picked.");
  });
});
