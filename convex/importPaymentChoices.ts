/**
 * Choices for one imported payment row. Same-id and same-amount come from
 * lookups. A search box asks for matches. The company's payment list is not
 * loaded.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  paymentMatchCandidates,
  readImportedPayment,
  type MatchablePayment,
} from "../src/lib/paymentMatchCandidates";
import { canRead } from "./search";

const CHOICE_CAP = 8;

type Choice = {
  id: Id<"payments">;
  amount: number;
  status: string;
  invoiceNumber: string;
  daysApart: number | null;
};

async function tenantOf(ctx: QueryCtx): Promise<string | null> {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || !canRead(auth, ["importAccess"])) return null;
  return auth.tenantId;
}

async function taken(
  ctx: QueryCtx,
  tenantId: string,
  paymentId: string,
): Promise<boolean> {
  const holders = await ctx.db
    .query("externalRecordLinks")
    .withIndex("by_tenantId_and_capsuleId", (q) =>
      q.eq("tenantId", tenantId).eq("capsuleId", paymentId),
    )
    .take(20);
  return holders.some(
    (row) =>
      row.deletedAt == null &&
      row.recordType === "payment" &&
      row.capsuleEntity === "payment" &&
      row.conflictStatus !== "superseded",
  );
}

async function byExternalId(
  ctx: QueryCtx,
  tenantId: string,
  id: string,
): Promise<Doc<"payments">[]> {
  const own = await ctx.db
    .query("payments")
    .withIndex("by_tenantId_and_externalPaymentId", (q) =>
      q.eq("tenantId", tenantId).eq("externalPaymentId", id),
    )
    .take(CHOICE_CAP);
  const matched = await ctx.db
    .query("payments")
    .withIndex("by_tenantId_and_matchedExternalId", (q) =>
      q.eq("tenantId", tenantId).eq("matchedExternalId", id),
    )
    .take(CHOICE_CAP);
  return [...own, ...matched];
}

async function byAmount(
  ctx: QueryCtx,
  tenantId: string,
  amount: number,
): Promise<Doc<"payments">[]> {
  return await ctx.db
    .query("payments")
    .withIndex("by_tenantId_and_amount", (q) =>
      q.eq("tenantId", tenantId).eq("amount", amount),
    )
    .take(CHOICE_CAP);
}

async function choice(
  ctx: QueryCtx,
  payment: Doc<"payments">,
  daysApart: number | null,
): Promise<Choice> {
  const invoice = await ctx.db.get(payment.invoiceId);
  return {
    id: payment._id,
    amount: payment.amount,
    status: payment.status,
    invoiceNumber: invoice?.invoiceNumber ?? "Unknown invoice",
    daysApart,
  };
}

function typedAmount(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

/** Same-id, same-amount, and whatever the person typed, for one imported row. */
export const forLink = query({
  args: {
    linkId: v.id("externalRecordLinks"),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empty = {
      amount: null as number | null,
      recordedAt: null as number | null,
      method: null as string | null,
      paymentType: null as string | null,
      eventRef: null as string | null,
      invoiceRef: null as string | null,
      exact: null as Choice | null,
      suggestions: [] as Choice[],
      matches: [] as Choice[],
    };
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) return empty;
    const link = await ctx.db.get(args.linkId);
    if (!link || link.tenantId !== tenantId || link.deletedAt != null) {
      return empty;
    }
    const facts = readImportedPayment(link);
    const found = new Map<string, Doc<"payments">>();
    for (const id of [facts.externalId, facts.providerTransactionId]) {
      if (!id) continue;
      for (const payment of await byExternalId(ctx, tenantId, id))
        found.set(String(payment._id), payment);
    }
    const amount = facts.amount === null ? null : Math.abs(facts.amount);
    if (amount !== null && amount !== 0) {
      for (const payment of await byAmount(ctx, tenantId, amount))
        found.set(String(payment._id), payment);
    }
    const open: MatchablePayment[] = [];
    for (const payment of found.values()) {
      if (payment.deletedAt != null) continue;
      if (await taken(ctx, tenantId, String(payment._id))) continue;
      open.push({ ...payment, _id: String(payment._id) });
    }
    const picked = paymentMatchCandidates(facts, open);
    const exact = picked.exactPaymentId
      ? found.get(picked.exactPaymentId)
      : undefined;
    const suggestions: Choice[] = [];
    for (const row of picked.suggestions) {
      const payment = found.get(row.paymentId);
      if (payment) suggestions.push(await choice(ctx, payment, row.daysApart));
    }
    const matches = await searchMatches(ctx, tenantId, args.text ?? "", found);
    return {
      amount: facts.amount,
      recordedAt: facts.recordedAt,
      method: facts.method,
      paymentType: facts.paymentType,
      eventRef: facts.eventRef,
      invoiceRef: facts.invoiceRef,
      exact: exact ? await choice(ctx, exact, null) : null,
      suggestions,
      matches,
    };
  },
});

async function searchMatches(
  ctx: QueryCtx,
  tenantId: string,
  text: string,
  already: Map<string, Doc<"payments">>,
): Promise<Choice[]> {
  const needle = text.trim();
  if (needle.length < 2) return [];
  const found = new Map<string, Doc<"payments">>();
  const amount = typedAmount(needle);
  if (amount !== null) {
    for (const payment of await byAmount(ctx, tenantId, amount))
      found.set(String(payment._id), payment);
  }
  for (const payment of await byExternalId(ctx, tenantId, needle))
    found.set(String(payment._id), payment);
  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_tenantId_and_invoiceNumber", (q) =>
      q.eq("tenantId", tenantId).eq("invoiceNumber", needle),
    )
    .take(3);
  for (const invoice of invoices) {
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
      .take(CHOICE_CAP);
    for (const payment of payments) found.set(String(payment._id), payment);
  }
  const matches: Choice[] = [];
  for (const payment of found.values()) {
    if (already.has(String(payment._id))) continue;
    if (payment.deletedAt != null || payment.tenantId !== tenantId) continue;
    if (await taken(ctx, tenantId, String(payment._id))) continue;
    matches.push(await choice(ctx, payment, null));
    if (matches.length >= CHOICE_CAP) break;
  }
  return matches;
}
