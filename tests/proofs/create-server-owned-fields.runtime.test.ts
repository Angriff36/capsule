/**
 * Runtime proof (PL-AUTH, AC-372 no client-supplied approval, totals or
 * provider state): six record types were created through a step that also
 * took every other field from the caller. A finance user could save a
 * revenue split that already named an approver and an applied amount; a
 * share link could start "revoked by" someone with forged views; a purchase
 * need could start "ordered" against any order line; a quote request could
 * start linked to a client, lead, event and proposal. Now those fields are
 * set by the server when the record is made, and the create steps no longer
 * accept them. Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import * as mutations from "../../convex/mutations";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import {
  createPlannedEvent,
  harness,
  openPurchaseNeed,
  rolesFor,
} from "./reconciliation-failure-isolation.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

/** Fields each create step must no longer take from the caller. */
const SERVER_OWNED: Record<string, string[]> = {
  RevenueAttribution_create: [
    "allocatedAmount",
    "approvedById",
    "approvedAt",
    "rejectionReason",
    "appliedAt",
  ],
  ShareLink_create: [
    "revokedAt",
    "revokedByPersonId",
    "viewCount",
    "firstViewedAt",
    "lastViewedAt",
    "lastViewerIdentity",
  ],
  ClientPortalLink_create: ["revokedAt"],
  PurchaseNeed_create: [
    "status",
    "orderedQuantity",
    "vendorOrderId",
    "vendorOrderLineId",
    "orderedAt",
    "fulfilledAt",
    "cancelledAt",
    "cancellationReason",
  ],
  MessageThread_create: ["status", "leadId"],
  QuoteSubmission_create: [
    "clientId",
    "leadId",
    "eventId",
    "proposalId",
    "completedAt",
    "errorMessage",
    "processingErrors",
  ],
};

type Registered = { exportArgs: () => string };

describe("create steps keep approval, totals and results server-owned (AC-372)", () => {
  it("no create step accepts a server-owned field", () => {
    const accepted: string[] = [];
    const table = mutations as unknown as Record<string, Registered>;
    for (const [name, fields] of Object.entries(SERVER_OWNED)) {
      const args = JSON.parse(table[name]!.exportArgs()) as {
        value: Record<string, unknown>;
      };
      for (const field of fields) {
        if (field in args.value) accepted.push(`${name}.${field}`);
      }
    }
    expect(accepted).toEqual([]);
  });

  it("a revenue attribution names the signed-in staff profiles and cannot start approved or applied", async () => {
    const t = convexTest(schema, modules);
    const person = (subject: string) =>
      t.run((ctx) =>
        ctx.db.insert("people", {
          tenantId: "tenant-a",
          givenName: "Proof",
          familyName: subject,
          email: `${subject}@example.test`,
          role: "finance_manager",
          employmentType: "full_time",
          status: "active",
          authSubjectId: subject,
          version: 1,
        }),
      );
    const requesterId = await person("finance-a");
    const approverId = await person("finance-b");
    const signIn = (subject: string) =>
      t.withIdentity({
        subject,
        tokenIdentifier: `proof|${subject}`,
        role: "finance_manager",
        tenantId: "tenant-a",
      });
    const finance = signIn("finance-a");
    // A real event of the workspace: links to missing records are refused.
    const eventId = await t.run((ctx) =>
      ctx.db.insert("events", {
        tenantId: "tenant-a",
        title: "Proof dinner",
        eventType: "wedding",
        stage: "approved",
        startsAt: Date.UTC(2026, 9, 18, 17, 0),
        endsAt: Date.UTC(2026, 9, 18, 22, 0),
        version: 1,
      }),
    );
    const base = {
      eventId,
      attributionType: "venue_commission",
      allocationMethod: "percent",
      percentBasis: 10,
    };

    await expect(
      finance.mutation(api.mutations.RevenueAttribution_create, {
        ...base,
        approvedById: "7people",
        allocatedAmount: 5000,
      } as never),
    ).rejects.toThrow();

    const created = (await finance.mutation(
      api.mutations.RevenueAttribution_create,
      base as never,
    )) as { _id: string };
    type Row = {
      status: string;
      allocatedAmount: number;
      approvedById?: string | null;
      approvedAt?: number | null;
      appliedAt?: number | null;
      requestedById?: string | null;
    };
    const read = async () =>
      (await t.run((ctx) => ctx.db.get(created._id as never))) as Row;
    const row = await read();
    expect(row.status).toBe("draft");
    expect(row.allocatedAmount).toBe(0);
    expect(row.approvedById ?? null).toBeNull();
    expect(row.approvedAt ?? null).toBeNull();
    expect(row.appliedAt ?? null).toBeNull();
    expect(row.requestedById).toBe(requesterId);

    await finance.mutation(api.mutations.RevenueAttribution_requestApproval, {
      docId: created._id,
    } as never);
    await signIn("finance-b").mutation(
      api.mutations.RevenueAttribution_approve,
      {
        docId: created._id,
      } as never,
    );
    const approved = await read();
    expect(approved.status).toBe("approved");
    expect(approved.approvedById).toBe(approverId);

    // A sign-in with no staff profile gets a plain answer, not a broken record.
    await expect(
      signIn("finance-unlinked").mutation(
        api.mutations.RevenueAttribution_create,
        base as never,
      ),
    ).rejects.toThrow(/staff profile/);
  });

  it("a share link records the signed-in staff profile as creator and revoker", async () => {
    const t = convexTest(schema, modules);
    const tenantId = "tenant-sharelink";
    await t.run((ctx) =>
      ctx.db.insert("people", {
        tenantId,
        givenName: "Sam",
        familyName: "Sales",
        email: "sam@example.test",
        role: "sales_manager",
        employmentType: "full_time",
        status: "active",
        authSubjectId: "sharelink-sales",
        version: 1,
      } as never),
    );
    const sales = t.withIdentity({
      subject: "sharelink-sales",
      tokenIdentifier: "proof|sharelink-sales",
      role: "sales_manager",
      tenantId,
    });
    const ids = await t.run(async (ctx) => {
      const clientId = await ctx.db.insert("clients", {
        tenantId,
        clientType: "company",
        companyName: "Proof client",
        taxExempt: false,
        paymentTermsDays: 30,
        status: "active",
        version: 1,
      } as never);
      const proposalId = await ctx.db.insert("proposals", {
        tenantId,
        clientId,
        title: "Proof wedding",
        guestCount: 80,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        status: "sent",
        version: 1,
      } as never);
      const proposalRevisionId = await ctx.db.insert("proposalRevisions", {
        tenantId,
        proposalId,
        revisionNumber: 1,
        changeSummary: "First capture",
        capturedByName: "Sam Sales",
        snapshot: "{}",
        version: 1,
      } as never);
      return { proposalId, proposalRevisionId };
    });
    const created = (await sales.mutation(api.mutations.ShareLink_create, {
      proposalId: ids.proposalId as string,
      proposalRevisionId: ids.proposalRevisionId as string,
    })) as { _id: string; createdByPersonId?: string | null };
    const salesPersonId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("people")
        .withIndex("by_authSubjectId", (q) =>
          q.eq("authSubjectId", "sharelink-sales"),
        )
        .collect();
      return String(rows[0]!._id);
    });
    // The stored audit reference is the staff profile row, not the sign-in.
    expect(created.createdByPersonId).toBe(salesPersonId);

    await sales.mutation(api.mutations.ShareLink_revoke, {
      docId: created._id,
    } as never);
    const row = (await t.run((ctx) => ctx.db.get(created._id as never))) as {
      status: string;
      revokedByPersonId?: string | null;
    };
    expect(row.status).toBe("revoked");
    expect(row.revokedByPersonId).toBe(salesPersonId);

    // A sign-in with no staff profile cannot create a share link at all.
    await expect(
      t
        .withIdentity({
          subject: "sharelink-unlinked",
          tokenIdentifier: "proof|sharelink-unlinked",
          role: "sales_manager",
          tenantId,
        })
        .mutation(api.mutations.ShareLink_create, {
          proposalId: ids.proposalId as string,
          proposalRevisionId: ids.proposalRevisionId as string,
        }),
    ).rejects.toThrow(/staff profile/);
  });

  it("a repeated purchase-need create leaves an ordered, received or cancelled need exactly as it was", async () => {
    const tenantId = "tenant-replay";
    const proof = harness();
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Replay dinner",
    );
    const { inventory } = rolesFor(proof, tenantId);
    const manager = proof.asRole({
      subject: `inventory-manager-${tenantId}`,
      role: "inventory_manager",
      tenantId,
    });
    const idOf = (row: unknown) => {
      const r = row as { _id?: string; docId?: string };
      return (r.docId ?? r._id)!;
    };
    const { ingredientId } = await openPurchaseNeed(proof, tenantId, eventId);
    const demand = idOf(
      await proof.executeCommand(
        inventory,
        api.mutations.IngredientDemand_createViaCalculate,
        {
          eventId,
          ingredientId,
          requiredQuantity: 2,
          unit: "kilogram",
          servings: 40,
        },
      ),
    );
    const createArgs = {
      eventId,
      ingredientDemandId: demand,
      ingredientId,
      requiredQuantity: 2,
      unit: "kilogram",
    };
    const create = async () =>
      idOf(
        await proof.executeCommand(
          inventory,
          api.mutations.PurchaseNeed_create,
          createArgs,
        ),
      );
    const receivedId = await create();
    const orderedOnly = { docId: await create() };
    const cancelledNeed = { docId: await create() };

    // Ordered and received history (how it got there does not matter here).
    await inventory.run(async (ctx) => {
      const ordered = { status: "ordered", orderedAt: 1, orderedQuantity: 2 };
      await ctx.db.patch(orderedOnly.docId as never, ordered as never);
      await ctx.db.patch(
        receivedId as never,
        { ...ordered, status: "fulfilled", fulfilledAt: 2 } as never,
      );
    });
    await proof.executeCommand(manager, api.mutations.PurchaseNeed_cancel, {
      docId: cancelledNeed.docId,
      reason: "Menu changed",
    });

    const ids = [receivedId, orderedOnly.docId, cancelledNeed.docId];
    const read = () =>
      inventory.run(async (ctx) =>
        Promise.all(ids.map((id) => ctx.db.get(id as never))),
      );
    const before = await read();
    expect(before.map((row) => (row as { status: string }).status)).toEqual([
      "fulfilled",
      "ordered",
      "cancelled",
    ]);

    // Replay the create for the same demand (as a repeated approval would).
    const replayId = await create();
    expect(ids).not.toContain(replayId);
    expect(await read()).toEqual(before);
  });
});
