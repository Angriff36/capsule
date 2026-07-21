import type { FormEvent } from "react";

type ClientOption = {
  _id: string;
  clientType?: string;
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  displayName?: string | null;
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

export function InvoiceIssueForm({
  clients,
  events,
  busy,
  onSubmit,
  defaultClientId = "",
  defaultEventId = "",
}: {
  clients: ClientOption[];
  events: EventOption[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  defaultClientId?: string;
  defaultEventId?: string;
}) {
  if (clients.length === 0) {
    return (
      <form className="supply-form" onSubmit={(e) => e.preventDefault()}>
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

  const clientDefault =
    defaultClientId && clients.some((row) => row._id === defaultClientId)
      ? defaultClientId
      : "";
  const eventDefault =
    defaultEventId &&
    events.some((row) => row._id === defaultEventId && row.deletedAt == null)
      ? defaultEventId
      : "";

  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Issue</p>
          <h2>New invoice</h2>
        </div>
      </div>
      <label>
        Client
        <select name="clientId" required defaultValue={clientDefault}>
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
      <div className="supply-form-grid">
        <label>
          Subtotal
          <input
            name="subtotal"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue="1000"
          />
        </label>
        <label>
          Tax
          <input
            name="taxAmount"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue="0"
          />
        </label>
        <label>
          Discount
          <input
            name="discountAmount"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue="0"
          />
        </label>
        <label>
          Total
          <input
            name="total"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue="1000"
          />
        </label>
      </div>
      <div className="supply-form-grid">
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
      <div className="supply-row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Issuing…" : "Issue invoice"}
        </button>
      </div>
    </form>
  );
}
