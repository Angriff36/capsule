import type { EventBundle } from "../lib/tppReports/eventBundle";
import { toEpochMillis } from "../lib/tppReports/reportValues";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import { centsToDollars, type PlannedStep } from "./CapsuleEventBundleShared";

/**
 * The invoice for a TPP bundle: issued with its deposit, sent when the client
 * signed, and every payment the proposal lists recorded and settled (which
 * applies it to the invoice by reaction). Pure: decides calls, makes none.
 */

export interface BillingMoney {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
}

function paymentMethod(
  method: string | undefined,
): "card" | "check" | "cash" | "ach" | "other" {
  const text = (method ?? "").toLowerCase();
  if (/visa|master|amex|americanexpress|discover|card|credit/.test(text)) {
    return "card";
  }
  if (/check|cheque/.test(text)) return "check";
  if (/cash/.test(text)) return "cash";
  if (/ach|wire|bank|transfer/.test(text)) return "ach";
  return "other";
}

function dateEpoch(date: string | undefined): number | undefined {
  return date === undefined ? undefined : toEpochMillis(date, 0);
}

export function planBillingSteps(input: {
  bundle: EventBundle;
  invoice: string;
  money: BillingMoney;
  statusNote: string | undefined;
  signed: boolean;
  context: CapsuleEventBundleContext;
}): {
  steps: PlannedStep[];
  seedIds: Record<string, string>;
  payments: number;
} {
  const { bundle, invoice, money, statusNote, signed, context } = input;
  const totals = bundle.totals;
  const steps: PlannedStep[] = [];
  const seedIds: Record<string, string> = {};
  const counts = { payments: 0 };

  const knownInvoice = context.directory?.invoices.find(
    (row) => row.invoiceNumber === invoice,
  );
  if (knownInvoice) seedIds.invoice = knownInvoice.id;
  const existingPayments = knownInvoice
    ? (context.directory?.payments ?? []).filter(
        (row) => row.invoiceId === knownInvoice.id && row.status !== "failed",
      )
    : [];
  const paymentRefs: string[] = [];
  if (!knownInvoice) {
    steps.push({
      capabilityId: "Invoice.issue",
      ref: "invoice",
      label: `Issue invoice ${invoice}`,
      idempotencySuffix: `invoice:${invoice}`,
      resolveRefs: ["clientId", "eventId"],
      args: {
        clientId: "client",
        eventId: "event",
        invoiceNumber: invoice,
        ...money,
        dueDate: dateEpoch(totals.finalBalanceDueDate),
        notes: [
          `Imported from the TPP proposal for invoice ${invoice}.`,
          totals.depositCents !== undefined
            ? `Deposit $${centsToDollars(totals.depositCents).toFixed(2)}${totals.depositDueDate ? ` due ${totals.depositDueDate}` : ""}.`
            : undefined,
          statusNote,
        ]
          .filter(Boolean)
          .join(" "),
      },
    });
    if (totals.depositCents !== undefined && totals.depositCents > 0) {
      steps.push({
        capabilityId: "Invoice.setDeposit",
        ref: "invoice-deposit",
        label: "Set the deposit on the invoice",
        idempotencySuffix: `invoice-deposit:${invoice}`,
        resolveRefs: ["docId"],
        args: {
          docId: "invoice",
          depositAmount: centsToDollars(totals.depositCents),
        },
      });
    }
  }
  const matchedPayments = new Set<string>();
  bundle.payments.forEach((payment, index) => {
    if (payment.amountCents === undefined || payment.amountCents <= 0) {
      return;
    }
    const already = existingPayments.find(
      (row) =>
        !matchedPayments.has(row.id) && row.amountCents === payment.amountCents,
    );
    if (already) {
      matchedPayments.add(already.id);
      if (already.status === "pending" || already.status === "processing") {
        seedIds[`payment:${index}`] = already.id;
        paymentRefs.push(`payment:${index}`);
      }
      return;
    }
    counts.payments += 1;
    paymentRefs.push(`payment:${index}`);
    {
      steps.push({
        capabilityId: "Payment.record",
        ref: `payment:${index}`,
        label: `Record payment of $${centsToDollars(payment.amountCents).toFixed(2)}${payment.date ? ` on ${payment.date}` : ""}`,
        idempotencySuffix: `payment:${invoice}:${index}:${payment.amountCents}`,
        resolveRefs: ["invoiceId", "clientId", "eventId"],
        args: {
          invoiceId: "invoice",
          clientId: "client",
          eventId: "event",
          amount: centsToDollars(payment.amountCents),
          method: paymentMethod(payment.method),
          notes: [payment.date, payment.method, payment.reference, payment.note]
            .filter(Boolean)
            .join(" · "),
        },
      });
    }
  });

  // Payments settle onto a sent invoice (Payment.settle applies by reaction).
  const invoiceStatus = knownInvoice?.status ?? "draft";
  if (invoiceStatus === "draft" && (signed || paymentRefs.length > 0)) {
    steps.push({
      capabilityId: "Invoice.send",
      ref: "invoice-sent",
      label: `Mark invoice ${invoice} sent`,
      idempotencySuffix: `invoice-send:${invoice}`,
      resolveRefs: ["docId"],
      args: { docId: "invoice" },
    });
  }
  for (const ref of paymentRefs) {
    steps.push({
      capabilityId: "Payment.settle",
      ref: `${ref}:settled`,
      label: `Settle ${ref.replace("payment:", "payment #")}`,
      idempotencySuffix: `settle:${invoice}:${ref}`,
      resolveRefs: ["docId"],
      args: { docId: ref },
    });
  }

  return { steps, seedIds, payments: counts.payments };
}
