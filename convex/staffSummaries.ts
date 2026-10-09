// AUTHOR-OWNED — staff email summaries (PL-ROUTE-STATES, AC-054 sweep task).
// The "Email dispatches" page (/settings/email) saves each person's choices;
// this sends them. Once a day at about 7 in the morning (kitchen time) each
// person who turned a summary on gets one short email per summary that has
// something to tell: events changed in the last day, invoices past due or due
// soon (finance and managers only), stock at or below its reorder level
// (kitchen, stock and managers only), and their own shift changes. Nothing to
// tell = no email. The same summary never goes twice on one day.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  getAuthContext,
  requireTenant,
  type AppAuthContext,
} from "./lib/authContext";
import { loadDisabledOrgCapabilities } from "./lib/orgCapabilityGate";
import { canRead } from "./search";
import {
  decryptField,
  fromAddress,
  safeProviderMessage,
} from "./invoiceReminders";
import { maskEmail } from "./lib/reminderDelivery";
import {
  eventUpdatesSummary,
  invoiceFollowUpSummary,
  lowStockSummary,
  nextMorningRun,
  shiftChangesSummary,
  type SummaryContent,
} from "./lib/staffSummaryContent";
import {
  isEmailNotificationSubscribed,
  renderEmailNotificationSummary,
} from "../src/lib/emailNotifications";

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_MS = 3 * DAY_MS;
const OPEN_INVOICE_STATES = ["sent", "viewed", "overdue", "partial"] as const;
const OPEN_INVOICE = new Set<string>(OPEN_INVOICE_STATES);
const EVENT_CANDIDATE_CAP = 1000;
const NEWEST_EVENT_CAP = 300;

const EVENT = {
  booked: "StaffSummariesBooked",
  sent: "StaffSummarySent",
  failed: "StaffSummaryFailed",
} as const;

/** The kitchen's zone: the first active location that has one. */
async function kitchenTimeZone(ctx: QueryCtx, tenantId: string) {
  const locations = await ctx.db
    .query("operatingLocations")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .take(50);
  return (
    locations.find(
      (row) => row.deletedAt == null && row.status === "active" && row.timeZone,
    )?.timeZone ?? null
  );
}

async function newestBooking(ctx: QueryCtx, tenantId: string) {
  // One booking row a day: read newest first and stop at the first booking,
  // never the whole booking history.
  const rows = await ctx.db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", `summaries:${tenantId}`))
    .order("desc")
    .take(50);
  return (
    rows
      .filter((row) => row.type === EVENT.booked)
      .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
  );
}

/**
 * Events that can have changed in the last day, without reading the whole
 * event history (there is no updatedAt index): events from a week ago on,
 * the newest-created ones, and any whose stage moved inside the window.
 * The caller still keeps only rows with updatedAt inside the window.
 */
async function recentlyChangedEventCandidates(
  ctx: QueryCtx,
  tenantId: string,
  now: number,
  since: number,
) {
  const lists = await Promise.all([
    ctx.db
      .query("events")
      .withIndex("by_tenantId_and_startsAt", (q) =>
        q.eq("tenantId", tenantId).gte("startsAt", now - 7 * DAY_MS),
      )
      .take(EVENT_CANDIDATE_CAP),
    ctx.db
      .query("events")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .take(NEWEST_EVENT_CAP),
    ctx.db
      .query("events")
      .withIndex("by_tenantId_and_approvedAt", (q) =>
        q.eq("tenantId", tenantId).gte("approvedAt", since),
      )
      .take(EVENT_CANDIDATE_CAP),
    ctx.db
      .query("events")
      .withIndex("by_tenantId_and_executionStartedAt", (q) =>
        q.eq("tenantId", tenantId).gte("executionStartedAt", since),
      )
      .take(EVENT_CANDIDATE_CAP),
    ctx.db
      .query("events")
      .withIndex("by_tenantId_and_completedAt", (q) =>
        q.eq("tenantId", tenantId).gte("completedAt", since),
      )
      .take(EVENT_CANDIDATE_CAP),
    ctx.db
      .query("events")
      .withIndex("by_tenantId_and_cancelledAt", (q) =>
        q.eq("tenantId", tenantId).gte("cancelledAt", since),
      )
      .take(EVENT_CANDIDATE_CAP),
    ctx.db
      .query("events")
      .withIndex("by_tenantId_and_closedOutAt", (q) =>
        q.eq("tenantId", tenantId).gte("closedOutAt", since),
      )
      .take(EVENT_CANDIDATE_CAP),
  ]);
  const byId = new Map<string, Doc<"events">>();
  for (const row of lists.flat()) byId.set(String(row._id), row);
  return [...byId.values()];
}

function sendKey(personId: string, category: string, now: number): string {
  return `summary:${personId}:${category}:${new Date(now).toISOString().slice(0, 10)}`;
}

/** Books the next morning run unless one is already waiting. */
async function bookNext(
  ctx: MutationCtx,
  tenantId: string,
  now: number,
): Promise<number> {
  const booked = await newestBooking(ctx, tenantId);
  const bookedAt = (booked?.payload as { nextRunAt?: unknown } | undefined)
    ?.nextRunAt;
  if (typeof bookedAt === "number" && bookedAt > now) return bookedAt;
  const nextRunAt = nextMorningRun(now, await kitchenTimeZone(ctx, tenantId));
  await ctx.scheduler.runAt(nextRunAt, internal.staffSummaries.runTenant, {
    tenantId,
  });
  await ctx.db.insert("manifestEvents", {
    type: EVENT.booked,
    entity: "StaffSummaries",
    entityId: `summaries:${tenantId}`,
    payload: { tenantId, nextRunAt },
    createdAt: now,
  });
  return nextRunAt;
}

/** Called by the page when someone turns a summary on: starts the daily run. */
export const ensureBooked = mutation({
  args: {},
  handler: async (ctx): Promise<{ nextRunAt: number }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!auth.id) throw new ConvexError("Sign in to turn on email summaries.");
    return { nextRunAt: await bookNext(ctx, tenantId, Date.now()) };
  },
});

/** What the page needs to tell the truth: is email set up, when is the next run. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    const booked = await newestBooking(ctx, tenantId);
    const nextRunAt = (booked?.payload as { nextRunAt?: unknown } | undefined)
      ?.nextRunAt;
    return {
      emailReady: Boolean(
        process.env.RESEND_API_KEY?.trim() &&
        process.env.INVOICE_REMINDER_FROM_EMAIL?.trim(),
      ),
      nextRunAt:
        typeof nextRunAt === "number" && nextRunAt > Date.now()
          ? nextRunAt
          : null,
    };
  },
});

interface PlannedEmail {
  key: string;
  personId: string;
  email: string;
  content: SummaryContent;
}

/** Every summary due today, for every person who saved a choice. */
export const plan = internalQuery({
  args: { tenantId: v.string(), now: v.number() },
  handler: async (ctx, { tenantId, now }) => {
    const since = now - DAY_MS;
    const [subscriptions, events, invoices, stock, organizations, timeZone] =
      await Promise.all([
        ctx.db
          .query("emailNotificationSubscriptions")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .collect(),
        recentlyChangedEventCandidates(ctx, tenantId, now, since),
        // Only open invoices can need follow-up: read those states, not the
        // whole invoice history.
        Promise.all(
          OPEN_INVOICE_STATES.map((status) =>
            ctx.db
              .query("invoices")
              .withIndex("by_tenantId_and_status", (q) =>
                q.eq("tenantId", tenantId).eq("status", status),
              )
              .collect(),
          ),
        ).then((lists) => lists.flat()),
        // Only tracked lines (a reorder point above zero) can be low.
        ctx.db
          .query("inventoryItems")
          .withIndex("by_tenantId_and_reorderThreshold", (q) =>
            q.eq("tenantId", tenantId).gt("reorderThreshold", 0),
          )
          .collect(),
        ctx.db
          .query("organizations")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .collect(),
        kitchenTimeZone(ctx, tenantId),
      ]);
    const disabled = await loadDisabledOrgCapabilities(ctx.db, tenantId);

    const eventSummary = eventUpdatesSummary(
      events.filter(
        (row) => row.deletedAt == null && (row.updatedAt ?? 0) >= since,
      ),
      timeZone,
    );
    const invoiceSummary = invoiceFollowUpSummary(
      invoices
        .filter(
          (row) =>
            row.deletedAt == null &&
            OPEN_INVOICE.has(row.status) &&
            row.amountDue > 0 &&
            row.dueDate != null &&
            row.dueDate < now + DUE_SOON_MS,
        )
        .map((row) => ({
          invoiceNumber: row.invoiceNumber,
          amountDue: row.amountDue,
          dueDate: row.dueDate as number,
        })),
      now,
      timeZone,
    );
    const lowRows = stock.filter(
      (row) =>
        row.deletedAt == null &&
        row.removedAt == null &&
        row.reorderThreshold > 0 &&
        row.quantityOnHand <= row.reorderThreshold,
    );
    const lowNames = await Promise.all(
      lowRows.map((row) => ctx.db.get(row.ingredientId)),
    );
    const stockSummary = lowStockSummary(
      lowRows.map((row, index) => ({
        name: lowNames[index]?.name ?? "Item",
        quantityOnHand: row.quantityOnHand,
        unit: String(row.unit),
      })),
    );

    const planned: PlannedEmail[] = [];
    for (const subscription of subscriptions) {
      // Only people who saved a choice on the page get email.
      if (subscription.configuredAt == null || !subscription.ownerId) continue;
      const person = (
        await ctx.db
          .query("people")
          .withIndex("by_authSubjectId", (q) =>
            q.eq("authSubjectId", subscription.ownerId),
          )
          .collect()
      ).find(
        (row) =>
          row.tenantId === tenantId &&
          row.deletedAt == null &&
          row.status === "active",
      );
      if (!person) continue;
      const email = (
        await decryptField(ctx, "Person", "email", person.email)
      )?.trim();
      if (!email?.includes("@")) continue;
      const reader = {
        role: person.role,
        disabledCapabilities: disabled,
      } as AppAuthContext;
      const personId = String(person._id);
      const add = (content: SummaryContent | null) => {
        if (!content) return;
        if (!isEmailNotificationSubscribed(subscription, content.category))
          return;
        planned.push({
          key: sendKey(personId, content.category, now),
          personId,
          email,
          content,
        });
      };

      if (canRead(reader, ["staffAccess"])) add(eventSummary);
      if (canRead(reader, ["financeAccess", "manageAccess"]))
        add(invoiceSummary);
      if (canRead(reader, ["inventoryAccess", "kitchenAccess", "manageAccess"]))
        add(stockSummary);
      if (isEmailNotificationSubscribed(subscription, "shift_changes")) {
        const shifts =
          // Only shifts still ahead (or with no end time) can be in it.
          (
            await Promise.all(
              [
                (q: any) => q.eq("personId", person._id).gte("endsAt", now),
                (q: any) => q.eq("personId", person._id).eq("endsAt", null),
                (q: any) =>
                  q.eq("personId", person._id).eq("endsAt", undefined),
              ].map((range) =>
                ctx.db
                  .query("shifts")
                  .withIndex("by_personId_and_endsAt", range)
                  .collect(),
              ),
            )
          )
            .flat()
            .filter(
              (row) =>
                row.tenantId === tenantId &&
                row.deletedAt == null &&
                (row.updatedAt ?? 0) >= since &&
                row.startsAt != null &&
                row.startsAt >= now,
            );
        const titles = await Promise.all(
          shifts.map((row) => (row.eventId ? ctx.db.get(row.eventId) : null)),
        );
        add(
          shiftChangesSummary(
            shifts.map((row, index) => ({
              startsAt: row.startsAt as number,
              role: row.role,
              eventTitle: titles[index]?.title ?? null,
              status: row.status,
            })),
            timeZone,
          ),
        );
      }
    }

    // Leave out what already went today.
    const due: PlannedEmail[] = [];
    for (const item of planned) {
      const tries = await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", item.key))
        .take(20);
      if (!tries.some((row) => row.type === EVENT.sent)) due.push(item);
    }

    const organization =
      organizations.find(
        (row) => row.deletedAt == null && row.status === "active",
      ) ?? organizations.find((row) => row.deletedAt == null);
    return {
      planned: due,
      branding: {
        displayName:
          organization?.brandDisplayName?.trim() ||
          organization?.name.trim() ||
          "Catering company",
        address: organization?.brandAddress ?? null,
        primaryColor: organization?.brandPrimaryColor ?? null,
        accentColor: organization?.brandAccentColor ?? null,
      },
      senderName:
        organization?.emailSenderName?.trim() ||
        organization?.brandDisplayName?.trim() ||
        organization?.name.trim() ||
        "Catering company",
    };
  },
});

export const record = internalMutation({
  args: {
    type: v.union(v.literal(EVENT.sent), v.literal(EVENT.failed)),
    key: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
      type: args.type,
      entity: "StaffSummary",
      entityId: args.key,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

export const bookTomorrow = internalMutation({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    await bookNext(ctx, tenantId, Date.now());
  },
});

/** One morning run for one company, then the next one is booked. */
export const runTenant = internalAction({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const configuredFrom = process.env.INVOICE_REMINDER_FROM_EMAIL?.trim();
    const appOrigin = process.env.CAPSULE_PUBLIC_APP_URL?.trim();
    let sent = 0;
    let failed = 0;
    if (resendApiKey && configuredFrom && appOrigin) {
      const plan = await ctx.runQuery(internal.staffSummaries.plan, {
        tenantId,
        now: Date.now(),
      });
      const from = fromAddress(plan.senderName, configuredFrom);
      for (const item of plan.planned) {
        try {
          const email = renderEmailNotificationSummary({
            ...item.content,
            appOrigin,
            branding: plan.branding,
          });
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": item.key,
            },
            body: JSON.stringify({
              from,
              to: [item.email],
              subject: email.subject,
              html: email.html,
              text: email.text,
              tags: [{ name: "category", value: item.content.category }],
            }),
          });
          const body = (await response.json().catch(() => null)) as {
            id?: unknown;
          } | null;
          if (!response.ok || typeof body?.id !== "string") {
            throw new Error(`Email service answered ${response.status}.`);
          }
          await ctx.runMutation(internal.staffSummaries.record, {
            type: EVENT.sent,
            key: item.key,
            payload: {
              tenantId,
              personId: item.personId,
              category: item.content.category,
              recipientMasked: maskEmail(item.email),
              emailId: body.id,
              itemCount: item.content.items.length,
            },
          });
          sent += 1;
        } catch (cause) {
          failed += 1;
          await ctx.runMutation(internal.staffSummaries.record, {
            type: EVENT.failed,
            key: item.key,
            payload: {
              tenantId,
              personId: item.personId,
              category: item.content.category,
              message: safeProviderMessage(cause),
            },
          });
        }
      }
    }
    // Not set up yet: nothing is sent, but the run stays booked so summaries
    // start the morning after email is set up.
    await ctx.runMutation(internal.staffSummaries.bookTomorrow, { tenantId });
    return { sent, failed };
  },
});
