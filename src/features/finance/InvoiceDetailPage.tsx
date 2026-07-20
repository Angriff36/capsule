import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useGetInvoice,
  useInvoiceMarkOverdue,
  useInvoiceMarkViewed,
  useInvoiceMarkVoided,
  useInvoiceSend,
  useInvoiceWriteOff,
  useListClient,
  useListPayment,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { ErrorState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { CommercialLifecyclePolicy } from "./CommercialLifecyclePolicy";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";

const policy = new CommercialLifecyclePolicy();

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useGetInvoice(id ?? "skip");
  const clients = useListClient();
  const payments = useListPayment();
  const send = useInvoiceSend();
  const markViewed = useInvoiceMarkViewed();
  const markOverdue = useInvoiceMarkOverdue();
  const markVoided = useInvoiceMarkVoided();
  const writeOff = useInvoiceWriteOff();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  if (!id) {
    return (
      <ErrorState
        title="Invoice not found"
        detail="The address is missing an invoice id."
      />
    );
  }

  if (
    invoice === undefined ||
    clients === undefined ||
    payments === undefined
  ) {
    return (
      <div className="operations-stage supply-stage">
        <FinanceWorkspaceNav />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (invoice === null) {
    return (
      <ErrorState
        title="Invoice not found"
        detail="This invoice is missing or belongs to another tenant."
      />
    );
  }

  const client = clients.find((row) => row._id === invoice.clientId);
  const relatedPayments = payments.filter(
    (row) => row.deletedAt == null && row.invoiceId === invoice._id,
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

  const invoke = (key: string) => {
    void (async () => {
      if (key === "void") {
        const reason = await prompt.askReason({
          ...ReasonCopy.voidInvoice,
          tone: "danger",
        });
        if (!reason) return;
        void run(key, async () => {
          await markVoided({
            docId: invoice._id,
            version: invoice.version,
            reason,
          });
          setNotice("Invoice voided.");
        });
        return;
      }
      if (key === "writeOff") {
        const reason = await prompt.askReason({
          ...ReasonCopy.writeOffInvoice,
          tone: "danger",
        });
        if (!reason) return;
        const writeOffAmount = Number(invoice.amountDue ?? 0);
        if (!(writeOffAmount > 0)) {
          setFailure(new Error("Nothing remains due to write off."));
          return;
        }
        void run(key, async () => {
          await writeOff({
            docId: invoice._id,
            version: invoice.version,
            reason,
            writeOffAmount,
          });
          setNotice("Invoice written off.");
        });
        return;
      }
      void run(key, async () => {
        const args = { docId: invoice._id, version: invoice.version };
        if (key === "send") await send(args);
        if (key === "markViewed") await markViewed(args);
        if (key === "markOverdue") await markOverdue(args);
        setNotice(`Invoice updated (${key}).`);
      });
    })();
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">
            <Link className="text-link" to={FINANCE_ROUTES.invoices}>
              Invoices
            </Link>{" "}
            · Detail
          </p>
          <h1 className="display-title mt-2">
            {invoice.invoiceNumber || "Untitled invoice"}
          </h1>
          <p className="mt-3 max-w-160 text-ink-2">
            {client
              ? String(
                  client.displayName ||
                    client.companyName ||
                    `${client.givenName ?? ""} ${client.familyName ?? ""}`.trim(),
                )
              : "Unknown client"}{" "}
            ·{" "}
            {Number(invoice.amountDue ?? 0).toLocaleString(undefined, {
              style: "currency",
              currency: "USD",
            })}{" "}
            due
          </p>
        </div>
        <div className="supply-row-actions">
          <StatusChip status={String(invoice.status)} />
          <Link className="btn btn-primary" to={FINANCE_ROUTES.payments}>
            Record payment
          </Link>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Lifecycle</p>
            <h2>Actions</h2>
          </div>
        </div>
        <div className="supply-row-actions">
          {policy.invoiceActions(String(invoice.status)).map((action) => (
            <button
              key={action.key}
              className="btn btn-ghost"
              disabled={busy != null}
              onClick={() => invoke(action.key)}
            >
              {busy === action.key ? "Working…" : action.label}
            </button>
          ))}
        </div>
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Amounts</p>
            <h2>Balance</h2>
          </div>
        </div>
        <dl className="supply-kv">
          <div>
            <dt>Total</dt>
            <dd>
              {Number(invoice.total ?? 0).toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
              })}
            </dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>
              {Number(invoice.amountPaid ?? 0).toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
              })}
            </dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>
              {Number(invoice.amountDue ?? 0).toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
              })}
            </dd>
          </div>
        </dl>
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Related</p>
            <h2>Payments</h2>
          </div>
          <span>{relatedPayments.length}</span>
        </div>
        {relatedPayments.length === 0 ? (
          <div className="document-empty">
            <p>No payments recorded yet.</p>
            <span>Record a payment after the invoice is sent.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {relatedPayments.map((payment) => (
                  <tr key={payment._id}>
                    <td>
                      {Number(payment.amount ?? 0).toLocaleString(undefined, {
                        style: "currency",
                        currency: "USD",
                      })}
                    </td>
                    <td>{String(payment.method)}</td>
                    <td>
                      <StatusChip status={String(payment.status)} />
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
