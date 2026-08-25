import {
  InvoiceMarkOverdueLifecycle,
  InvoiceMarkViewedLifecycle,
  InvoiceMarkVoidedLifecycle,
  InvoiceSendLifecycle,
  InvoiceWriteOffLifecycle,
  PaymentBeginProcessingLifecycle,
  PaymentFailLifecycle,
  PaymentRefundLifecycle,
  PaymentSettleLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface CommercialAction<Key extends string = string> {
  key: Key;
  label: string;
}

/** Money context the send action needs beyond the lifecycle status. */
export interface InvoiceBalanceContext {
  amountDue?: unknown;
}

// Mirrors the Invoice.send manifest constraint `sendBalance`
// ("Cannot send an invoice with zero balance"): a $0-due invoice is never
// sendable, so the UI must not offer send on it even when the lifecycle
// (draft → sent) would otherwise allow the transition.
const hasBalanceDue = (invoice: InvoiceBalanceContext): boolean =>
  Number(invoice.amountDue ?? 0) > 0;

type Lifecycle = readonly {
  property: string;
  from: string;
  to: string;
  proven: boolean;
}[];

function available<Key extends string>(
  status: string,
  actions: readonly (CommercialAction<Key> & { lifecycle: Lifecycle })[],
): CommercialAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const INVOICE_ACTIONS = [
  { key: "send", label: "Send", lifecycle: InvoiceSendLifecycle },
  {
    key: "markViewed",
    label: "Mark viewed",
    lifecycle: InvoiceMarkViewedLifecycle,
  },
  {
    key: "markOverdue",
    label: "Mark overdue",
    lifecycle: InvoiceMarkOverdueLifecycle,
  },
  { key: "void", label: "Void", lifecycle: InvoiceMarkVoidedLifecycle },
  { key: "writeOff", label: "Write off", lifecycle: InvoiceWriteOffLifecycle },
] as const;

const PAYMENT_ACTIONS = [
  {
    key: "beginProcessing",
    label: "Begin processing",
    lifecycle: PaymentBeginProcessingLifecycle,
  },
  { key: "settle", label: "Settle", lifecycle: PaymentSettleLifecycle },
  { key: "fail", label: "Mark failed", lifecycle: PaymentFailLifecycle },
  { key: "refund", label: "Refund", lifecycle: PaymentRefundLifecycle },
] as const;

export class CommercialLifecyclePolicy {
  invoiceActions(status: string, invoice: InvoiceBalanceContext) {
    const actions = available(status, INVOICE_ACTIONS);
    if (hasBalanceDue(invoice)) return actions;
    return actions.filter((action) => action.key !== "send");
  }

  paymentActions(status: string) {
    return available(status, PAYMENT_ACTIONS);
  }
}
