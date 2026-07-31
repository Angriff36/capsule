import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePayment,
  useListInvoice,
  useListPayment,
  useListPaymentMethod,
  usePaymentBeginProcessing,
  usePaymentFail,
  usePaymentRefund,
  usePaymentSettle,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { CommercialLifecyclePolicy } from "./CommercialLifecyclePolicy";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";

const policy = new CommercialLifecyclePolicy();

const money = (value: FormDataEntryValue | null) => {
  const amount = Number(String(value ?? "").trim());
  return Number.isFinite(amount) ? amount : Number.NaN;
};

export function PaymentsPage() {
  const payments = useListPayment();
  const invoices = useListInvoice();
  const paymentMethods = useListPaymentMethod();
  const createPayment = useCreatePayment();
  const beginProcessing = usePaymentBeginProcessing();
  const settle = usePaymentSettle();
  const fail = usePaymentFail();
  const refund = usePaymentRefund();
  const [showRecord, setShowRecord] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const payableInvoices = (invoices ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      ["sent", "viewed", "overdue", "partial"].includes(String(row.status)) &&
      Number(row.amountDue ?? 0) > 0,
  );
  const activeRows = (payments ?? []).filter((row) => row.deletedAt == null);
  const visibleRows = showTerminal
    ? activeRows
    : activeRows.filter(
        (row) =>
          !["completed", "failed", "refunded"].includes(String(row.status)),
      );

  const invoiceLabel = (id: string) => {
    const invoice = invoices?.find((row) => row._id === id);
    return invoice?.invoiceNumber || "Unknown invoice";
  };

  const selectedInvoice = invoices?.find(
    (row) => row._id === selectedInvoiceId,
  );
  const clientMethods = (paymentMethods ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.registeredAt != null &&
      String(row.status) === "active" &&
      selectedInvoice != null &&
      String(row.clientId) === String(selectedInvoice.clientId),
  );

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const invoiceId = String(data.get("invoiceId") || "").trim();
    const invoice = invoices?.find((row) => row._id === invoiceId);
    const amount = money(data.get("amount"));
    const paymentMethodId = String(data.get("paymentMethodId") || "").trim();
    const selectedMethod = paymentMethods?.find(
      (row) => row._id === paymentMethodId,
    );
    const method = (
      selectedMethod
        ? String(selectedMethod.methodType)
        : String(data.get("method") || "card")
    ) as "card" | "check" | "cash" | "ach" | "other";
    if (!invoice) {
      setFailure(new Error("Select a sent invoice with a balance due."));
      return;
    }
    if (!(amount > 0)) {
      setFailure(new Error("Payment amount must be positive."));
      return;
    }
    if (
      paymentMethodId &&
      (!selectedMethod ||
        String(selectedMethod.clientId) !== String(invoice.clientId) ||
        String(selectedMethod.status) !== "active")
    ) {
      setFailure(
        new Error("Select an active payment method for this invoice's client."),
      );
      return;
    }
    void run("record-payment", async () => {
      await createPayment({
        invoiceId,
        clientId: invoice.clientId,
        amount,
        method,
        eventId: invoice.eventId || undefined,
        paymentMethodId: paymentMethodId || undefined,
        notes: String(data.get("notes") || "").trim() || undefined,
      });
      form.reset();
      setSelectedInvoiceId("");
      setShowRecord(false);
      setNotice("Payment recorded. Settle it to apply the balance.");
    });
  };

  const invoke = (
    row: { _id: string; version: number; status: unknown },
    key: string,
  ) => {
    void (async () => {
      if (key === "fail") {
        const reason = await prompt.askReason({
          ...ReasonCopy.failPayment,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:${key}`, async () => {
          await fail({ docId: row._id, version: row.version, reason });
          setNotice("Payment marked failed.");
        });
        return;
      }
      if (key === "refund") {
        const reason = await prompt.askReason({
          ...ReasonCopy.refundPayment,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:${key}`, async () => {
          await refund({ docId: row._id, version: row.version, reason });
          setNotice("Payment refunded.");
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        const args = { docId: row._id, version: row.version };
        if (key === "beginProcessing") await beginProcessing(args);
        if (key === "settle") await settle(args);
        setNotice(
          key === "settle"
            ? "Payment settled. Invoice balance updated."
            : `Payment updated (${key}).`,
        );
      });
    })();
  };

  const loading =
    payments === undefined ||
    invoices === undefined ||
    paymentMethods === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Finance · Payments</p>
          <h1 className="display-title mt-2">Payment collection</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Record a payment against a sent invoice, then settle it so the
            invoice balance applies automatically.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
          >
            {showTerminal ? "Hide settled" : "Show settled"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowRecord((value) => !value)}
          >
            {showRecord ? "Close form" : "Record payment"}
          </button>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showRecord ? (
        <form className="supply-form" onSubmit={submitRecord}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Record</p>
              <h2>New payment</h2>
            </div>
          </div>
          {payableInvoices.length === 0 ? (
            <p className="text-base text-ink-2">
              No payable invoices.{" "}
              <Link className="text-link" to={FINANCE_ROUTES.invoices}>
                Issue and send an invoice
              </Link>{" "}
              first.
            </p>
          ) : (
            <>
              <label className="field-label">
                Invoice
                <select
                  className="input"
                  name="invoiceId"
                  required
                  value={selectedInvoiceId}
                  onChange={(event) => setSelectedInvoiceId(event.target.value)}
                >
                  <option value="" disabled>
                    Select invoice
                  </option>
                  {payableInvoices.map((invoice) => (
                    <option key={invoice._id} value={invoice._id}>
                      {invoice.invoiceNumber} · due{" "}
                      {formatMoneyExact(Number(invoice.amountDue ?? 0))}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Stored payment method
                <select
                  className="input"
                  name="paymentMethodId"
                  defaultValue=""
                >
                  <option value="">None — use method kind below</option>
                  {clientMethods.map((method) => (
                    <option key={method._id} value={method._id}>
                      {String(method.methodType)}
                      {method.lastFour ? ` ····${String(method.lastFour)}` : ""}
                      {method.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                {selectedInvoiceId && clientMethods.length === 0 ? (
                  <small className="text-ink-2">
                    No active methods for this client.{" "}
                    <Link
                      className="text-link"
                      to={FINANCE_ROUTES.paymentMethods}
                    >
                      Register one
                    </Link>
                    .
                  </small>
                ) : null}
              </label>
              <div className="supply-form-grid">
                <label className="field-label">
                  Amount
                  <input
                    className="input"
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <label className="field-label">
                  Method kind
                  <select className="input" name="method" defaultValue="card">
                    <option value="card">Card</option>
                    <option value="check">Check</option>
                    <option value="cash">Cash</option>
                    <option value="ach">ACH</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
              <label className="field-label">
                Notes
                <textarea className="input" name="notes" rows={2} />
              </label>
              <div className="supply-row-actions">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy != null}
                >
                  {busy === "record-payment" ? "Recording…" : "Record payment"}
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Collections</p>
            <h2>Payments</h2>
          </div>
          <span>{visibleRows.length} payments</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No open payments.</p>
            <span>Record a payment after an invoice is sent.</span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowRecord(true)}
              >
                Record payment
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Amount</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <Link
                        className="text-link"
                        to={FINANCE_ROUTES.invoiceDetail(String(row.invoiceId))}
                      >
                        <strong>{invoiceLabel(String(row.invoiceId))}</strong>
                      </Link>
                      <small>{String(row.method)}</small>
                    </td>
                    <td>{formatMoneyExact(Number(row.amount ?? 0))}</td>
                    <td>
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {policy
                          .paymentActions(String(row.status))
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => invoke(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
