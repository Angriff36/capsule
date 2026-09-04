import { query } from "../_generated/server";
import {
  OPTION_ROW_LIMIT,
  isLiveTenantRow,
  requireReportTenant,
} from "./shared";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const tenantId = await requireReportTenant(ctx);
    const [events, clients, people, vendors, venues] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(OPTION_ROW_LIMIT),
      ctx.db
        .query("clients")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(OPTION_ROW_LIMIT),
      ctx.db
        .query("people")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(OPTION_ROW_LIMIT),
      ctx.db
        .query("vendors")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(OPTION_ROW_LIMIT),
      ctx.db
        .query("venues")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(OPTION_ROW_LIMIT),
    ]);
    const byLabel = <T extends { label: string }>(a: T, b: T) =>
      a.label.localeCompare(b.label);
    return {
      events: events
        .filter((row) => isLiveTenantRow(row, tenantId))
        .map((row) => ({ id: row._id, label: row.title }))
        .sort(byLabel),
      clients: clients
        .filter(
          (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
        )
        .map((row) => ({
          id: row._id,
          label:
            row.companyName ||
            [row.givenName, row.familyName].filter(Boolean).join(" ") ||
            "Unnamed contact",
        }))
        .sort(byLabel),
      people: people
        .filter(
          (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
        )
        .map((row) => ({
          id: row._id,
          label: `${row.givenName} ${row.familyName}`.trim(),
        }))
        .sort(byLabel),
      vendors: vendors
        .filter(
          (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
        )
        .map((row) => ({ id: row._id, label: row.name }))
        .sort(byLabel),
      venues: venues
        .filter(
          (row) => isLiveTenantRow(row, tenantId) && row.status === "active",
        )
        .map((row) => ({ id: row._id, label: row.name }))
        .sort(byLabel),
      statuses: [
        "quote",
        "planning",
        "pending_approval",
        "approved",
        "sales_lock",
        "executing",
        "final",
        "completed",
        "cancelled",
        "closed_out",
      ],
      categories: ["Contacts", "Event", "Financial", "TPP General"],
    };
  },
});
