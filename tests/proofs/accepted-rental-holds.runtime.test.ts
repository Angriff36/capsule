/**
 * Goodshuffle replacement (BE-20.6 job 02, "no re-entry"; BE-13 rentals):
 * a rental item on the proposal the client accepted is held for the event
 * when the event is approved - nobody reserves it again by hand.
 *
 *   - before approval nothing is held (a planning event books no gear)
 *   - approval holds every approved item, as many as are free
 *   - what could not be held shows on the event as "approved but not held"
 *   - once units come free, a later run tops the hold up; a replay adds
 *     nothing
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { holdApprovedRentals } from "../../convex/lib/acceptedRentalHolds";
import { modules } from "./convex-test-modules";
import { linkStaffProfile } from "./reconciliation-failure-isolation.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-accepted-rental-holds";
const STARTS = Date.parse("2026-11-14T16:00:00Z");
const ENDS = Date.parse("2026-11-14T23:00:00Z");

type Actor = {
  run: (fn: (ctx: any) => Promise<unknown>) => Promise<unknown>;
};

async function equipment(actor: Actor, name: string, quantity: number) {
  return (await actor.run((ctx) =>
    ctx.db.insert("equipments", {
      tenantId: TENANT,
      name,
      assetTag: `${name}-tag`,
      category: "Decor",
      ownership: "owned",
      quantity,
      purchaseValue: 400,
      condition: "good",
      status: "active",
      registeredAt: 1,
      version: 1,
    }),
  )) as string;
}

async function holdsFor(actor: Actor, eventId: string) {
  const rows = (await actor.run((ctx) =>
    ctx.db.query("equipmentReservations").collect(),
  )) as any[];
  return rows.filter(
    (row) => row.eventId === eventId && row.status === "reserved",
  );
}

describe("runtime proof: accepted rental lines are held on approval", () => {
  it("holds what is free, names the rest, tops up later and never doubles", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "rental-hold-sales",
      role: "sales_manager",
      tenantId: TENANT,
    });
    const events = proof.asRole({
      subject: "rental-hold-events",
      role: "event_manager",
      tenantId: TENANT,
    });
    await linkStaffProfile(proof, TENANT, "rental-hold-sales", "sales_manager");

    const arch = await equipment(sales, "Birch arch", 3);
    const linens = await equipment(sales, "Ivory linen set", 10);

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Hold client" },
    )) as { docId: string };

    // Another booked event already holds 2 of the 3 arches that day.
    const other = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Other wedding",
        eventType: "wedding",
        startsAt: STARTS,
        endsAt: ENDS,
        expectedHeadcount: 40,
        primaryContactName: "Other Contact",
        budgetAmount: 0,
        quotedPrice: 0,
      },
    )) as { docId: string };
    const otherHold = (await sales.run((ctx) =>
      ctx.db.insert("equipmentReservations", {
        tenantId: TENANT,
        equipmentId: arch,
        eventId: other.docId,
        startsAt: STARTS,
        endsAt: ENDS,
        quantity: 2,
        status: "reserved",
        reservedAt: 1,
        version: 0,
      }),
    )) as string;

    await sales.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "Garden wedding",
        guestCount: 60,
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
            equipmentId: arch,
          },
          {
            description: "Linen package",
            pricingBasis: "flat",
            unitPrice: 90,
            equipmentId: linens,
          },
        ],
      },
    );
    const proposal = (
      (await sales.query(api.queries.listProposal, {})) as any[]
    )[0];
    await sales.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposal._id, version: proposal.version },
    );
    const revision = (
      (await sales.query(api.queries.listProposalRevisionByProposalId, {
        proposalId: proposal._id,
      })) as any[]
    )[0];
    await proof.executeCommand(sales, api.mutations.Proposal_markViewed, {
      docId: proposal._id,
    });
    await proof.executeCommand(sales, api.mutations.Proposal_accept, {
      docId: proposal._id,
      acceptedRevisionId: revision._id,
    });

    const booked = (await sales.mutation(
      (api.lib as any).proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId: proposal._id,
        event: {
          clientId: client.docId,
          title: "Garden wedding",
          eventType: "wedding",
          startsAt: STARTS,
          endsAt: ENDS,
          expectedHeadcount: 60,
          primaryContactName: "Casey Contact",
          budgetAmount: 0,
          quotedPrice: 2790,
        },
      },
    )) as { docId: string; version: number };

    // A planning event books no gear yet.
    expect(await holdsFor(sales, booked.docId)).toHaveLength(0);

    await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
      docId: booked.docId,
      version: booked.version,
    });
    const submitted = (await sales.run((ctx) =>
      ctx.db.get(booked.docId),
    )) as any;
    await proof.executeCommand(events, api.mutations.Event_approve, {
      docId: booked.docId,
      version: submitted.version,
    });

    // Approval held the one free arch and the linen set.
    const held = await holdsFor(sales, booked.docId);
    const byItem = (rows: any[]) =>
      Object.fromEntries(
        [arch, linens].map((id) => [
          id,
          rows
            .filter((row) => row.equipmentId === id)
            .reduce((sum, row) => sum + row.quantity, 0),
        ]),
      );
    expect(byItem(held)).toEqual({ [arch]: 1, [linens]: 1 });
    expect(
      held.every((row) => row.startsAt === STARTS && row.endsAt === ENDS),
    ).toBe(true);

    // The arch that could not be held is named on the event.
    const exceptions = (await events.query(
      (api as any).equipmentCheckout.eventEquipmentExceptions,
      { eventId: booked.docId },
    )) as any;
    expect(exceptions.notHeld).toEqual([
      { equipmentId: arch, name: "Birch arch", approved: 2, held: 1 },
    ]);

    // The other event lets one arch go; the next run tops the hold up.
    await sales.run((ctx) =>
      ctx.db.patch(otherHold, { quantity: 1, version: 1 }),
    );
    await sales.run((ctx) =>
      holdApprovedRentals(ctx as never, booked.docId as never),
    );
    expect(byItem(await holdsFor(sales, booked.docId))).toEqual({
      [arch]: 2,
      [linens]: 1,
    });
    const after = (await events.query(
      (api as any).equipmentCheckout.eventEquipmentExceptions,
      { eventId: booked.docId },
    )) as any;
    expect(after.notHeld).toEqual([]);

    // A replay adds nothing.
    const before = (await holdsFor(sales, booked.docId)).length;
    await sales.run((ctx) =>
      holdApprovedRentals(ctx as never, booked.docId as never),
    );
    expect(await holdsFor(sales, booked.docId)).toHaveLength(before);
  });
});
