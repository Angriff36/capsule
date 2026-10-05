import { query } from "../_generated/server";
import { getAuthContext } from "../lib/authContext";
import { canRead } from "../search";
import {
  OPTION_ROW_LIMIT,
  isLiveTenantRow,
  requireReportTenant,
} from "./shared";

// Generated read policies (convex/queries.ts) of the records each picker
// lists. A picker stays empty for a caller who may not read its records.
const EVENT_READ = ["staffAccess"];
const CLIENT_READ = ["salesAccess", "financeAccess"];
const PERSON_READ = ["staffAccess"];
const VENDOR_READ = ["procurementAccess"];
const VENUE_READ = ["eventAccess"];

export const list = query({
  args: {},
  handler: async (ctx) => {
    const tenantId = await requireReportTenant(ctx);
    const auth = await getAuthContext(ctx);
    const [events, clients, people, vendors, venues] = await Promise.all([
      canRead(auth, EVENT_READ)
        ? ctx.db
            .query("events")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(OPTION_ROW_LIMIT)
        : [],
      canRead(auth, CLIENT_READ)
        ? ctx.db
            .query("clients")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(OPTION_ROW_LIMIT)
        : [],
      canRead(auth, PERSON_READ)
        ? ctx.db
            .query("people")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(OPTION_ROW_LIMIT)
        : [],
      canRead(auth, VENDOR_READ)
        ? ctx.db
            .query("vendors")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(OPTION_ROW_LIMIT)
        : [],
      canRead(auth, VENUE_READ)
        ? ctx.db
            .query("venues")
            .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
            .take(OPTION_ROW_LIMIT)
        : [],
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
