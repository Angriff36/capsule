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
    const base = {
      eventId: "7events",
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
});
