// The records the assistant's BEO import resumes against, for one bundle.
// The loader used to read the company's whole invoice, payment, proposal and
// vendor order tables (and all their lines), and on the live server those
// reads ran out of time.
//
// The plans look records up by the bundle's number: the invoice with that
// number and its payments, the proposal with that number, and the orders
// numbered TPP-<number>-…. Proposals and orders have no index on their
// number yet, so they are found through the bundle's event (the invoice's
// event, or the event the bundle attaches to) and among the newest
// NEWEST_CAP, which covers one made without an event link.
//
// Same read rules as the generated lists; a part this role may not read
// comes back empty, as those lists do.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

const NEWEST_CAP = 500;

type Live = { deletedAt?: number | null; tenantId: string };
const mineLive = <T extends Live>(rows: T[], tenantId: string) =>
  rows.filter((row) => row.deletedAt == null && row.tenantId === tenantId);

export const bundleDirectory = query({
  args: { identity: v.string(), eventId: v.optional(v.string()) },
  handler: async (ctx, { identity, eventId }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      invoices: [] as Doc<"invoices">[],
      payments: [] as Doc<"payments">[],
      proposals: [] as Doc<"proposals">[],
      vendorOrders: [] as Doc<"vendorOrders">[],
      proposalLines: [] as Doc<"proposalLineItems">[],
      vendorOrderLines: [] as Doc<"vendorOrderLines">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const invoices = mineLive(
      await ctx.db
        .query("invoices")
        .withIndex("by_tenantId_and_invoiceNumber", (q) =>
          q.eq("tenantId", tenantId).eq("invoiceNumber", identity),
        )
        .collect(),
      tenantId,
    );
    if (canRead(auth, ["financeAccess", "manageAccess"]))
      out.invoices = invoices;
    if (canRead(auth, ["financeAccess"]))
      for (const invoice of invoices)
        out.payments.push(
          ...mineLive(
            await ctx.db
              .query("payments")
              .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
              .collect(),
            tenantId,
          ),
        );

    const eventIds = new Set<Id<"events">>();
    const given = eventId ? ctx.db.normalizeId("events", eventId) : null;
    if (given) eventIds.add(given);
    for (const invoice of invoices)
      if (invoice.eventId) eventIds.add(invoice.eventId);

    if (canRead(auth, ["salesAccess"])) {
      const seen = new Map<string, Doc<"proposals">>();
      const add = (rows: Doc<"proposals">[]) => {
        for (const row of mineLive(rows, tenantId))
          if (row.proposalNumber === identity) seen.set(row._id, row);
      };
      for (const id of eventIds)
        add(
          await ctx.db
            .query("proposals")
            .withIndex("by_eventId", (q) => q.eq("eventId", id))
            .collect(),
        );
      add(
        await ctx.db
          .query("proposals")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .order("desc")
          .take(NEWEST_CAP),
      );
      out.proposals = [...seen.values()];
      for (const proposal of out.proposals)
        out.proposalLines.push(
          ...mineLive(
            await ctx.db
              .query("proposalLineItems")
              .withIndex("by_proposalId", (q) =>
                q.eq("proposalId", proposal._id),
              )
              .collect(),
            tenantId,
          ),
        );
    }

    if (canRead(auth, ["procurementAccess", "manageAccess"])) {
      const prefix = `TPP-${identity}-`;
      const seen = new Map<string, Doc<"vendorOrders">>();
      const add = (rows: Doc<"vendorOrders">[]) => {
        for (const row of mineLive(rows, tenantId))
          if (String(row.orderNumber ?? "").startsWith(prefix))
            seen.set(row._id, row);
      };
      for (const id of eventIds)
        add(
          await ctx.db
            .query("vendorOrders")
            .withIndex("by_eventId", (q) => q.eq("eventId", id))
            .collect(),
        );
      add(
        await ctx.db
          .query("vendorOrders")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .order("desc")
          .take(NEWEST_CAP),
      );
      out.vendorOrders = [...seen.values()];
      for (const order of out.vendorOrders)
        out.vendorOrderLines.push(
          ...mineLive(
            await ctx.db
              .query("vendorOrderLines")
              .withIndex("by_vendorOrderId", (q) =>
                q.eq("vendorOrderId", order._id),
              )
              .collect(),
            tenantId,
          ),
        );
    }
    return out;
  },
});
