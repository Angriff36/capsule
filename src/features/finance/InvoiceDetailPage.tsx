import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { formatMoney, normalizeCurrencyCode } from "../../lib/format";
import { formatCurrencyLabel } from "../../lib/currency";
import {
  useCreateCreditMemo,
  useGetInvoice,
  useInvoiceMarkDepositPaid,
  useInvoiceMarkOverdue,
  useInvoiceMarkViewed,
  useInvoiceMarkVoided,
  useInvoiceSend,
  useInvoiceSetDeposit,
  useInvoiceWriteOff,
  useListClient,
  useListCreditMemo,
  useListEvent,
  useListInvoice,
  useListOrganization,
  useListPayment,
} from "../../lib/manifest-convex-react";
import { useInvoiceReminderActions } from "../../lib/invoiceReminderActions";
import {
  useInvoicePaymentActions,
  type InvoicePaymentLink,
} from "../../lib/invoicePaymentActions";
import {
  DEFAULT_INVOICE_REMINDER_OFFSETS_DAYS,
  parseInvoiceReminderOffsets,
  reminderOffsetLabel,
  reminderScheduledAt,
} from "../../lib/invoiceReminderSchedule";
import { useTrackRecent } from "../../lib/recents";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { ErrorState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { CLIENTS_ROUTES } from "../clients/clientsRoutes";
import { clientDisplayName } from "../events/clientName";
import { useTenantBranding } from "../admin/tenantBranding";
import { CommercialLifecyclePolicy } from "./CommercialLifecyclePolicy";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { downloadInvoicePdf } from "./invoicePdf";
import { readInvoiceLineItems, readTaxBreakdown } from "./invoiceTax";
import "./taxWorkspace.css";

const policy = new CommercialLifecyclePolicy();
type CreditMemoDisposition = "apply_to_balance" | "carry_forward";
type ReminderScheduleView = {
  configId: string;
  configuredAt: number;
  dueDate: number;
  offsetsDays: number[];
};

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useGetInvoice(id ?? "skip");
  useTrackRecent("Invoice", invoice?.invoiceNumber);
  const clients = useListClient();
  const creditMemos = useListCreditMemo();
  const events = useListEvent();
  const invoices = useListInvoice();
  const payments = useListPayment();
  const organizations = useListOrganization();
  const functionalCurrencyCode = normalizeCurrencyCode(
    organizations?.find((row) => row.deletedAt == null)?.defaultCurrencyCode,
    "USD",
  );
  const { branding, loading: brandingLoading } = useTenantBranding();
  const send = useInvoiceSend();
  const markViewed = useInvoiceMarkViewed();
  const markOverdue = useInvoiceMarkOverdue();
  const markVoided = useInvoiceMarkVoided();
  const writeOff = useInvoiceWriteOff();
  const setDeposit = useInvoiceSetDeposit();
  const markDepositPaid = useInvoiceMarkDepositPaid();
  const createCreditMemo = useCreateCreditMemo();
  const {
    getSchedule: getReminderSchedule,
    configureSchedule: configureReminderSchedule,
    sendNow: sendReminderNow,
  } = useInvoiceReminderActions();
  const { getPaymentLink, createPaymentLink, syncStripePayments } =
    useInvoicePaymentActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreditMemo, setShowCreditMemo] = useState(false);
  const [creditDisposition, setCreditDisposition] =
    useState<CreditMemoDisposition>("carry_forward");
  const [reminderOffsetsInput, setReminderOffsetsInput] = useState(
    DEFAULT_INVOICE_REMINDER_OFFSETS_DAYS.join(", "),
  );
  const [reminderSchedule, setReminderSchedule] =
    useState<ReminderScheduleView | null>(null);
  const [reminderScheduleLoading, setReminderScheduleLoading] = useState(true);
  const [paymentLink, setPaymentLink] = useState<InvoicePaymentLink | null>(
    null,
  );
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(true);
  const { prompt, host } = useActionPrompt(busy != null);

  useEffect(() => {
    if (!id) return;
    let current = true;
    setReminderScheduleLoading(true);
    void getReminderSchedule(id)
      .then((schedule) => {
        if (!current) return;
        setReminderSchedule(schedule);
        if (schedule) {
          setReminderOffsetsInput(schedule.offsetsDays.join(", "));
        }
      })
      .catch((error) => {
        if (current) setFailure(error);
      })
      .finally(() => {
        if (current) setReminderScheduleLoading(false);
      });
    return () => {
      current = false;
    };
  }, [getReminderSchedule, id]);

  useEffect(() => {
    if (!id) return;
    let current = true;
    setPaymentLinkLoading(true);
    void getPaymentLink(id)
      .then((link) => {
        if (current) setPaymentLink(link);
      })
      .catch((error) => {
        if (current) setFailure(error);
      })
      .finally(() => {
        if (current) setPaymentLinkLoading(false);
      });
    return () => {
      current = false;
    };
  }, [getPaymentLink, id]);

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
    creditMemos === undefined ||
    events === undefined ||
    invoices === undefined ||
    payments === undefined ||
    brandingLoading
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

  const clientName = clientDisplayName(String(invoice.clientId), clients);
  const clientRecord = clients.find((row) => row._id === invoice.clientId);
  const linkedEvent =
    invoice.eventId != null
      ? events.find((row) => row._id === invoice.eventId)
      : undefined;
  const relatedPayments = payments.filter(
    (row) => row.deletedAt == null && row.invoiceId === invoice._id,
  );
  const relatedCreditMemos = creditMemos.filter(
    (row) => row.deletedAt == null && row.sourceInvoiceId === invoice._id,
  );
  const eligibleCreditTargets = invoices.filter(
    (row) =>
      row.deletedAt == null &&
      row._id !== invoice._id &&
      row.clientId === invoice.clientId &&
      ["sent", "viewed", "overdue", "partial"].includes(String(row.status)) &&
      Number(row.amountDue ?? 0) > 0,
  );
  const lineItems = readInvoiceLineItems(invoice.lineItems);
  const taxBreakdown = readTaxBreakdown(invoice.taxBreakdown);

  const invoiceCurrencyCode = normalizeCurrencyCode(
    (invoice as { currencyCode?: unknown }).currencyCode,
    "USD",
  );
  const exchangeRateRaw = Number(invoice.exchangeRate ?? 1);
  const exchangeRate =
    Number.isFinite(exchangeRateRaw) && exchangeRateRaw > 0
      ? exchangeRateRaw
      : 1;
  const isForeignCurrency = invoiceCurrencyCode !== functionalCurrencyCode;
  const functionalEquivalentTotal = isForeignCurrency
    ? Number(invoice.total ?? 0) * exchangeRate
    : null;
  const functionalEquivalentDue = isForeignCurrency
    ? Number(invoice.amountDue ?? 0) * exchangeRate
    : null;

  const usd = (value: unknown) =>
    formatMoney(Number(value ?? 0), invoiceCurrencyCode);
  const depositAmount = Number(invoice.depositAmount ?? 0);
  const depositPaidAt =
    invoice.depositPaidAt != null ? Number(invoice.depositPaidAt) : null;
  const amountDue = Number(invoice.amountDue ?? 0);
  const availableToCredit = Math.max(
    0,
    Number(invoice.amountPaid ?? 0) - Number(invoice.creditMemoAmount ?? 0),
  );
  const availableClientCredit = creditMemos
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.clientId === invoice.clientId &&
        row.status === "available",
    )
    .reduce((sum, row) => sum + Number(row.remainingAmount ?? 0), 0);
  const canIssueCreditMemo = invoice.status === "paid" && availableToCredit > 0;
  const balanceAfterDeposit = Math.max(
    0,
    amountDue - (depositPaidAt == null ? depositAmount : 0),
  );
  const dueDate = invoice.dueDate == null ? null : Number(invoice.dueDate);
  const invoiceOpen = ["sent", "viewed", "overdue", "partial"].includes(
    String(invoice.status),
  );
  const paymentLinkAvailable = amountDue > 0 && invoiceOpen;
  const reminderAutomationAvailable =
    dueDate != null && amountDue > 0 && invoiceOpen;
  const canMarkDepositPaid =
    depositAmount > 0 &&
    depositPaidAt == null &&
    ["sent", "viewed", "overdue", "partial"].includes(String(invoice.status));

  const downloadPdf = () => {
    void downloadInvoicePdf({
      invoice,
      client: clientRecord,
      event: linkedEvent,
      branding,
    })
      .then(() => setNotice("Invoice PDF downloaded."))
      .catch((error) => setFailure(error));
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
        if (key === "send") {
          await send(args);
          if (dueDate == null) {
            setNotice(
              "Invoice sent. Automatic reminders need a due date set when the invoice is issued.",
            );
            return;
          }
          try {
            const schedule = await configureReminderSchedule({
              invoiceId: String(invoice._id),
              offsetsDays: parseInvoiceReminderOffsets(reminderOffsetsInput),
            });
            setReminderSchedule(schedule);
            setReminderOffsetsInput(schedule.offsetsDays.join(", "));
            setNotice(
              "Invoice sent. Automatic payment reminder schedule saved.",
            );
          } catch (error) {
            const detail =
              error instanceof Error ? error.message : "setup failed";
            throw new Error(
              `Invoice sent, but automatic reminder setup failed: ${detail}`,
            );
          }
          return;
        }
        if (key === "markViewed") await markViewed(args);
        if (key === "markOverdue") await markOverdue(args);
        setNotice(`Invoice updated (${key}).`);
      });
    })();
  };

  const onSetDeposit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(String(data.get("depositAmount") ?? "").trim());
    if (!Number.isFinite(amount) || amount < 0) {
      setFailure(new Error("Deposit amount must be zero or more."));
      return;
    }
    void run("setDeposit", async () => {
      await setDeposit({
        docId: invoice._id,
        version: invoice.version,
        depositAmount: amount,
      });
      setNotice("Deposit updated.");
    });
  };

  const onConfigureReminderSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let offsetsDays: number[];
    try {
      offsetsDays = parseInvoiceReminderOffsets(reminderOffsetsInput);
    } catch (error) {
      setFailure(error);
      return;
    }
    void run("configureReminders", async () => {
      const schedule = await configureReminderSchedule({
        invoiceId: String(invoice._id),
        offsetsDays,
      });
      setReminderSchedule(schedule);
      setReminderOffsetsInput(schedule.offsetsDays.join(", "));
      setNotice("Automatic payment reminder schedule saved.");
    });
  };

  const onSendReminderNow = () => {
    void run("sendReminder", async () => {
      const result = await sendReminderNow(String(invoice._id));
      if (result.status === "delivered") {
        setNotice(
          "Payment reminder emailed with the invoice PDF and payment link.",
        );
        return;
      }
      if (result.reason === "stripe_payment_received") {
        setNotice("No reminder sent — Stripe already shows this invoice paid.");
        return;
      }
      setNotice(
        "No reminder sent because this invoice no longer needs payment.",
      );
    });
  };

  const onCreatePaymentLink = () => {
    void run("createPaymentLink", async () => {
      const link = await createPaymentLink(String(invoice._id));
      setPaymentLink(link);
      setNotice("Stripe payment link ready. Copy it or send it to the client.");
    });
  };

  const onCopyPaymentLink = () => {
    if (!paymentLink) return;
    void navigator.clipboard
      .writeText(paymentLink.url)
      .then(() => setNotice("Payment link copied to the clipboard."))
      .catch(() => setFailure(new Error("Could not copy the payment link.")));
  };

  const onSyncStripePayments = () => {
    void run("syncStripePayments", async () => {
      const result = await syncStripePayments(String(invoice._id));
      if (result.failures.length > 0) {
        setFailure(new Error(result.failures.join(" · ")));
      }
      if (result.recorded > 0) {
        setNotice(
          `Recorded ${result.recorded} Stripe payment${result.recorded === 1 ? "" : "s"} (${usd(result.recordedAmount)}) — invoice balance updated.`,
        );
        return;
      }
      if (result.failures.length === 0) {
        setNotice(
          result.checked === 0
            ? "No outstanding Stripe payment links to check."
            : "No new Stripe payments found yet.",
        );
      }
    });
  };

  const onIssueCreditMemo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const creditMemoNumber = String(data.get("creditMemoNumber") ?? "").trim();
    const amount = Number(String(data.get("amount") ?? "").trim());
    const reason = String(data.get("reason") ?? "").trim();
    const targetInvoiceId = String(data.get("targetInvoiceId") ?? "").trim();

    if (!creditMemoNumber) {
      setFailure(new Error("Credit memo number is required."));
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFailure(new Error("Credit memo amount must be greater than zero."));
      return;
    }
    if (amount > availableToCredit) {
      setFailure(
        new Error(
          `Only ${usd(availableToCredit)} remains available to credit on this invoice.`,
        ),
      );
      return;
    }
    if (!reason) {
      setFailure(new Error("Add the reason for this adjustment."));
      return;
    }
    const target = eligibleCreditTargets.find(
      (row) => row._id === targetInvoiceId,
    );
    if (creditDisposition === "apply_to_balance" && !target) {
      setFailure(new Error("Choose an open invoice for this client."));
      return;
    }
    if (
      target &&
      creditDisposition === "apply_to_balance" &&
      amount > Number(target.amountDue ?? 0)
    ) {
      setFailure(
        new Error(
          `This credit exceeds the ${usd(target.amountDue)} target balance.`,
        ),
      );
      return;
    }

    void run("issueCreditMemo", async () => {
      await createCreditMemo({
        sourceInvoiceId: invoice._id,
        clientId: invoice.clientId,
        creditMemoNumber,
        amount,
        reason,
        disposition: creditDisposition,
        ...(creditDisposition === "apply_to_balance"
          ? { targetInvoiceId }
          : {}),
        ...(invoice.eventId ? { eventId: invoice.eventId } : {}),
      });
      form.reset();
      setCreditDisposition("carry_forward");
      setShowCreditMemo(false);
      setNotice(
        creditDisposition === "apply_to_balance"
          ? "Credit memo issued and applied to the selected invoice."
          : "Credit memo issued and carried forward on the client account.",
      );
    });
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
            <Link
              className="text-link"
              to={CLIENTS_ROUTES.detail(String(invoice.clientId))}
            >
              {clientName}
            </Link>
            {linkedEvent ? (
              <>
                {" "}
                ·{" "}
                <Link className="text-link" to={`/events/${linkedEvent._id}`}>
                  {String(linkedEvent.title || "Linked event")}
                </Link>
              </>
            ) : null}{" "}
            · {formatMoney(Number(invoice.amountDue ?? 0), invoiceCurrencyCode)}{" "}
            due
            {isForeignCurrency && functionalEquivalentDue != null ? (
              <>
                {" "}
                · {formatMoney(
                  functionalEquivalentDue,
                  functionalCurrencyCode,
                )}{" "}
                {formatCurrencyLabel(functionalCurrencyCode).split(" ")[0]}{" "}
                equivalent
              </>
            ) : null}
          </p>
        </div>
        <div className="supply-row-actions">
          <StatusChip status={String(invoice.status)} />
          {invoice.status === "paid" ? (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy != null || !canIssueCreditMemo}
              onClick={() => setShowCreditMemo((visible) => !visible)}
            >
              Issue credit memo
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={downloadPdf}>
            Download PDF
          </button>
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
            <p className="eyebrow">Source</p>
            <h2>Linked records</h2>
          </div>
        </div>
        <p className="text-[13px] text-ink-2">
          Client:{" "}
          <Link
            className="text-link"
            to={CLIENTS_ROUTES.detail(String(invoice.clientId))}
          >
            {clientName}
          </Link>
          {invoice.eventId ? (
            <>
              {" "}
              · Event:{" "}
              {linkedEvent ? (
                <Link className="text-link" to={`/events/${linkedEvent._id}`}>
                  {String(linkedEvent.title || linkedEvent._id)}
                </Link>
              ) : (
                <span>linked event unavailable</span>
              )}
            </>
          ) : (
            <> · No event linked on this invoice</>
          )}
        </p>
      </section>

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
            <p className="eyebrow">Invoice detail</p>
            <h2>Line items</h2>
          </div>
          <span>{lineItems.length}</span>
        </div>
        {lineItems.length === 0 ? (
          <div className="document-empty">
            <p>This invoice predates itemized tax.</p>
            <span>Its aggregate subtotal and tax remain available below.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table invoice-detail-lines">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Subtotal</th>
                  <th>Tax</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((line, index) => (
                  <tr key={`${line.description}-${index}`}>
                    <td>{line.description}</td>
                    <td>{line.category}</td>
                    <td>{line.quantity}</td>
                    <td>{usd(line.unitPrice)}</td>
                    <td>{usd(line.subtotal)}</td>
                    <td>
                      {usd(line.taxAmount)}
                      {line.appliedTaxRates.length ? (
                        <small className="invoice-detail-rate-names">
                          {line.appliedTaxRates
                            .map((rate) => rate.name)
                            .join(", ")}
                        </small>
                      ) : null}
                    </td>
                    <td>{usd(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Amounts ({invoiceCurrencyCode})</p>
            <h2>Balance</h2>
          </div>
          {isForeignCurrency ? (
            <span className="text-[11px] text-ink-3">
              1 {invoiceCurrencyCode} = {exchangeRate} {functionalCurrencyCode}{" "}
              · recorded at issue
            </span>
          ) : null}
        </div>
        <dl className="supply-kv">
          <div>
            <dt>Subtotal</dt>
            <dd>{usd(invoice.subtotal)}</dd>
          </div>
          <div>
            <dt>Tax</dt>
            <dd>{usd(invoice.taxAmount)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{usd(invoice.total)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{usd(invoice.amountPaid)}</dd>
          </div>
          <div>
            <dt>Credits applied</dt>
            <dd>{usd(invoice.amountCredited)}</dd>
          </div>
          <div>
            <dt>Credit memos issued</dt>
            <dd>{usd(invoice.creditMemoAmount)}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{usd(invoice.amountDue)}</dd>
          </div>
          {isForeignCurrency ? (
            <>
              <div>
                <dt>Total · {functionalCurrencyCode}</dt>
                <dd>
                  {formatMoney(
                    functionalEquivalentTotal ?? 0,
                    functionalCurrencyCode,
                  )}
                </dd>
              </div>
              <div>
                <dt>Due · {functionalCurrencyCode}</dt>
                <dd>
                  {formatMoney(
                    functionalEquivalentDue ?? 0,
                    functionalCurrencyCode,
                  )}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        {taxBreakdown.length ? (
          <div
            className="invoice-tax-breakdown"
            aria-label="Named tax breakdown"
          >
            {taxBreakdown.map((rate) => (
              <span key={rate.taxRateId}>
                {rate.name} · {rate.percentage}% · {usd(rate.amount)}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="working-ledger" aria-labelledby="credit-memos-title">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Adjustments</p>
            <h2 id="credit-memos-title">Credit memos</h2>
          </div>
          <span>{relatedCreditMemos.length}</span>
        </div>
        <p className="text-[13px] text-ink-2">
          Preserve the paid invoice while recording a pricing correction,
          service recovery, or other post-event credit.
        </p>
        <dl className="supply-kv mt-3">
          <div>
            <dt>Available to issue</dt>
            <dd>{usd(availableToCredit)}</dd>
          </div>
          <div>
            <dt>Client credit available</dt>
            <dd>{usd(availableClientCredit)}</dd>
          </div>
        </dl>
        {invoice.status === "paid" && !canIssueCreditMemo ? (
          <p className="mt-3 text-[13px] text-ink-2" role="status">
            The full paid amount has already been credited.
          </p>
        ) : null}
        {showCreditMemo && canIssueCreditMemo ? (
          <form className="supply-form mt-4" onSubmit={onIssueCreditMemo}>
            <div className="supply-form-grid">
              <label>
                Credit memo number
                <input
                  name="creditMemoNumber"
                  required
                  defaultValue={`CM-${String(invoice.invoiceNumber || invoice._id).slice(-12)}-${relatedCreditMemos.length + 1}`}
                />
              </label>
              <label>
                Amount
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  max={availableToCredit}
                  step="0.01"
                  required
                />
              </label>
              <label>
                Credit outcome
                <select
                  name="disposition"
                  value={creditDisposition}
                  onChange={(event) =>
                    setCreditDisposition(
                      event.currentTarget.value as CreditMemoDisposition,
                    )
                  }
                >
                  <option value="carry_forward">
                    Carry forward for a future invoice
                  </option>
                  <option
                    value="apply_to_balance"
                    disabled={eligibleCreditTargets.length === 0}
                  >
                    Apply to an open invoice now
                  </option>
                </select>
              </label>
              {creditDisposition === "apply_to_balance" ? (
                <label>
                  Open invoice
                  <select name="targetInvoiceId" required defaultValue="">
                    <option value="" disabled>
                      Choose an invoice
                    </option>
                    {eligibleCreditTargets.map((target) => (
                      <option key={target._id} value={target._id}>
                        {String(target.invoiceNumber || target._id)} ·{" "}
                        {usd(target.amountDue)} due
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label style={{ gridColumn: "1 / -1" }}>
                Reason
                <textarea
                  name="reason"
                  rows={3}
                  required
                  placeholder="What changed after the event?"
                />
              </label>
            </div>
            <div className="supply-row-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy != null}
              >
                {busy === "issueCreditMemo" ? "Issuing…" : "Issue credit memo"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy != null}
                onClick={() => {
                  setCreditDisposition("carry_forward");
                  setShowCreditMemo(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        {relatedCreditMemos.length === 0 ? (
          <div className="document-empty mt-4">
            <p>No credit memos issued.</p>
            <span>
              Paid invoice totals and payment history remain unchanged.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap mt-4">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Memo</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Outcome</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {relatedCreditMemos.map((memo) => {
                  const target = invoices.find(
                    (row) => row._id === memo.targetInvoiceId,
                  );
                  return (
                    <tr key={memo._id}>
                      <td>{String(memo.creditMemoNumber || memo._id)}</td>
                      <td>{String(memo.reason || "—")}</td>
                      <td>{usd(memo.amount)}</td>
                      <td>
                        {memo.targetInvoiceId ? (
                          <Link
                            className="text-link"
                            to={FINANCE_ROUTES.invoiceDetail(
                              String(memo.targetInvoiceId),
                            )}
                          >
                            Applied to{" "}
                            {String(target?.invoiceNumber || "invoice")}
                          </Link>
                        ) : (
                          `${usd(memo.remainingAmount)} carried forward`
                        )}
                      </td>
                      <td>
                        <StatusChip status={String(memo.status)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Deposit</p>
            <h2>Deposit</h2>
          </div>
        </div>
        <dl className="supply-kv">
          <div>
            <dt>Deposit due</dt>
            <dd>{usd(depositAmount)}</dd>
          </div>
          <div>
            <dt>Deposit paid</dt>
            <dd>
              {depositPaidAt != null
                ? new Date(depositPaidAt).toLocaleDateString()
                : "Not paid"}
            </dd>
          </div>
          <div>
            <dt>Balance after deposit</dt>
            <dd>{usd(balanceAfterDeposit)}</dd>
          </div>
        </dl>
        <div className="supply-row-actions mt-3">
          {canMarkDepositPaid ? (
            <button
              className="btn btn-ghost"
              disabled={busy != null}
              onClick={() =>
                void run("markDepositPaid", async () => {
                  await markDepositPaid({
                    docId: invoice._id,
                    version: invoice.version,
                  });
                  setNotice("Deposit marked paid.");
                })
              }
            >
              {busy === "markDepositPaid" ? "Working…" : "Mark deposit paid"}
            </button>
          ) : null}
        </div>
        {depositPaidAt == null ? (
          <form className="supply-form mt-4" onSubmit={onSetDeposit}>
            <div className="supply-form-grid">
              <label>
                Deposit amount
                <input
                  name="depositAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={depositAmount || ""}
                />
              </label>
            </div>
            <div className="supply-row-actions">
              <button
                className="btn btn-ghost"
                type="submit"
                disabled={busy != null}
              >
                {busy === "setDeposit" ? "Working…" : "Save deposit"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="working-ledger" aria-labelledby="payment-link-title">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Collections</p>
            <h2 id="payment-link-title">Stripe payment link</h2>
          </div>
        </div>
        <p className="mt-3 max-w-160 text-[13px] text-ink-2">
          Share a secure Stripe checkout link so the client can pay this invoice
          online without calling in. Confirmed Stripe payments are recorded here
          and applied to the balance.
        </p>
        {paymentLinkLoading ? (
          <p className="mt-3 text-[13px] text-ink-2" role="status">
            Loading payment link…
          </p>
        ) : paymentLink ? (
          <div className="document-empty mt-4">
            <p>Payment link for {usd(paymentLink.amount)}</p>
            <span>
              <a
                className="text-link"
                href={paymentLink.url}
                target="_blank"
                rel="noreferrer"
              >
                {paymentLink.url}
              </a>
            </span>
          </div>
        ) : (
          <div className="document-empty mt-4">
            <p>No payment link yet.</p>
            <span>
              Generate a link after sending the invoice, then copy it into any
              message to the client.
            </span>
          </div>
        )}
        <div className="supply-row-actions mt-3">
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy != null || !paymentLinkAvailable}
            onClick={onCreatePaymentLink}
          >
            {busy === "createPaymentLink"
              ? "Creating…"
              : paymentLink
                ? "Generate new link"
                : "Generate payment link"}
          </button>
          {paymentLink ? (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy != null}
              onClick={onCopyPaymentLink}
            >
              Copy link
            </button>
          ) : null}
          {paymentLink ? (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy != null}
              onClick={onSyncStripePayments}
            >
              {busy === "syncStripePayments"
                ? "Checking Stripe…"
                : "Check for payment"}
            </button>
          ) : null}
        </div>
        {!paymentLinkAvailable && !paymentLink ? (
          <p className="mt-3 text-[13px] text-ink-2" role="status">
            Send the invoice with a balance due to generate a payment link.
          </p>
        ) : null}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Collections</p>
            <h2>Automatic payment reminders</h2>
          </div>
          <span>{reminderSchedule?.offsetsDays.length ?? 0}</span>
        </div>
        <p className="mt-3 max-w-160 text-[13px] text-ink-2">
          Capsule emails the client a branded reminder with this invoice PDF and
          a fresh Stripe payment link. Paid, voided, and written-off invoices
          stop automatically.
        </p>
        <dl className="supply-kv mt-4">
          <div>
            <dt>Invoice due</dt>
            <dd>
              {dueDate == null
                ? "No due date"
                : new Date(dueDate).toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt>Automation</dt>
            <dd>
              {reminderScheduleLoading
                ? "Loading…"
                : reminderSchedule
                  ? "Enabled"
                  : "Not configured"}
            </dd>
          </div>
        </dl>
        {reminderSchedule && dueDate != null ? (
          <div className="document-empty mt-4">
            <p>Current reminder schedule</p>
            <span>
              {reminderSchedule.offsetsDays
                .map(
                  (offsetDays) =>
                    `${reminderOffsetLabel(offsetDays)} (${new Date(
                      reminderScheduledAt(dueDate, offsetDays),
                    ).toLocaleDateString()})`,
                )
                .join(" · ")}
            </span>
          </div>
        ) : null}
        {dueDate == null ? (
          <p className="mt-3 text-[13px] text-ink-2" role="status">
            This invoice was issued without a due date, so automatic reminders
            cannot be scheduled.
          </p>
        ) : !reminderAutomationAvailable ? (
          <p className="mt-3 text-[13px] text-ink-2" role="status">
            Send the invoice with a balance due to activate reminder automation.
          </p>
        ) : null}
        <form
          className="supply-form mt-4"
          onSubmit={onConfigureReminderSchedule}
        >
          <div className="supply-form-grid">
            <label>
              Days relative to due date
              <input
                name="reminderOffsets"
                value={reminderOffsetsInput}
                onChange={(event) =>
                  setReminderOffsetsInput(event.currentTarget.value)
                }
                placeholder="7, 0, -3, -14"
                aria-describedby="reminder-offsets-help"
                disabled={!reminderAutomationAvailable || busy != null}
              />
              <span id="reminder-offsets-help" className="field-help">
                Positive is before due; 0 is due day; negative is overdue.
              </span>
            </label>
          </div>
          <div className="supply-row-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={!reminderAutomationAvailable || busy != null}
            >
              {busy === "configureReminders"
                ? "Scheduling…"
                : reminderSchedule
                  ? "Update schedule"
                  : "Enable reminders"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={!reminderAutomationAvailable || busy != null}
              onClick={onSendReminderNow}
            >
              {busy === "sendReminder" ? "Sending…" : "Send reminder now"}
            </button>
          </div>
        </form>
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
                      {formatMoney(
                        Number(payment.amount ?? 0),
                        invoiceCurrencyCode,
                      )}
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
