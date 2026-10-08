// Event, planning and kitchen screens read only the rows they show here:
// the time off and availability of the people and days on screen, the
// records a BEO import is matched against by its number, and the prep steps
// of the dishes on the production plan. They used to load these tables whole
// (every row the company ever had), and on the live server those loads ran
// out of time.
//
// Each query keeps the read rule of its generated list (convex/queries.ts);
// a row the caller may not read is left out, as there. Encrypted notes and
// reasons are left out: these screens do not show them.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext, type AppAuthContext } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import type { EventLookupRow } from "./eventLookup";
import { canRead } from "./search";

export const PEOPLE_CAP = 1000;
export const DISH_TASK_CAP = 3000;
/** Newest proposals and orders also searched for a number (no index yet). */
const NEWEST_SEARCHED = 200;

const live = <T extends { tenantId: string; deletedAt?: number | null }>(
  rows: T[],
  tenantId: string,
) => rows.filter((row) => row.tenantId === tenantId && row.deletedAt == null);

/** workforceManageAccess: admin, owner, system, workforce_manager. */
const managesWorkforce = (auth: AppAuthContext) =>
  ["admin", "owner", "system", "workforce_manager"].includes(auth.role) &&
  !orgCapabilityDeniesAction(
    "workforceManageAccess",
    auth.disabledCapabilities,
  );
// listTimeOffRequest's read rule, row by row.
const readsTimeOff = (auth: AppAuthContext, row: Doc<"timeOffRequests">) =>
  managesWorkforce(auth) ||
  (auth.id !== "" &&
    row.requesterAuthSubjectId != null &&
    row.requesterAuthSubjectId === auth.id) ||
  (auth.personId != null && row.personId === auth.personId);
// listAvailabilityWindow's read rule, row by row.
const readsAvailability = (
  auth: AppAuthContext,
  row: Doc<"availabilityWindows">,
) =>
  canRead(auth, ["workforceAccess"]) ||
  (canRead(auth, ["workforceSelfAccess"]) &&
    auth.personId != null &&
    row.personId === auth.personId);

/**
 * Approved time off and availability windows (any state) of these people
 * (at most PEOPLE_CAP) that overlap [from, to). Rows without both times are
 * left out; every screen that reads this skips them too.
 */
export const awayForPeople = query({
  args: { personIds: v.array(v.string()), from: v.number(), to: v.number() },
  handler: async (ctx, { personIds, from, to }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      timeOff: [] as Doc<"timeOffRequests">[],
      availability: [] as Doc<"availabilityWindows">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const overlaps = (row: {
      startsAt?: number | null;
      endsAt?: number | null;
    }) =>
      row.startsAt != null &&
      row.endsAt != null &&
      row.startsAt < to &&
      row.endsAt > from;
    for (const raw of [...new Set(personIds)].slice(0, PEOPLE_CAP)) {
      const personId = ctx.db.normalizeId("people", raw);
      if (!personId) continue;
      for (const row of live(
        await ctx.db
          .query("timeOffRequests")
          .withIndex("by_staff_status_end", (q) =>
            q
              .eq("tenantId", tenantId)
              .eq("personId", personId)
              .eq("status", "approved")
              .gt("endsAt", from),
          )
          .collect(),
        tenantId,
      ))
        if (overlaps(row) && readsTimeOff(auth, row))
          out.timeOff.push({
            ...row,
            reason: undefined,
            responseNote: undefined,
          });
      for (const row of live(
        await ctx.db
          .query("availabilityWindows")
          .withIndex("by_personId", (q) => q.eq("personId", personId))
          .collect(),
        tenantId,
      ))
        if (overlaps(row) && readsAvailability(auth, row))
          out.availability.push({ ...row, notes: undefined });
    }
    return out;
  },
});

/** The light row of convex/eventLookup.ts. */
const lookupRow = (e: Doc<"events">): EventLookupRow => ({
  _id: e._id,
  title: e.title,
  stage: e.stage,
  eventType: e.eventType,
  startsAt: e.startsAt ?? null,
  endsAt: e.endsAt ?? null,
  venueId: e.venueId ?? null,
  venueName: e.venueName ?? null,
  clientId: e.clientId ?? null,
  expectedHeadcount: e.expectedHeadcount ?? null,
  serviceStyleId: e.serviceStyleId ?? null,
  occasionId: e.occasionId ?? null,
  eventNumber: e.eventNumber ?? null,
  deletedAt: e.deletedAt ?? null,
  quotedPrice: e.quotedPrice ?? null,
  assignedToId: e.assignedToId ?? null,
  referralSourceId: e.referralSourceId ?? null,
  serviceStyleName: e.serviceStyleName ?? null,
  budgetAmount: e.budgetAmount ?? null,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

/** Live events with this event number, light rows. */
export const eventsByNumber = query({
  args: { eventNumber: v.string() },
  handler: async (ctx, { eventNumber }): Promise<EventLookupRow[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return [];
    return live(
      await ctx.db
        .query("events")
        .withIndex("by_eventNumber", (q) => q.eq("eventNumber", eventNumber))
        .collect(),
      auth.tenantId,
    ).map(lookupRow);
  },
});

type NumberedProposal = Pick<
  Doc<"proposals">,
  "_id" | "proposalNumber" | "status" | "deletedAt"
>;
type NumberedOrder = Pick<
  Doc<"vendorOrders">,
  "_id" | "orderNumber" | "status" | "deletedAt"
>;

/**
 * The proposals numbered `number` and the vendor orders numbered
 * TPP-<number>-…, for a BEO re-import. Proposals and orders have no index on
 * their number yet, so they are found on the events and invoices that carry
 * the number (an import puts both on its event) and among the newest
 * NEWEST_SEARCHED of each.
 */
export const importNumberRecords = query({
  args: { number: v.string() },
  handler: async (ctx, { number }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      proposals: [] as NumberedProposal[],
      vendorOrders: [] as NumberedOrder[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const readsProposals = canRead(auth, ["salesAccess"]);
    const readsOrders = canRead(auth, ["procurementAccess", "manageAccess"]);
    if (!readsProposals && !readsOrders) return out;
    const eventIds = new Set<Id<"events">>();
    for (const event of await ctx.db
      .query("events")
      .withIndex("by_eventNumber", (q) => q.eq("eventNumber", number))
      .collect())
      if (event.tenantId === tenantId) eventIds.add(event._id);
    for (const invoice of await ctx.db
      .query("invoices")
      .withIndex("by_tenantId_and_invoiceNumber", (q) =>
        q.eq("tenantId", tenantId).eq("invoiceNumber", number),
      )
      .collect())
      if (invoice.eventId) eventIds.add(invoice.eventId);

    const isProposal = (row: Doc<"proposals">) => row.proposalNumber === number;
    const isOrder = (row: Doc<"vendorOrders">) =>
      String(row.orderNumber ?? "").startsWith(`TPP-${number}-`);
    const proposals = new Map<string, Doc<"proposals">>();
    const orders = new Map<string, Doc<"vendorOrders">>();
    for (const eventId of eventIds) {
      if (readsProposals)
        for (const row of await ctx.db
          .query("proposals")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .collect())
          if (isProposal(row)) proposals.set(row._id, row);
      if (readsOrders)
        for (const row of await ctx.db
          .query("vendorOrders")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .collect())
          if (isOrder(row)) orders.set(row._id, row);
    }
    if (readsProposals)
      for (const row of await ctx.db
        .query("proposals")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .order("desc")
        .take(NEWEST_SEARCHED))
        if (isProposal(row)) proposals.set(row._id, row);
    if (readsOrders)
      for (const row of await ctx.db
        .query("vendorOrders")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .order("desc")
        .take(NEWEST_SEARCHED))
        if (isOrder(row)) orders.set(row._id, row);

    for (const row of live([...proposals.values()], tenantId))
      out.proposals.push({
        _id: row._id,
        proposalNumber: row.proposalNumber,
        status: row.status,
        deletedAt: row.deletedAt,
      });
    for (const row of live([...orders.values()], tenantId))
      out.vendorOrders.push({
        _id: row._id,
        orderNumber: row.orderNumber,
        status: row.status,
        deletedAt: row.deletedAt,
      });
    return out;
  },
});

/**
 * The prep steps (dish tasks) with these ids (at most DISH_TASK_CAP) and the
 * steps they come after, for the production plan (listDishTask read rule).
 */
export const dishTasksByIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }): Promise<Doc<"dishTasks">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["kitchenAccess", "manageAccess"]))
      return [];
    const tenantId = auth.tenantId;
    const found = new Map<string, Doc<"dishTasks">>();
    const read = async (raw: string) => {
      if (found.has(raw)) return;
      const id = ctx.db.normalizeId("dishTasks", raw);
      const row = id ? await ctx.db.get(id) : null;
      if (row && row.tenantId === tenantId && row.deletedAt == null)
        found.set(row._id, row);
    };
    for (const raw of [...new Set(ids)].slice(0, DISH_TASK_CAP))
      await read(raw);
    for (const row of [...found.values()])
      if (row.sequenceAfterDishTaskId) await read(row.sequenceAfterDishTaskId);
    return [...found.values()];
  },
});
