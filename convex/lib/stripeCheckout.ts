/**
 * AUTHOR SEAM — Stripe Checkout calls shared by staff payment links, invoice
 * reminders and the client portal (PL-CLIENT-PAYMENT, AC-102).
 *
 * Every call runs on the tenant's connected account (issue #112), charges in
 * the invoice's own currency, and reads back one honest outcome per session.
 */
import type { Doc } from "../_generated/dataModel";

// Stripe charges these currencies in whole units, not cents.
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

export type CheckoutOutcome = "succeeded" | "pending" | "failed";

export interface CheckoutSessionView {
  outcome: CheckoutOutcome;
  /** Paid amount in the invoice currency's main unit (dollars, not cents). */
  amount: number;
  method: "card" | "ach" | "other";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The invoice's three-letter currency, lower case for Stripe. USD when unset. */
export function invoiceCheckoutCurrency(
  invoice: Pick<Doc<"invoices">, "currencyCode">,
): string {
  const code = invoice.currencyCode?.trim() ?? "";
  return code.length === 3 ? code.toLowerCase() : "usd";
}

export function toStripeAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency)
    ? Math.round(amount)
    : Math.round(amount * 100);
}

export function fromStripeAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? amount : amount / 100;
}

export function connectedAccountHeaders(
  stripeSecretKey: string,
  connectedAccountId: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${stripeSecretKey}`,
    "Stripe-Account": connectedAccountId,
  };
}

export interface CreateCheckoutInput {
  stripeSecretKey: string;
  connectedAccountId: string;
  invoice: Doc<"invoices">;
  amount: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
  customerEmail?: string;
}

/** Creates one Checkout session. The same idempotency key returns the same session. */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<{ sessionId: string; url: string }> {
  const currency = invoiceCheckoutCurrency(input.invoice);
  const unitAmount = toStripeAmount(input.amount, currency);
  if (unitAmount <= 0) throw new Error("Invoice has no payable balance.");
  const body = new URLSearchParams({
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: String(input.invoice._id),
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(unitAmount),
    "line_items[0][price_data][product_data][name]": input.productName,
    "line_items[0][quantity]": "1",
    "payment_intent_data[metadata][invoiceId]": String(input.invoice._id),
    "payment_intent_data[metadata][tenantId]": input.invoice.tenantId,
  });
  if (input.customerEmail) {
    body.set("customer_email", input.customerEmail);
    body.set("payment_intent_data[receipt_email]", input.customerEmail);
  }
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      ...connectedAccountHeaders(
        input.stripeSecretKey,
        input.connectedAccountId,
      ),
      "Content-Type": "application/x-www-form-urlencoded",
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
    },
    body,
  });
  const responseBody = asRecord(await response.json().catch(() => null));
  if (!response.ok) {
    const error = asRecord(responseBody.error);
    throw new Error(
      stringValue(error.message) ||
        `Stripe payment link setup failed (${response.status}).`,
    );
  }
  const sessionId = stringValue(responseBody.id);
  const url = stringValue(responseBody.url);
  if (!sessionId || !url) {
    throw new Error("Stripe did not return a payment link.");
  }
  return { sessionId, url };
}

/** Reads a Checkout session. Null when Stripe does not know it. */
export async function fetchCheckoutSession(
  sessionId: string,
  stripeSecretKey: string,
  connectedAccountId: string,
): Promise<Record<string, unknown> | null> {
  const query = new URLSearchParams({
    "expand[]": "payment_intent.payment_method",
  });
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?${query}`,
    { headers: connectedAccountHeaders(stripeSecretKey, connectedAccountId) },
  );
  if (response.status === 404) return null;
  const body = asRecord(await response.json().catch(() => null));
  if (!response.ok) {
    const error = asRecord(body.error);
    throw new Error(
      stringValue(error.message) ||
        `Stripe session lookup failed (${response.status}).`,
    );
  }
  return body;
}

function paymentMethodKind(
  session: Record<string, unknown>,
): CheckoutSessionView["method"] {
  const paymentIntent = asRecord(session.payment_intent);
  const paymentMethod = asRecord(paymentIntent.payment_method);
  const type = stringValue(paymentMethod.type);
  if (type === "card") return "card";
  if (type === "us_bank_account" || type === "customer_balance") return "ach";
  return type ? "other" : "card";
}

/**
 * One honest outcome for a session:
 * - succeeded: Stripe says the money is paid;
 * - failed: the session expired, or the bank payment was turned down;
 * - pending: the client has not finished, or a bank payment is still clearing.
 */
export function readCheckoutSession(
  session: Record<string, unknown> | null,
): CheckoutSessionView {
  if (!session) return { outcome: "failed", amount: 0, method: "card" };
  const method = paymentMethodKind(session);
  if (session.payment_status === "paid") {
    const currency = stringValue(session.currency)?.toLowerCase() ?? "usd";
    const total = Number(session.amount_total);
    if (!Number.isFinite(total) || total <= 0) {
      throw new Error("Stripe reported a paid session without an amount.");
    }
    return {
      outcome: "succeeded",
      amount: fromStripeAmount(total, currency),
      method,
    };
  }
  if (session.status === "expired") {
    return { outcome: "failed", amount: 0, method };
  }
  // A finished session whose bank payment was later turned down. An open
  // session also shows requires_payment_method before the client pays.
  const intentStatus = stringValue(asRecord(session.payment_intent).status);
  if (
    session.status === "complete" &&
    (intentStatus === "canceled" || intentStatus === "requires_payment_method")
  ) {
    return { outcome: "failed", amount: 0, method };
  }
  return { outcome: "pending", amount: 0, method };
}
