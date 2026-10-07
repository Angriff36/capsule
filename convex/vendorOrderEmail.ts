// AUTHOR-OWNED — "Email this order to the vendor" (PL-ROUTE-STATES, AC-054
// sweep task). Capsule used to only mark an order sent; now a buyer can email
// the order to the vendor's contact. It keeps the same send record as client
// emails (who it went to, masked; template; fingerprint), refuses to send the
// same order twice in a day, and explains a failure in plain words.
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import {
  artifactFingerprint,
  classifyReminderFailure,
  documentEmailHistory,
  emailServiceFailureKind,
  maskEmail,
  RECENT_SEND_WINDOW_MS,
  ReminderDeliveryError,
  reminderRemedy,
  type ReminderHistoryItem,
} from "./lib/reminderDelivery";
import {
  companySender,
  decryptField,
  fromAddress,
  safeProviderMessage,
} from "./invoiceReminders";
import {
  renderVendorOrderEmail,
  VENDOR_ORDER_EMAIL_TEMPLATE,
} from "../src/lib/vendorOrderEmail";

export const VENDOR_ORDER_EMAIL_EVENT = {
  sent: "VendorOrderEmailSent",
  failed: "VendorOrderEmailFailed",
} as const;

/** The order is marked sent (or later) and not finished or cancelled. */
const EMAILABLE_STATUSES = new Set([
  "submitted",
  "confirmed",
  "partially_received",
]);

/** Who gets the order first: the vendor's dispatch desk, then the rep. */
const CONTACT_ROLE_ORDER = ["dispatch", "account_rep", "general", "billing"];

const NO_RECIPIENT_REMEDY =
  "Add an email to the vendor or one of its contacts, then send again.";
const REFUSED_REMEDY =
  "The email service would not take this email. Check the vendor's email address, then send again.";

export interface VendorOrderEmailResult {
  status: "sent" | "already_sent";
  emailId?: string;
  sentAt?: number;
  to?: string;
}

interface LedgerRow {
  type: string;
  createdAt: number;
  payload: Record<string, unknown>;
}

async function loadLedger(
  ctx: QueryCtx,
  vendorOrderId: string,
  tenantId: string,
): Promise<LedgerRow[]> {
  const rows = await ctx.db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", vendorOrderId))
    .collect();
  return rows
    .filter(
      (row) =>
        row.entity === "VendorOrder" &&
        (row.type === VENDOR_ORDER_EMAIL_EVENT.sent ||
          row.type === VENDOR_ORDER_EMAIL_EVENT.failed) &&
        (row.payload as { tenantId?: unknown })?.tenantId === tenantId,
    )
    .map((row) => ({
      type: row.type,
      createdAt: row.createdAt,
      payload: row.payload as Record<string, unknown>,
    }));
}

export const recordEvent = internalMutation({
  args: {
    type: v.union(
      v.literal(VENDOR_ORDER_EMAIL_EVENT.sent),
      v.literal(VENDOR_ORDER_EMAIL_EVENT.failed),
    ),
    vendorOrderId: v.id("vendorOrders"),
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("manifestEvents", {
      type: args.type,
      entity: "VendorOrder",
      entityId: String(args.vendorOrderId),
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

export const loadContext = internalQuery({
  args: { vendorOrderId: v.id("vendorOrders"), tenantId: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.vendorOrderId);
    if (!order || order.tenantId !== args.tenantId) return null;
    const [vendor, contacts, lines, vendorItems, organizations, ledger] =
      await Promise.all([
        ctx.db.get(order.vendorId),
        ctx.db
          .query("vendorContacts")
          .withIndex("by_vendorId", (q) => q.eq("vendorId", order.vendorId))
          .collect(),
        ctx.db
          .query("vendorOrderLines")
          .withIndex("by_vendorOrderId", (q) =>
            q.eq("vendorOrderId", args.vendorOrderId),
          )
          .collect(),
        ctx.db
          .query("vendorItems")
          .withIndex("by_vendorId", (q) => q.eq("vendorId", order.vendorId))
          .collect(),
        ctx.db
          .query("organizations")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
          .collect(),
        loadLedger(ctx, String(args.vendorOrderId), args.tenantId),
      ]);
    if (!vendor || vendor.tenantId !== args.tenantId) return null;

    const activeContacts = contacts
      .filter(
        (row) =>
          row.tenantId === args.tenantId &&
          row.deletedAt == null &&
          Boolean(row.email),
      )
      .sort(
        (left, right) =>
          CONTACT_ROLE_ORDER.indexOf(left.role) -
          CONTACT_ROLE_ORDER.indexOf(right.role),
      );
    let recipient: {
      email: string;
      name: string | null;
      source: string;
    } | null = null;
    for (const contact of activeContacts) {
      const email = await decryptField(
        ctx,
        "VendorContact",
        "email",
        contact.email,
      );
      if (email?.includes("@")) {
        recipient = {
          email: email.trim(),
          name: contact.name,
          source: contact.role,
        };
        break;
      }
    }
    if (!recipient) {
      const email = await decryptField(ctx, "Vendor", "email", vendor.email);
      if (email?.includes("@")) {
        recipient = { email: email.trim(), name: null, source: "vendor" };
      }
    }

    const openLines = lines.filter(
      (line) =>
        line.tenantId === args.tenantId &&
        line.deletedAt == null &&
        line.status !== "cancelled" &&
        line.orderedQuantity > 0,
    );
    const ingredients = await Promise.all(
      openLines.map((line) => ctx.db.get(line.ingredientId)),
    );
    const itemByIngredient = new Map<string, Doc<"vendorItems">>();
    for (const item of vendorItems) {
      if (item.deletedAt == null && item.tenantId === args.tenantId) {
        itemByIngredient.set(String(item.ingredientId), item);
      }
    }
    const organization =
      organizations.find(
        (row) => row.deletedAt == null && row.status === "active",
      ) ?? organizations.find((row) => row.deletedAt == null);
    const displayName =
      organization?.brandDisplayName?.trim() ||
      organization?.name.trim() ||
      "Catering company";

    return {
      order,
      vendorName: vendor.name,
      recipient,
      lines: openLines.map((line, index) => ({
        ingredientId: String(line.ingredientId),
        name: ingredients[index]?.name ?? "Item",
        itemCode:
          itemByIngredient.get(String(line.ingredientId))?.itemCode?.trim() ||
          null,
        quantity: line.orderedQuantity,
        unit: String(line.unit),
      })),
      organization: {
        displayName,
        address: organization?.brandAddress?.trim() || null,
        ...companySender(organization, displayName),
      },
      ledger,
    };
  },
});

export const send = action({
  args: { vendorOrderId: v.id("vendorOrders") },
  handler: async (ctx, args): Promise<VendorOrderEmailResult> => {
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const configuredFrom = process.env.INVOICE_REMINDER_FROM_EMAIL?.trim();
    if (!resendApiKey || !configuredFrom) {
      throw new ConvexError(reminderRemedy("not_set_up"));
    }
    // The generated read applies the order's own read rule (buyers and
    // managers) and the company check.
    const visible = await ctx.runQuery(api.queries.getVendorOrder, {
      id: args.vendorOrderId,
    });
    if (!visible) {
      throw new ConvexError(
        "Capsule could not find this order. It may have been removed, or your role cannot open it. Ask a manager.",
      );
    }
    if (!EMAILABLE_STATUSES.has(String(visible.status))) {
      throw new ConvexError(
        "Mark the order sent first, then email it. A received or cancelled order is not emailed.",
      );
    }
    const tenantId = visible.tenantId;
    const context = await ctx.runQuery(internal.vendorOrderEmail.loadContext, {
      vendorOrderId: args.vendorOrderId,
      tenantId,
    });
    if (!context) {
      throw new ConvexError(
        "Capsule could not find this order. It may have been removed, or your role cannot open it. Ask a manager.",
      );
    }
    if (context.lines.length === 0) {
      throw new ConvexError(
        "This order has no items to send. Add items first.",
      );
    }
    const contentKey = (
      await artifactFingerprint([
        JSON.stringify(
          context.lines.map((line) => [
            line.ingredientId,
            line.quantity,
            line.unit,
          ]),
        ),
        context.order.notes ?? "",
      ])
    ).slice(0, 16);
    const now = Date.now();
    const recent = context.ledger
      .filter(
        (row) =>
          row.type === VENDOR_ORDER_EMAIL_EVENT.sent &&
          row.payload.contentKey === contentKey &&
          now - row.createdAt < RECENT_SEND_WINDOW_MS,
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    if (recent) {
      return {
        status: "already_sent",
        sentAt: recent.createdAt,
        to:
          typeof recent.payload.recipientMasked === "string"
            ? recent.payload.recipientMasked
            : undefined,
      };
    }

    const record = (
      type: (typeof VENDOR_ORDER_EMAIL_EVENT)[keyof typeof VENDOR_ORDER_EMAIL_EVENT],
      payload: Record<string, unknown>,
    ) =>
      ctx.runMutation(internal.vendorOrderEmail.recordEvent, {
        type,
        vendorOrderId: args.vendorOrderId,
        payload: { tenantId, source: "manual", attempt: 0, ...payload },
      });

    try {
      if (!context.recipient) {
        throw new ReminderDeliveryError(
          "no_recipient",
          "No vendor or vendor contact email is available.",
        );
      }
      const recipient = context.recipient;
      const orderNumber = String(
        context.order.orderNumber || context.order._id,
      );
      const email = renderVendorOrderEmail({
        companyName: context.organization.displayName,
        companyAddress: context.organization.address,
        vendorName: context.vendorName,
        contactName: recipient.name,
        orderNumber,
        weekStart: context.order.sourceRangeStart ?? null,
        notes: context.order.notes ?? null,
        lines: context.lines,
      });
      const from = fromAddress(context.organization.senderName, configuredFrom);
      const replyTo = context.organization.replyTo;
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `vendor-order-send/${context.order._id}/${contentKey}`,
          },
          body: JSON.stringify({
            from,
            to: [recipient.email],
            ...(replyTo ? { reply_to: replyTo } : {}),
            subject: email.subject,
            html: email.html,
            text: email.text,
            tags: [
              { name: "category", value: VENDOR_ORDER_EMAIL_TEMPLATE.id },
              { name: "vendor_order_id", value: String(context.order._id) },
            ],
          }),
        });
      } catch (cause) {
        throw new ReminderDeliveryError(
          "service_down",
          `Email service unreachable: ${safeProviderMessage(cause)}`,
        );
      }
      const body = (await response.json().catch(() => null)) as {
        id?: unknown;
        name?: unknown;
        message?: unknown;
      } | null;
      if (!response.ok) {
        throw new ReminderDeliveryError(
          emailServiceFailureKind(response.status, body?.name),
          typeof body?.message === "string"
            ? body.message
            : `Vendor order email failed (${response.status}).`,
        );
      }
      const emailId = typeof body?.id === "string" ? body.id : null;
      if (!emailId) {
        throw new Error("Email provider did not return a delivery id.");
      }
      await record(VENDOR_ORDER_EMAIL_EVENT.sent, {
        emailId,
        providerState: "accepted",
        contentKey,
        recipientMasked: maskEmail(recipient.email),
        recipientSource: recipient.source,
        sender: from,
        replyTo,
        subject: email.subject,
        template: VENDOR_ORDER_EMAIL_TEMPLATE.id,
        templateVersion: VENDOR_ORDER_EMAIL_TEMPLATE.version,
        lineCount: context.lines.length,
        artifactFingerprint: await artifactFingerprint([
          email.subject,
          email.text,
          email.html,
        ]),
      });
      return { status: "sent", emailId, to: maskEmail(recipient.email) };
    } catch (cause) {
      const { kind, remedy } = classifyReminderFailure(cause);
      const vendorRemedy =
        kind === "no_recipient"
          ? NO_RECIPIENT_REMEDY
          : kind === "refused"
            ? REFUSED_REMEDY
            : remedy;
      await record(VENDOR_ORDER_EMAIL_EVENT.failed, {
        message: safeProviderMessage(cause),
        failureKind: kind,
        remedy: vendorRemedy,
        retryScheduled: false,
        recipientMasked: context.recipient
          ? maskEmail(context.recipient.email)
          : null,
      });
      throw new ConvexError(vendorRemedy);
    }
  },
});

/** Every "Email the order" try, newest first: who it went to, or why not. */
export const getHistory = action({
  args: { vendorOrderId: v.id("vendorOrders") },
  handler: async (ctx, args): Promise<ReminderHistoryItem[]> => {
    const visible = await ctx.runQuery(api.queries.getVendorOrder, {
      id: args.vendorOrderId,
    });
    if (!visible) {
      throw new ConvexError(
        "Capsule could not find this order. It may have been removed, or your role cannot open it. Ask a manager.",
      );
    }
    const ledger = await ctx.runQuery(internal.vendorOrderEmail.loadHistory, {
      vendorOrderId: args.vendorOrderId,
      tenantId: visible.tenantId,
    });
    return documentEmailHistory(ledger, VENDOR_ORDER_EMAIL_EVENT, "Order").map(
      (item) =>
        item.outcome === "failed"
          ? { ...item, remedy: failedRemedy(ledger, item.at) ?? item.remedy }
          : item,
    );
  },
});

/** The vendor wording saved with a failed try (the shared list words name the client). */
function failedRemedy(ledger: LedgerRow[], at: number): string | null {
  const row = ledger.find(
    (entry) =>
      entry.createdAt === at && entry.type === VENDOR_ORDER_EMAIL_EVENT.failed,
  );
  return typeof row?.payload.remedy === "string" ? row.payload.remedy : null;
}

export const loadHistory = internalQuery({
  args: { vendorOrderId: v.id("vendorOrders"), tenantId: v.string() },
  handler: async (ctx, args): Promise<LedgerRow[]> =>
    loadLedger(ctx, String(args.vendorOrderId), args.tenantId),
});
