import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

// PL-CLIENT-PAYMENT (AC-102): the client pays a deposit or the balance from
// the portal link. Stripe takes the card; this page only starts the checkout
// and, on return, asks the server what really happened. The balance shown is
// the live invoice, so it moves as soon as the payment is recorded.

export interface PortalPayableInvoice {
  _id: string;
  invoiceNumber?: string | null;
  amountPaid: number;
  amountDue: number;
  currencyCode?: string;
  payable?: { deposit: number | null; balance: number };
}

type PayPart = "deposit" | "balance";

type Notice =
  | { tone: "working"; text: string }
  | { tone: "ok"; text: string }
  | { tone: "wait"; text: string; recheck?: () => void }
  | { tone: "problem"; text: string };

function formatMoney(value: number, currencyCode = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format(value);
  }
}

function errorText(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "string" && data.trim()) return data;
  }
  return fallback;
}

export function ClientPortalPayments({
  token,
  invoices,
  online,
  companyName,
}: {
  token: string;
  invoices: PortalPayableInvoice[];
  online: boolean;
  companyName: string;
}) {
  const startPayment = useAction(api.clientPortalPayments.startPayment);
  const checkPayment = useAction(api.clientPortalPayments.checkPayment);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const checkedReturn = useRef(false);
  const starting = useRef(false);

  const payable = invoices.filter(
    (invoice) => (invoice.payable?.balance ?? 0) > 0,
  );

  // Back from Stripe: ask the server what happened to this checkout.
  useEffect(() => {
    if (checkedReturn.current) return;
    checkedReturn.current = true;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const invoiceId = params.get("invoice");
    const sessionId = params.get("session_id");
    if (payment === "cancelled") {
      setNotice({
        tone: "problem",
        text: "Payment cancelled. You were not charged.",
      });
      return;
    }
    if (payment !== "return" || !invoiceId || !sessionId) return;
    const check = async () => {
      setNotice({ tone: "working", text: "Checking your payment…" });
      try {
        const result = await checkPayment({ token, invoiceId, sessionId });
        const money = (value: number) =>
          formatMoney(value, result.currencyCode);
        if (result.outcome === "succeeded") {
          const extra =
            result.overpaid > 0
              ? ` You paid ${money(result.overpaid)} more than was owed; ${companyName} will refund it.`
              : "";
          setNotice({
            tone: "ok",
            text:
              result.amountDue > 0
                ? `Payment received, thank you. Still owed: ${money(result.amountDue)}.${extra}`
                : `Payment received, thank you. This invoice is paid in full.${extra}`,
          });
        } else if (result.outcome === "pending") {
          setNotice({
            tone: "wait",
            text: "Your payment is not finished yet. A bank payment can take a few days to clear. You don't need to pay again.",
            recheck: () => void check(),
          });
        } else {
          setNotice({
            tone: "problem",
            text: "This payment didn't go through, and you were not charged. You can try again.",
          });
        }
      } catch (error) {
        setNotice({
          tone: "wait",
          text: errorText(
            error,
            "We couldn't check your payment yet. Please try again in a moment.",
          ),
          recheck: () => void check(),
        });
      }
    };
    void check();
  }, [checkPayment, companyName, token]);

  if (payable.length === 0 && !notice) return null;

  const pay = async (invoiceId: string, part: PayPart) => {
    // Two taps in the same moment both see the old screen; the ref does not.
    if (starting.current) return;
    starting.current = true;
    const key = `${invoiceId}:${part}`;
    setBusy(key);
    setNotice(null);
    try {
      const result = await startPayment({ token, invoiceId, part });
      if (result.status === "checkout") {
        window.location.assign(result.url);
        return;
      }
      setNotice(
        result.status === "processing"
          ? {
              tone: "wait",
              text: "A bank payment for this invoice is still clearing. You don't need to pay again.",
            }
          : { tone: "ok", text: "Nothing is due on this invoice right now." },
      );
    } catch (error) {
      setNotice({
        tone: "problem",
        text: errorText(
          error,
          "We couldn't start the payment. Please try again.",
        ),
      });
    }
    starting.current = false;
    setBusy(null);
  };

  return (
    <section
      className="client-portal-documents client-portal-payments"
      aria-labelledby="payments-title"
    >
      <div className="client-portal-section-heading">
        <p>Payments</p>
        <h2 id="payments-title">Pay your deposit or balance</h2>
      </div>

      {payable.length > 0 ? (
        <div className="client-portal-document-grid">
          {payable.map((invoice) => {
            const currency = invoice.currencyCode ?? "USD";
            const deposit = invoice.payable?.deposit ?? null;
            const balance = invoice.payable?.balance ?? 0;
            return (
              <article
                key={invoice._id}
                className="client-portal-document-card"
                data-document-kind="invoice"
              >
                <div
                  className="client-portal-document-index"
                  aria-hidden="true"
                >
                  $
                </div>
                <div className="client-portal-document-copy">
                  <p>{`Invoice ${invoice.invoiceNumber || ""}`.trim()}</p>
                  <h3>{`${formatMoney(balance, currency)} owed`}</h3>
                  <strong>
                    {deposit != null
                      ? `Deposit due: ${formatMoney(deposit, currency)}`
                      : "No deposit due"}
                  </strong>
                  <span>{`Paid so far: ${formatMoney(invoice.amountPaid, currency)}`}</span>
                </div>
                {online ? (
                  <div className="client-portal-pay-actions">
                    {deposit != null ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void pay(invoice._id, "deposit")}
                      >
                        {busy === `${invoice._id}:deposit`
                          ? "Opening…"
                          : `Pay deposit ${formatMoney(deposit, currency)}`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void pay(invoice._id, "balance")}
                    >
                      {busy === `${invoice._id}:balance`
                        ? "Opening…"
                        : `Pay ${formatMoney(balance, currency)}`}
                    </button>
                  </div>
                ) : (
                  <p className="client-portal-pay-offline">
                    To pay, contact {companyName}.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : null}

      <div
        className="client-portal-download-status client-portal-pay-status"
        role="status"
        aria-live="polite"
        data-tone={notice?.tone}
      >
        {notice ? <span>{notice.text}</span> : null}
        {notice?.tone === "wait" && notice.recheck ? (
          <button type="button" onClick={notice.recheck}>
            Check again
          </button>
        ) : null}
      </div>
    </section>
  );
}
