import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useCreateInvoice,
  useInvoiceMarkOverdue,
  useInvoiceMarkViewed,
  useInvoiceMarkVoided,
  useInvoiceSend,
  useInvoiceWriteOff,
  useListClient,
  useListEvent,
  useListInvoice,
  useListOrganization,
  useListTaxRate,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import {
  BulkActionBar,
  useBulkRun,
  useBulkSelection,
} from "../../ui/bulk-select";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatMoney, normalizeCurrencyCode } from "../../lib/format";
import { CommercialLifecyclePolicy } from "./CommercialLifecyclePolicy";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { InvoiceIssueForm } from "./InvoiceIssueForm";

const policy = new CommercialLifecyclePolicy();

const money = (value: FormDataEntryValue | null) => {
  const amount = Number(String(value ?? "").trim());
  return Number.isFinite(amount) ? amount : Number.NaN;
};

const clientLabel = (row: {
  clientType?: string;
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  displayName?: string | null;
}) => {
  if (row.displayName) return String(row.displayName);
  if (row.clientType === "person") {
    return `${row.givenName ?? ""} ${row.familyName ?? ""}`.trim() || "Client";
  }
  return row.companyName?.trim() || "Client";
};

export function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillClientId = searchParams.get("clientId")?.trim() || "";
  const prefillEventId = searchParams.get("eventId")?.trim() || "";
  const openFromLink = searchParams.get("issue") === "1";
  const invoices = useListInvoice();
  const clients = useListClient();
  const events = useListEvent();
  const taxRates = useListTaxRate();
  const organizations = useListOrganization();
  const createInvoice = useCreateInvoice();
  const send = useInvoiceSend();
  const markViewed = useInvoiceMarkViewed();
  const markOverdue = useInvoiceMarkOverdue();
  const markVoided = useInvoiceMarkVoided();
  const writeOff = useInvoiceWriteOff();
  const functionalCurrencyCode = normalizeCurrencyCode(
    organizations?.find((row) => row.deletedAt == null)?.defaultCurrencyCode,
    "USD",
  );
  const [showIssue, setShowIssue] = useState(openFromLink);
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeClients = (clients ?? []).filter(
    (row) => row.deletedAt == null && String(row.status) !== "archived",
  );
  const activeRows = (invoices ?? []).filter((row) => row.deletedAt == null);
  const scopedRows =
    !prefillClientId && !prefillEventId
      ? activeRows
      : activeRows.filter((row) => {
          if (prefillClientId && String(row.clientId) !== prefillClientId) {
            return false;
          }
          if (prefillEventId && String(row.eventId ?? "") !== prefillEventId) {
            return false;
          }
          return true;
        });
  const visibleRows = showClosed
    ? scopedRows
    : scopedRows.filter(
        (row) =>
          !["paid", "voided", "written_off"].includes(String(row.status)),
      );

  const canSend = (row: { status: unknown; amountDue?: unknown }) =>
    policy
      .invoiceActions(String(row.status), row)
      .some((a) => a.key === "send");
  const sendableRows = visibleRows.filter(canSend);
  const selection = useBulkSelection(sendableRows);
  const bulk = useBulkRun();

  const clearIssuePrefill = () => {
    if (!openFromLink && !prefillClientId && !prefillEventId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("issue");
    next.delete("clientId");
    next.delete("eventId");
    setSearchParams(next, { replace: true });
  };

  const nameForClient = (id: string) => {
    const client = clients?.find((row) => row._id === id);
    return client ? clientLabel(client) : "Unknown client";
  };

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

  const submitIssue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const clientId = String(data.get("clientId") || "").trim();
    const invoiceNumber = String(data.get("invoiceNumber") || "").trim();
    const subtotal = money(data.get("subtotal"));
    const taxAmount = money(data.get("taxAmount"));
    const discountAmount = money(data.get("discountAmount"));
    const total = money(data.get("total"));
    const eventId = String(data.get("eventId") || "").trim();
    const dueRaw = String(data.get("dueDate") || "").trim();
    let lineItems: unknown;
    let taxBreakdown: unknown;
    try {
      lineItems = JSON.parse(String(data.get("lineItems") || "[]"));
      taxBreakdown = JSON.parse(String(data.get("taxBreakdown") || "[]"));
    } catch {
      setFailure(new Error("The calculated invoice lines could not be read."));
      return;
    }
    if (!clientId) {
      setFailure(new Error("Select a client before issuing an invoice."));
      return;
    }
    if (
      !invoiceNumber ||
      [subtotal, taxAmount, discountAmount, total].some((n) => Number.isNaN(n))
    ) {
      setFailure(
        new Error("Invoice number and all money fields are required."),
      );
      return;
    }
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      setFailure(new Error("Add at least one invoice line."));
      return;
    }
    const rawCurrencyCode = String(data.get("currencyCode") || "").trim();
    const rawExchangeRate = Number(data.get("exchangeRate"));
    const issueCurrencyCode = rawCurrencyCode
      ? rawCurrencyCode.toUpperCase()
      : functionalCurrencyCode;
    const issueExchangeRate =
      Number.isFinite(rawExchangeRate) && rawExchangeRate > 0
        ? rawExchangeRate
        : 1;
    void run("issue-invoice", async () => {
      await createInvoice({
        clientId,
        invoiceNumber,
        subtotal,
        taxAmount,
        discountAmount,
        total,
        eventId: eventId || undefined,
        paymentTermsDays: Number(data.get("paymentTermsDays") || 30) || 30,
        dueDate: dueRaw ? new Date(dueRaw) : undefined,
        notes: String(data.get("notes") || "").trim() || undefined,
        lineItems,
        taxBreakdown,
        currencyCode: issueCurrencyCode,
        exchangeRate: issueExchangeRate,
      });
      form.reset();
      setShowIssue(false);
      clearIssuePrefill();
      setNotice("Invoice issued. Send it when ready for payment.");
    });
  };

  const invoke = (
    row: {
      _id: string;
      version: number;
      status: unknown;
      amountDue?: number;
    },
    key: string,
  ) => {
    void (async () => {
      if (key === "void") {
        const reason = await prompt.askReason({
          ...ReasonCopy.voidInvoice,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:${key}`, async () => {
          await markVoided({ docId: row._id, version: row.version, reason });
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
        const writeOffAmount = Number(row.amountDue ?? 0);
        if (!(writeOffAmount > 0)) {
          setFailure(new Error("Nothing remains due to write off."));
          return;
        }
        void run(`${row._id}:${key}`, async () => {
          await writeOff({
            docId: row._id,
            version: row.version,
            reason,
            writeOffAmount,
          });
          setNotice("Invoice written off.");
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        const args = { docId: row._id, version: row.version };
        if (key === "send") await send(args);
        if (key === "markViewed") await markViewed(args);
        if (key === "markOverdue") await markOverdue(args);
        setNotice(`Invoice updated (${key}).`);
      });
    })();
  };

  const runBulkSend = () => {
    const targets = selection.selected.filter(canSend);
    if (targets.length === 0) return;
    void run("bulk-send", async () => {
      await bulk.runBulk(targets, async (row) => {
        await send({ docId: row._id, version: row.version });
      });
      selection.clear();
      setNotice(
        `${targets.length} ${targets.length === 1 ? "invoice" : "invoices"} sent.`,
      );
    });
  };

  const loading =
    invoices === undefined ||
    clients === undefined ||
    events === undefined ||
    taxRates === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Finance · Invoices</p>
          <h1 className="display-title mt-2">Client invoices</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Issue an invoice against a client (and optional event), send it for
            payment, then record and settle payments on the Payments board.
          </p>
        </div>
        <div className="supply-row-actions">
          <Link className="btn btn-ghost" to={FINANCE_ROUTES.revenue}>
            Revenue trends
          </Link>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowClosed((value) => !value)}
          >
            {showClosed ? "Hide closed" : "Show closed"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              if (showIssue) clearIssuePrefill();
              setShowIssue((value) => !value);
            }}
          >
            {showIssue ? "Close form" : "Issue invoice"}
          </button>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {prefillClientId || prefillEventId ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          Showing invoices
          {prefillClientId ? " for the linked client" : ""}
          {prefillEventId ? " tied to the linked event" : ""}.{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => {
              clearIssuePrefill();
              setShowIssue(false);
            }}
          >
            Clear filter
          </button>
        </p>
      ) : null}
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showIssue ? (
        <InvoiceIssueForm
          clients={activeClients}
          events={events ?? []}
          taxRates={taxRates ?? []}
          busy={busy === "issue-invoice"}
          onSubmit={submitIssue}
          defaultClientId={prefillClientId}
          defaultEventId={prefillEventId}
          functionalCurrencyCode={functionalCurrencyCode}
        />
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Billing ledger</p>
            <h2>Invoices</h2>
          </div>
          <span>{visibleRows.length} invoices</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No open invoices.</p>
            <span>
              Issue an invoice for a registered client to begin billing.
            </span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowIssue(true)}
              >
                Issue invoice
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all sendable invoices"
                      checked={selection.allSelected}
                      disabled={busy != null || sendableRows.length === 0}
                      onChange={(event) =>
                        selection.toggleAll(event.target.checked)
                      }
                    />
                  </th>
                  <th>Number</th>
                  <th>Client</th>
                  <th>Due</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const rowCurrency = normalizeCurrencyCode(
                    (row as { currencyCode?: unknown }).currencyCode,
                    functionalCurrencyCode,
                  );
                  return (
                    <tr key={row._id}>
                      <td className="w-8">
                        {canSend(row) ? (
                          <input
                            type="checkbox"
                            aria-label={`Select invoice ${row.invoiceNumber || "draft"}`}
                            checked={selection.isSelected(row._id)}
                            disabled={busy != null}
                            onChange={(event) =>
                              selection.toggle(row._id, event.target.checked)
                            }
                          />
                        ) : null}
                      </td>
                      <td>
                        <Link
                          className="text-link"
                          to={FINANCE_ROUTES.invoiceDetail(row._id)}
                        >
                          <strong>
                            {row.invoiceNumber || "Draft invoice"}
                          </strong>
                        </Link>
                        <small>
                          {formatMoney(Number(row.total ?? 0), rowCurrency)}
                        </small>
                      </td>
                      <td>{nameForClient(String(row.clientId))}</td>
                      <td>
                        {formatMoney(Number(row.amountDue ?? 0), rowCurrency)}
                      </td>
                      <td>
                        <StatusChip status={String(row.status)} />
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          <Link
                            className="btn btn-ghost btn-sm"
                            to={FINANCE_ROUTES.invoiceDetail(row._id)}
                          >
                            Open
                          </Link>
                          {policy
                            .invoiceActions(String(row.status), row)
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BulkActionBar
        count={selection.count}
        noun="invoice"
        progress={bulk.progress}
        onClear={selection.clear}
      >
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy != null || selection.count === 0}
          onClick={runBulkSend}
        >
          Send {selection.count}
        </button>
      </BulkActionBar>
    </div>
  );
}
