import { useAction } from "convex/react";
import { useCallback } from "react";
import { api, type Id } from "./api";

export type InvoicePaymentLink = {
  sessionId: string;
  url: string;
  createdAt: number;
  amount: number;
};

export type InvoiceStripeSyncResult = {
  checked: number;
  recorded: number;
  recordedAmount: number;
  failures: string[];
};

/** Authored Stripe payment-link action hooks kept outside finance components.
 * Payment/invoice state changes still flow through generated Manifest commands. */
export function useInvoicePaymentActions() {
  const getPaymentLinkAction = useAction(api.invoicePayments.getPaymentLink);
  const createPaymentLinkAction = useAction(
    api.invoicePayments.createPaymentLink,
  );
  const syncStripePaymentsAction = useAction(
    api.invoicePayments.syncStripePayments,
  );

  const getPaymentLink = useCallback(
    (invoiceId: string): Promise<InvoicePaymentLink | null> =>
      getPaymentLinkAction({ invoiceId: invoiceId as Id<"invoices"> }),
    [getPaymentLinkAction],
  );
  const createPaymentLink = useCallback(
    (invoiceId: string): Promise<InvoicePaymentLink> =>
      createPaymentLinkAction({ invoiceId: invoiceId as Id<"invoices"> }),
    [createPaymentLinkAction],
  );
  const syncStripePayments = useCallback(
    (invoiceId: string): Promise<InvoiceStripeSyncResult> =>
      syncStripePaymentsAction({ invoiceId: invoiceId as Id<"invoices"> }),
    [syncStripePaymentsAction],
  );

  return {
    getPaymentLink,
    createPaymentLink,
    syncStripePayments,
  };
}
