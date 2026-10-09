/**
 * AUTHOR SEAM — did a client email reach the inbox? (PL-OUTBOUND, AC-352)
 * The email service's delivery callback needs a signed route; Capsule does
 * not wait for one. After each sent invoice, reminder, proposal or inbox
 * reply email, Capsule asks the email service about it a few times over
 * three days (GET /emails/{id}) and keeps the first final answer on the
 * conversation message: delivered, bounced or failed. Only a message still
 * at "sent" is ever changed, so a final answer never goes back and a repeat
 * check adds nothing.
 */
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";

/** Minutes after the send at which Capsule asks again (about three days). */
const CHECK_DELAYS_MINUTES = [10, 30, 120, 360, 1440, 2880] as const;
const MINUTE = 60_000;
export const FIRST_EMAIL_CHECK_MS = CHECK_DELAYS_MINUTES[0] * MINUTE;

export type EmailOutcome = "delivered" | "bounced" | "failed";

/** Email service last event → Capsule state; null while still on its way. */
export function emailOutcome(lastEvent: string): EmailOutcome | null {
  switch (lastEvent) {
    case "delivered":
    case "opened":
    case "clicked":
    case "complained":
      return "delivered";
    case "bounced":
    case "suppressed":
      return "bounced";
    case "failed":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

/** Queues the first check for an email Capsule just sent. */
export async function scheduleEmailDeliveryCheck(
  ctx: Pick<MutationCtx, "scheduler">,
  tenantId: string,
  emailId: string,
): Promise<void> {
  await ctx.scheduler.runAfter(
    FIRST_EMAIL_CHECK_MS,
    internal.emailDelivery.checkEmail,
    { tenantId, emailId, attempt: 0 },
  );
}

async function sentMessages(
  ctx: { db: QueryCtx["db"] },
  tenantId: string,
  emailId: string,
): Promise<Doc<"messages">[]> {
  return (
    await ctx.db
      .query("messages")
      .withIndex("by_providerMessageId", (q) =>
        q.eq("providerMessageId", emailId),
      )
      .collect()
  ).filter(
    (message) =>
      message.tenantId === tenantId &&
      message.deletedAt == null &&
      message.direction === "outbound" &&
      message.status === "sent",
  );
}

/** True while some message for this email still waits for an answer. */
export const awaitingAnswer = internalQuery({
  args: { tenantId: v.string(), emailId: v.string() },
  handler: async (ctx, args): Promise<boolean> =>
    (await sentMessages(ctx, args.tenantId, args.emailId)).length > 0,
});

/** Sets the final state on messages still at "sent"; others stay as they are. */
export const recordOutcome = internalMutation({
  args: {
    tenantId: v.string(),
    emailId: v.string(),
    outcome: v.union(
      v.literal("delivered"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args): Promise<{ updated: number }> => {
    const messages = await sentMessages(ctx, args.tenantId, args.emailId);
    const system = TenantSystemCommandRunner.forTenant(
      ctx,
      args.tenantId,
    ).context;
    for (const message of messages) {
      await system.runMutation(api.mutations.Message_setDelivery, {
        docId: message._id,
        status: args.outcome,
      });
    }
    return { updated: messages.length };
  },
});

/** Asks the email service about one email; asks again later until it settles. */
export const checkEmail = internalAction({
  args: { tenantId: v.string(), emailId: v.string(), attempt: v.number() },
  handler: async (ctx, args): Promise<{ outcome: EmailOutcome | null }> => {
    const waiting: boolean = await ctx.runQuery(
      internal.emailDelivery.awaitingAnswer,
      { tenantId: args.tenantId, emailId: args.emailId },
    );
    if (!waiting) return { outcome: null };
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) return { outcome: null };

    let outcome: EmailOutcome | null = null;
    try {
      const response = await fetch(
        `https://api.resend.com/emails/${encodeURIComponent(args.emailId)}`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (response.ok) {
        const body = (await response.json().catch(() => null)) as {
          last_event?: unknown;
        } | null;
        if (typeof body?.last_event === "string") {
          outcome = emailOutcome(body.last_event);
        }
      }
    } catch {
      // Email service unreachable: the next check asks again.
    }

    if (outcome) {
      await ctx.runMutation(internal.emailDelivery.recordOutcome, {
        tenantId: args.tenantId,
        emailId: args.emailId,
        outcome,
      });
      return { outcome };
    }
    const next = args.attempt + 1;
    if (next < CHECK_DELAYS_MINUTES.length) {
      await ctx.scheduler.runAfter(
        (CHECK_DELAYS_MINUTES[next] - CHECK_DELAYS_MINUTES[args.attempt]) *
          MINUTE,
        internal.emailDelivery.checkEmail,
        { ...args, attempt: next },
      );
    }
    return { outcome: null };
  },
});
