import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  calculateInvoiceTax,
  INVOICE_LINE_CATEGORIES,
  roundMoney,
  type InvoiceLineCategory,
  type InvoiceLineDraft,
  type TaxRateRecord,
} from "./invoiceTax";
import { FINANCE_ROUTES } from "./financeRoutes";
import "./taxWorkspace.css";

type ClientOption = {
  _id: string;
  clientType?: string;
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  displayName?: string | null;
  taxExempt?: boolean | null;
};

type EventOption = {
  _id: string;
  title?: string | null;
  deletedAt?: number | null;
};

const clientLabel = (row: ClientOption) => {
  if (row.displayName) return String(row.displayName);
  if (row.clientType === "person") {
    return `${row.givenName ?? ""} ${row.familyName ?? ""}`.trim() || "Client";
  }
  return row.companyName?.trim() || "Client";
};

const usd = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" });

const categoryLabel = (category: InvoiceLineCategory) =>
  category.charAt(0).toUpperCase() + category.slice(1);

const initialLine = (): InvoiceLineDraft => ({
  id: "line-1",
  description: "Catering package",
  category: "food",
  quantity: 1,
  unitPrice: 1000,
});

export function InvoiceIssueForm({
  clients,
  events,
  taxRates,
  busy,
  onSubmit,
  defaultClientId = "",
  defaultEventId = "",
}: {
  clients: ClientOption[];
  events: EventOption[];
  taxRates: TaxRateRecord[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  defaultClientId?: string;
  defaultEventId?: string;
}) {
  const clientDefault =
    defaultClientId && clients.some((row) => row._id === defaultClientId)
      ? defaultClientId
      : "";
  const eventDefault =
    defaultEventId &&
    events.some((row) => row._id === defaultEventId && row.deletedAt == null)
      ? defaultEventId
      : "";
  const [selectedClientId, setSelectedClientId] = useState(clientDefault);
  const [lines, setLines] = useState<InvoiceLineDraft[]>([initialLine()]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const selectedClient = clients.find((row) => row._id === selectedClientId);
  const taxExempt = selectedClient?.taxExempt === true;
  const activeTaxRates = taxRates.filter(
    (rate) => rate.active === true && rate.deletedAt == null,
  );
  const calculation = useMemo(
    () => calculateInvoiceTax(lines, taxRates, taxExempt),
    [lines, taxExempt, taxRates],
  );
  const total = roundMoney(
    Math.max(0, calculation.total - Math.max(0, discountAmount)),
  );

  const updateLine = <K extends keyof InvoiceLineDraft>(
    id: string,
    field: K,
    value: InvoiceLineDraft[K],
  ) => {
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, [field]: value } : line,
      ),
    );
  };

  const addLine = () => {
    setLines((current) => [
      ...current,
      {
        id: `line-${Date.now()}-${current.length}`,
        description: "",
        category: "service",
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((current) =>
      current.length === 1 ? current : current.filter((line) => line.id !== id),
    );
  };

  if (clients.length === 0) {
    return (
      <form
        className="supply-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="supply-form-heading">
          <div>
            <p className="eyebrow">Issue</p>
            <h2>New invoice</h2>
          </div>
        </div>
        <p className="text-[13px] text-ink-2">
          No active clients are available. Register a client from Events (sales)
          before issuing an invoice.
        </p>
      </form>
    );
  }

  return (
    <form className="supply-form invoice-composer" onSubmit={onSubmit}>
      <div className="supply-form-heading invoice-composer-heading">
        <div>
          <p className="eyebrow">Issue</p>
          <h2>Build the invoice</h2>
          <p>
            Categorize each charge once. Active rates are matched and calculated
            automatically.
          </p>
        </div>
        <Link className="text-link" to={FINANCE_ROUTES.taxes}>
          Configure tax rates
        </Link>
      </div>

      <div className="invoice-composer-basics">
        <label>
          Client
          <select
            name="clientId"
            required
            value={selectedClientId}
            onChange={(event) => setSelectedClientId(event.target.value)}
          >
            <option value="" disabled>
              Select client
            </option>
            {clients.map((client) => (
              <option key={client._id} value={client._id}>
                {clientLabel(client)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Invoice number
          <input name="invoiceNumber" required placeholder="INV-2026-001" />
        </label>
        <label>
          Event (optional)
          <select name="eventId" defaultValue={eventDefault}>
            <option value="">No linked event</option>
            {events
              .filter((row) => row.deletedAt == null)
              .map((event) => (
                <option key={event._id} value={event._id}>
                  {event.title}
                </option>
              ))}
          </select>
        </label>
      </div>

      <section
        className="invoice-line-editor"
        aria-labelledby="invoice-lines-title"
      >
        <div className="invoice-line-editor-heading">
          <div>
            <p className="eyebrow">Charges</p>
            <h3 id="invoice-lines-title">Line items</h3>
          </div>
          <button className="btn btn-ghost" type="button" onClick={addLine}>
            Add line
          </button>
        </div>

        {activeTaxRates.length === 0 ? (
          <p className="invoice-tax-note" role="status">
            No active tax rates. Lines will remain untaxed until a rate is
            configured.
          </p>
        ) : taxExempt ? (
          <p className="invoice-tax-note is-exempt" role="status">
            This client is tax exempt. Applicable rates are shown but no tax is
            charged.
          </p>
        ) : null}

        <div className="invoice-line-stack">
          {lines.map((line, index) => {
            const snapshot = calculation.lineItems[index];
            return (
              <article className="invoice-line-card" key={line.id}>
                <span className="invoice-line-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <label className="invoice-line-description">
                  Description
                  <input
                    aria-label={`Line ${index + 1} description`}
                    required
                    value={line.description}
                    onChange={(event) =>
                      updateLine(line.id, "description", event.target.value)
                    }
                    placeholder="Menu, staffing, or rentals"
                  />
                </label>
                <label>
                  Category
                  <select
                    aria-label={`Line ${index + 1} category`}
                    value={line.category}
                    onChange={(event) =>
                      updateLine(
                        line.id,
                        "category",
                        event.target.value as InvoiceLineCategory,
                      )
                    }
                  >
                    {INVOICE_LINE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {categoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    aria-label={`Line ${index + 1} quantity`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(
                        line.id,
                        "quantity",
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  Unit price
                  <input
                    aria-label={`Line ${index + 1} unit price`}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={line.unitPrice}
                    onChange={(event) =>
                      updateLine(
                        line.id,
                        "unitPrice",
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
                <div className="invoice-line-result" aria-live="polite">
                  <span>{usd(snapshot?.subtotal ?? 0)}</span>
                  <strong>{usd(snapshot?.taxAmount ?? 0)} tax</strong>
                </div>
                <button
                  className="invoice-line-remove"
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() => removeLine(line.id)}
                  aria-label={`Remove line ${index + 1}`}
                >
                  Remove
                </button>
                <div className="invoice-line-rates">
                  {snapshot?.appliedTaxRates.length ? (
                    snapshot.appliedTaxRates.map((rate) => (
                      <span key={rate.taxRateId}>
                        {rate.name} · {rate.percentage}% · {usd(rate.amount)}
                      </span>
                    ))
                  ) : (
                    <span>No tax applies</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="invoice-composer-footer">
        <div className="invoice-composer-terms">
          <div className="supply-form-grid">
            <label>
              Discount
              <input
                name="discountAmount"
                type="number"
                min="0"
                max={calculation.total}
                step="0.01"
                value={discountAmount}
                onChange={(event) =>
                  setDiscountAmount(Number(event.target.value))
                }
              />
            </label>
            <label>
              Payment terms (days)
              <input
                name="paymentTermsDays"
                type="number"
                min="0"
                defaultValue="30"
              />
            </label>
            <label>
              Due date
              <input name="dueDate" type="datetime-local" />
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" rows={2} />
          </label>
        </div>

        <aside
          className="invoice-total-ticket"
          aria-label="Calculated invoice totals"
        >
          <p className="eyebrow">Calculated total</p>
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{usd(calculation.subtotal)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd data-testid="invoice-tax-total">
                {usd(calculation.taxAmount)}
              </dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>−{usd(Math.max(0, discountAmount))}</dd>
            </div>
            <div className="invoice-total-ticket-grand">
              <dt>Total</dt>
              <dd data-testid="invoice-grand-total">{usd(total)}</dd>
            </div>
          </dl>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Issuing…" : "Issue invoice"}
          </button>
        </aside>
      </div>

      <input type="hidden" name="subtotal" value={calculation.subtotal} />
      <input type="hidden" name="taxAmount" value={calculation.taxAmount} />
      <input type="hidden" name="total" value={total} />
      <input
        type="hidden"
        name="lineItems"
        value={JSON.stringify(calculation.lineItems)}
      />
      <input
        type="hidden"
        name="taxBreakdown"
        value={JSON.stringify(calculation.taxBreakdown)}
      />
    </form>
  );
}
