import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import {
  buildInvoiceReminderPdf,
  invoiceReminderPdfFileName,
} from "./lib/invoiceReminderPdf";
import { renderInvoiceReminderEmail } from "../src/lib/invoiceReminderEmail";
import {
  normalizeInvoiceReminderOffsets,
  reminderOffsetLabel,
  reminderScheduledAt,
} from "../src/lib/invoiceReminderSchedule";

const OPEN_INVOICE_STATUSES = new Set(["sent", "viewed", "overdue", "partial"]);
const RETRY_DELAYS_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;

const EVENT = {
  scheduleConfigured: "InvoiceReminderScheduleConfigured",
  paymentLinkPrepared: "InvoiceReminderPaymentLinkPrepared",
  delivered: "InvoiceReminderDelivered",
  suppressed: "InvoiceReminderSuppressed",
  failed: "InvoiceReminderDeliveryFailed",
} as const;

type ReminderEventType = (typeof EVENT)[keyof typeof EVENT];

interface ProviderEnvironment {
  resendApiKey: string;
  fromEmail: string;
  stripeSecretKey: string;
  appOrigin: string;
}

interface ScheduleRecord {
  configId: string;
  configuredAt: number;
  dueDate: number;
  offsetsDays: number[];
}

interface LedgerEvent {
  type: string;
  createdAt: number;
  payload: Record<string, unknown>;
}

interface PaymentSessionRecord {
  configId: string;
  offsetDays: number;
  sessionId: string;
  url: string;
  createdAt: number;
}

interface DeliveryContext {
  invoice: Doc<"invoices">;
  recipient: { email: string; name: string } | null;
  organization: {
    displayName: string;
    address: string | null;
    primaryColor: string | null;
    accentColor: string | null;
  };
  eventTitle: string | null;
  ledger: LedgerEvent[];
}

interface DeliveryAttempt {
  invoiceId: Id<"invoices">;
  tenantId: string;
  configId: string;
  offsetDays: number;
  scheduledFor: number;
  source: "scheduled" | "manual";
}

interface DeliveryResult {
  status: "delivered" | "suppressed" | "already_delivered";
  reason?: string;
  emailId?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scheduleFromEvent(
  event: LedgerEvent | undefined,
): ScheduleRecord | null {
  if (!event) return null;
  const payload = event.payload;
  const configId = stringValue(payload.configId);
  const configuredAt = numberValue(payload.configuredAt);
  const dueDate = numberValue(payload.dueDate);
  const rawOffsets = Array.isArray(payload.offsetsDays)
    ? payload.offsetsDays.filter(
        (value): value is number => typeof value === "number",
      )
    : [];
  if (!configId || configuredAt == null || dueDate == null) return null;
  try {
    return {
      configId,
      configuredAt,
      dueDate,
      offsetsDays: normalizeInvoiceReminderOffsets(rawOffsets),
    };
  } catch {
    return null;
  }
}

function latestSchedule(ledger: LedgerEvent[]): ScheduleRecord | null {
  return scheduleFromEvent(
    ledger
      .filter((event) => event.type === EVENT.scheduleConfigured)
      .sort((left, right) => right.createdAt - left.createdAt)[0],
  );
}

function paymentSessions(ledger: LedgerEvent[]): PaymentSessionRecord[] {
  return ledger
    .filter((event) => event.type === EVENT.paymentLinkPrepared)
    .map((event) => {
      const configId = stringValue(event.payload.configId);
      const offsetDays = numberValue(event.payload.offsetDays);
      const sessionId = stringValue(event.payload.sessionId);
      const url = stringValue(event.payload.url);
      return configId && offsetDays != null && sessionId && url
        ? { configId, offsetDays, sessionId, url, createdAt: event.createdAt }
        : null;
    })
    .filter((session): session is PaymentSessionRecord => session !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
}

function wasDelivered(
  ledger: LedgerEvent[],
  configId: string,
  offsetDays: number,
): boolean {
  return ledger.some(
    (event) =>
      event.type === EVENT.delivered &&
      event.payload.configId === configId &&
      event.payload.offsetDays === offsetDays,
  );
}

async function decryptField(
  ctx: QueryCtx,
  entity: string,
  property: string,
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  try {
    const envelope = asRecord(JSON.parse(value));
    if (
      envelope.v === 1 &&
      typeof envelope.kid === "string" &&
      typeof envelope.ct === "string"
    ) {
      return await decrypt(envelope.ct, envelope.kid, {
        ctx,
        entity,
        property,
      });
    }
  } catch {
    // Legacy plaintext fields stay readable during encryption migrations.
  }
  return value;
}

function clientName(client: Doc<"clients"> | null): string {
  if (!client) return "Client";
  if (client.clientType === "company" && client.companyName?.trim()) {
    return client.companyName.trim();
  }
  return (
    [client.givenName, client.familyName]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
      .trim() ||
    client.companyName?.trim() ||
    "Client"
  );
}

function contactName(contact: Doc<"clientContacts">): string {
  return (
    [contact.givenName, contact.familyName]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
      .trim() || "Client"
  );
}

function requireProviderEnvironment(): ProviderEnvironment {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.INVOICE_REMINDER_FROM_EMAIL?.trim();
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const rawOrigin = process.env.CAPSULE_PUBLIC_APP_URL?.trim();
  if (!resendApiKey || !fromEmail || !stripeSecretKey || !rawOrigin) {
    throw new ConvexError(
      "Invoice reminders need RESEND_API_KEY, INVOICE_REMINDER_FROM_EMAIL, STRIPE_SECRET_KEY, and CAPSULE_PUBLIC_APP_URL in the Convex environment.",
    );
  }
  let appOrigin: string;
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
    appOrigin = parsed.origin;
  } catch {
    throw new ConvexError(
      "CAPSULE_PUBLIC_APP_URL must be a valid HTTP(S) application origin.",
    );
  }
  return { resendApiKey, fromEmail, stripeSecretKey, appOrigin };
}

function safeProviderMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message
    .replace(/[\r\n]+/gu, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted-email]")
    .slice(0, 500);
}

function assertOpenInvoice(invoice: Doc<"invoices">): void {
  if (
    invoice.deletedAt != null ||
    !OPEN_INVOICE_STATUSES.has(String(invoice.status)) ||
    Number(invoice.amountDue) <= 0 ||
    invoice.paidAt != null
  ) {
    throw new ConvexError(
      "Payment reminders are available only for a sent invoice with a balance due.",
    );
  }
}

export const loadDeliveryContext = internalQuery({
  args: { invoiceId: v.id("invoices"), tenantId: v.string() },
  handler: async (ctx, args): Promise<DeliveryContext | null> => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.tenantId !== args.tenantId) return null;

    const [client, contacts, organizations, ledgerRows, linkedEvent] =
      await Promise.all([
        ctx.db.get(invoice.clientId),
        ctx.db
          .query("clientContacts")
          .withIndex("by_clientId", (q) => q.eq("clientId", invoice.clientId))
          .collect(),
        ctx.db
          .query("organizations")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
          .collect(),
        ctx.db
          .query("manifestEvents")
          .withIndex("by_entityId", (q) =>
            q.eq("entityId", String(invoice._id)),
          )
          .collect(),
        invoice.eventId ? ctx.db.get(invoice.eventId) : Promise.resolve(null),
      ]);

    const eligibleContacts = contacts.filter(
      (contact) =>
        contact.tenantId === args.tenantId &&
        contact.deletedAt == null &&
        contact.status === "active" &&
        Boolean(contact.email),
    );
    const preferredContact =
      eligibleContacts.find((contact) => contact.isBillingContact) ??
      eligibleContacts.find((contact) => contact.isPrimary) ??
      eligibleContacts[0];
    const contactEmail = preferredContact
      ? await decryptField(
          ctx,
          "ClientContact",
          "email",
          preferredContact.email,
        )
      : null;
    const accountEmail = client
      ? await decryptField(ctx, "Client", "email", client.email)
      : null;
    const recipientEmail = contactEmail?.trim() || accountEmail?.trim() || null;
    const organization =
      organizations.find(
        (row) => row.deletedAt == null && row.status === "active",
      ) ?? organizations.find((row) => row.deletedAt == null);

    return {
      invoice,
      recipient: recipientEmail
        ? {
            email: recipientEmail,
            name: preferredContact
              ? contactName(preferredContact)
              : clientName(client),
          }
        : null,
      organization: {
        displayName:
          organization?.brandDisplayName?.trim() ||
          organization?.name.trim() ||
          "Catering company",
        address: organization?.brandAddress?.trim() || null,
        primaryColor: organization?.brandPrimaryColor ?? null,
        accentColor: organization?.brandAccentColor ?? null,
      },
      eventTitle:
        linkedEvent && linkedEvent.tenantId === args.tenantId
          ? linkedEvent.title?.trim() || null
          : null,
      ledger: ledgerRows
        .filter(
          (row) =>
            row.entity === "Invoice" &&
            asRecord(row.payload).tenantId === args.tenantId,
        )
        .map((row) => ({
          type: row.type,
          createdAt: row.createdAt,
          payload: asRecord(row.payload),
        })),
    };
  },
});

export const recordEvent = internalMutation({
  args: {
    type: v.union(
      v.literal(EVENT.scheduleConfigured),
      v.literal(EVENT.paymentLinkPrepared),
      v.literal(EVENT.delivered),
      v.literal(EVENT.suppressed),
      v.literal(EVENT.failed),
    ),
    invoiceId: v.id("invoices"),
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("manifestEvents", {
      type: args.type,
      entity: "Invoice",
      entityId: String(args.invoiceId),
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

export const applySchedule = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    tenantId: v.string(),
    configId: v.string(),
    configuredAt: v.number(),
    dueDate: v.number(),
    offsetsDays: v.array(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("manifestEvents", {
      type: EVENT.scheduleConfigured,
      entity: "Invoice",
      entityId: String(args.invoiceId),
      payload: {
        tenantId: args.tenantId,
        configId: args.configId,
        configuredAt: args.configuredAt,
        dueDate: args.dueDate,
        offsetsDays: args.offsetsDays,
      },
      createdAt: args.configuredAt,
    });

    const checkpoints = args.offsetsDays.map((offsetDays) => ({
      offsetDays,
      scheduledFor: reminderScheduledAt(args.dueDate, offsetDays),
    }));
    const future = checkpoints.filter(
      (checkpoint) => checkpoint.scheduledFor > args.configuredAt,
    );
    const mostRecentMissed = checkpoints
      .filter((checkpoint) => checkpoint.scheduledFor <= args.configuredAt)
      .sort((left, right) => right.scheduledFor - left.scheduledFor)[0];
    const jobs = mostRecentMissed ? [mostRecentMissed, ...future] : future;

    await Promise.all(
      jobs.map(async ({ offsetDays, scheduledFor }) => {
        await ctx.scheduler.runAt(
          Math.max(scheduledFor, args.configuredAt + 1_000),
          internal.invoiceReminders.deliverScheduled,
          {
            invoiceId: args.invoiceId,
            tenantId: args.tenantId,
            configId: args.configId,
            offsetDays,
            scheduledFor,
            attempt: 0,
          },
        );
      }),
    );
  },
});

export const getSchedule = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<ScheduleRecord | null> => {
    const invoice = await ctx.runQuery(api.queries.getInvoice, {
      id: args.invoiceId,
    });
    if (!invoice) {
      throw new ConvexError(
        "Invoice unavailable. Check your workspace access.",
      );
    }
    const context = await ctx.runQuery(
      internal.invoiceReminders.loadDeliveryContext,
      { invoiceId: args.invoiceId, tenantId: invoice.tenantId },
    );
    return context ? latestSchedule(context.ledger) : null;
  },
});

export const configureSchedule = action({
  args: {
    invoiceId: v.id("invoices"),
    offsetsDays: v.array(v.number()),
  },
  handler: async (ctx, args): Promise<ScheduleRecord> => {
    requireProviderEnvironment();
    const invoice = await ctx.runQuery(api.queries.getInvoice, {
      id: args.invoiceId,
    });
    if (!invoice) {
      throw new ConvexError(
        "Invoice unavailable. Check your workspace access.",
      );
    }
    assertOpenInvoice(invoice);
    if (invoice.dueDate == null) {
      throw new ConvexError(
        "Add an invoice due date before enabling automatic reminders.",
      );
    }
    const context = await ctx.runQuery(
      internal.invoiceReminders.loadDeliveryContext,
      { invoiceId: args.invoiceId, tenantId: invoice.tenantId },
    );
    if (!context?.recipient) {
      throw new ConvexError(
        "Add an email to the client account or an active billing contact before enabling reminders.",
      );
    }

    const offsetsDays = normalizeInvoiceReminderOffsets(args.offsetsDays);
    const schedule: ScheduleRecord = {
      configId: crypto.randomUUID(),
      configuredAt: Date.now(),
      dueDate: Number(invoice.dueDate),
      offsetsDays,
    };
    await ctx.runMutation(internal.invoiceReminders.applySchedule, {
      invoiceId: args.invoiceId,
      tenantId: invoice.tenantId,
      ...schedule,
    });
    return schedule;
  },
});

function assertScheduledAttemptCurrent(
  context: DeliveryContext,
  attempt: DeliveryAttempt,
): DeliveryResult | null {
  const schedule = latestSchedule(context.ledger);
  if (!schedule || schedule.configId !== attempt.configId) {
    return { status: "suppressed", reason: "schedule_replaced" };
  }
  if (
    Number(context.invoice.dueDate) !== schedule.dueDate ||
    !schedule.offsetsDays.includes(attempt.offsetDays) ||
    reminderScheduledAt(schedule.dueDate, attempt.offsetDays) !==
      attempt.scheduledFor
  ) {
    return { status: "suppressed", reason: "schedule_changed" };
  }
  return null;
}

async function stripeSessionPaid(
  sessionId: string,
  stripeSecretKey: string,
): Promise<boolean> {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    const body = asRecord(await response.json().catch(() => null));
    const error = asRecord(body.error);
    throw new Error(
      stringValue(error.message) ||
        `Stripe session lookup failed (${response.status}).`,
    );
  }
  const body = asRecord(await response.json());
  return body.payment_status === "paid";
}

async function createStripeSession(
  context: DeliveryContext,
  attempt: DeliveryAttempt,
  environment: ProviderEnvironment,
): Promise<{ sessionId: string; url: string }> {
  if (!context.recipient)
    throw new Error("Invoice recipient email is missing.");
  const invoiceNumber = String(
    context.invoice.invoiceNumber || context.invoice._id,
  );
  const amountCents = Math.round(Number(context.invoice.amountDue) * 100);
  if (amountCents <= 0) throw new Error("Invoice has no payable balance.");

  const returnUrl = new URL(environment.appOrigin);
  returnUrl.searchParams.set("invoice_payment", "success");
  const cancelUrl = new URL(environment.appOrigin);
  cancelUrl.searchParams.set("invoice_payment", "cancelled");
  const body = new URLSearchParams({
    mode: "payment",
    success_url: returnUrl.toString(),
    cancel_url: cancelUrl.toString(),
    customer_email: context.recipient.email,
    client_reference_id: String(context.invoice._id),
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": `Invoice ${invoiceNumber} balance`,
    "line_items[0][quantity]": "1",
    "payment_intent_data[receipt_email]": context.recipient.email,
    "payment_intent_data[metadata][invoiceId]": String(context.invoice._id),
    "payment_intent_data[metadata][tenantId]": context.invoice.tenantId,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `invoice-reminder/${context.invoice._id}/${attempt.configId}/${attempt.offsetDays}`,
    },
    body,
  });
  const responseBody = asRecord(await response.json().catch(() => null));
  if (!response.ok) {
    const error = asRecord(responseBody.error);
    throw new Error(
      stringValue(error.message) ||
        `Stripe Checkout setup failed (${response.status}).`,
    );
  }
  const sessionId = stringValue(responseBody.id);
  const url = stringValue(responseBody.url);
  if (!sessionId || !url) {
    throw new Error("Stripe Checkout did not return a payment link.");
  }
  return { sessionId, url };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function fromAddress(companyName: string, configuredFrom: string): string {
  if (configuredFrom.includes("<")) return configuredFrom;
  const safeName = companyName.replace(/[<>\r\n]/gu, "").trim();
  return `${safeName || "Catering company"} <${configuredFrom}>`;
}

async function sendReminderEmail(
  context: DeliveryContext,
  attempt: DeliveryAttempt,
  paymentUrl: string,
  environment: ProviderEnvironment,
): Promise<string> {
  if (!context.recipient || context.invoice.dueDate == null) {
    throw new Error("Invoice delivery details are incomplete.");
  }
  const invoiceNumber = String(
    context.invoice.invoiceNumber || context.invoice._id,
  );
  const email = renderInvoiceReminderEmail({
    companyName: context.organization.displayName,
    companyAddress: context.organization.address,
    primaryColor: context.organization.primaryColor,
    accentColor: context.organization.accentColor,
    clientName: context.recipient.name,
    invoiceNumber,
    amountDue: Number(context.invoice.amountDue),
    dueDate: Number(context.invoice.dueDate),
    offsetDays: attempt.offsetDays,
    paymentUrl,
  });
  const pdf = buildInvoiceReminderPdf({
    invoiceNumber,
    issuedAt: context.invoice.issuedAt,
    dueDate: Number(context.invoice.dueDate),
    subtotal: Number(context.invoice.subtotal),
    taxAmount: Number(context.invoice.taxAmount),
    discountAmount: Number(context.invoice.discountAmount),
    total: Number(context.invoice.total),
    amountPaid: Number(context.invoice.amountPaid),
    amountDue: Number(context.invoice.amountDue),
    clientName: context.recipient.name,
    clientEmail: context.recipient.email,
    eventTitle: context.eventTitle,
    companyName: context.organization.displayName,
    companyAddress: context.organization.address,
    primaryColor: context.organization.primaryColor,
    accentColor: context.organization.accentColor,
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `invoice-reminder/${context.invoice._id}/${attempt.configId}/${attempt.offsetDays}`,
    },
    body: JSON.stringify({
      from: fromAddress(
        context.organization.displayName,
        environment.fromEmail,
      ),
      to: [context.recipient.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [
        {
          filename: invoiceReminderPdfFileName(invoiceNumber),
          content: bytesToBase64(pdf),
        },
      ],
      tags: [
        { name: "category", value: "invoice_reminder" },
        { name: "invoice_id", value: String(context.invoice._id) },
      ],
    }),
  });
  const responseBody = asRecord(await response.json().catch(() => null));
  if (!response.ok) {
    throw new Error(
      stringValue(responseBody.message) ||
        `Reminder email delivery failed (${response.status}).`,
    );
  }
  const emailId = stringValue(responseBody.id);
  if (!emailId) throw new Error("Email provider did not return a delivery id.");
  return emailId;
}

async function recordReminderEvent(
  ctx: ActionCtx,
  type: ReminderEventType,
  attempt: DeliveryAttempt,
  payload: Record<string, unknown>,
): Promise<void> {
  await ctx.runMutation(internal.invoiceReminders.recordEvent, {
    type,
    invoiceId: attempt.invoiceId,
    payload: {
      tenantId: attempt.tenantId,
      configId: attempt.configId,
      offsetDays: attempt.offsetDays,
      scheduledFor: attempt.scheduledFor,
      source: attempt.source,
      ...payload,
    },
  });
}

async function deliverReminder(
  ctx: ActionCtx,
  attempt: DeliveryAttempt,
): Promise<DeliveryResult> {
  const environment = requireProviderEnvironment();
  const context = await ctx.runQuery(
    internal.invoiceReminders.loadDeliveryContext,
    { invoiceId: attempt.invoiceId, tenantId: attempt.tenantId },
  );
  if (!context) return { status: "suppressed", reason: "invoice_missing" };

  if (attempt.source === "scheduled") {
    const stale = assertScheduledAttemptCurrent(context, attempt);
    if (stale) return stale;
  }
  if (
    context.invoice.deletedAt != null ||
    context.invoice.paidAt != null ||
    Number(context.invoice.amountDue) <= 0 ||
    !OPEN_INVOICE_STATUSES.has(String(context.invoice.status))
  ) {
    return { status: "suppressed", reason: "invoice_not_payable" };
  }
  if (!context.recipient) {
    throw new Error(
      "No client account or active billing-contact email is available.",
    );
  }
  if (context.invoice.dueDate == null) {
    return { status: "suppressed", reason: "due_date_removed" };
  }
  if (wasDelivered(context.ledger, attempt.configId, attempt.offsetDays)) {
    return { status: "already_delivered" };
  }

  const sessions = paymentSessions(context.ledger);
  const uniqueSessionIds = [
    ...new Set(sessions.slice(0, 24).map((session) => session.sessionId)),
  ];
  for (const sessionId of uniqueSessionIds) {
    if (await stripeSessionPaid(sessionId, environment.stripeSecretKey)) {
      return { status: "suppressed", reason: "stripe_payment_received" };
    }
  }

  let currentSession = sessions.find(
    (session) =>
      session.configId === attempt.configId &&
      session.offsetDays === attempt.offsetDays,
  );
  if (!currentSession) {
    const created = await createStripeSession(context, attempt, environment);
    currentSession = {
      configId: attempt.configId,
      offsetDays: attempt.offsetDays,
      sessionId: created.sessionId,
      url: created.url,
      createdAt: Date.now(),
    };
    await recordReminderEvent(ctx, EVENT.paymentLinkPrepared, attempt, {
      sessionId: created.sessionId,
      url: created.url,
    });
  }

  const emailId = await sendReminderEmail(
    context,
    attempt,
    currentSession.url,
    environment,
  );
  await recordReminderEvent(ctx, EVENT.delivered, attempt, {
    emailId,
    sessionId: currentSession.sessionId,
    amountDue: Number(context.invoice.amountDue),
    dueDate: Number(context.invoice.dueDate),
    timing: reminderOffsetLabel(attempt.offsetDays),
  });
  return { status: "delivered", emailId };
}

export const deliverScheduled = internalAction({
  args: {
    invoiceId: v.id("invoices"),
    tenantId: v.string(),
    configId: v.string(),
    offsetDays: v.number(),
    scheduledFor: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const deliveryAttempt: DeliveryAttempt = {
      invoiceId: args.invoiceId,
      tenantId: args.tenantId,
      configId: args.configId,
      offsetDays: args.offsetDays,
      scheduledFor: args.scheduledFor,
      source: "scheduled",
    };
    try {
      const result = await deliverReminder(ctx, deliveryAttempt);
      if (result.status === "suppressed" && result.reason) {
        await recordReminderEvent(ctx, EVENT.suppressed, deliveryAttempt, {
          reason: result.reason,
        });
      }
    } catch (cause) {
      const message = safeProviderMessage(cause);
      const retryDelay = RETRY_DELAYS_MS[args.attempt];
      await recordReminderEvent(ctx, EVENT.failed, deliveryAttempt, {
        attempt: args.attempt,
        message,
        retryScheduled: retryDelay != null,
      });
      if (retryDelay != null) {
        await ctx.scheduler.runAfter(
          retryDelay,
          internal.invoiceReminders.deliverScheduled,
          { ...args, attempt: args.attempt + 1 },
        );
      }
    }
  },
});

export const sendNow = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<DeliveryResult> => {
    requireProviderEnvironment();
    const auth = await getAuthContext(ctx);
    const invoice = await ctx.runQuery(api.queries.getInvoice, {
      id: args.invoiceId,
    });
    if (!invoice || !auth.tenantId || auth.tenantId !== invoice.tenantId) {
      throw new ConvexError(
        "Invoice unavailable. Check your workspace access.",
      );
    }
    assertOpenInvoice(invoice);
    const attempt: DeliveryAttempt = {
      invoiceId: args.invoiceId,
      tenantId: invoice.tenantId,
      configId: `manual-${crypto.randomUUID()}`,
      offsetDays:
        invoice.dueDate == null
          ? 0
          : Math.trunc((Number(invoice.dueDate) - Date.now()) / 86_400_000),
      scheduledFor: Date.now(),
      source: "manual",
    };
    try {
      const result = await deliverReminder(ctx, attempt);
      if (result.status === "suppressed" && result.reason) {
        await recordReminderEvent(ctx, EVENT.suppressed, attempt, {
          reason: result.reason,
        });
      }
      return result;
    } catch (cause) {
      const message = safeProviderMessage(cause);
      await recordReminderEvent(ctx, EVENT.failed, attempt, {
        attempt: 0,
        message,
        retryScheduled: false,
      });
      throw new ConvexError(message);
    }
  },
});
