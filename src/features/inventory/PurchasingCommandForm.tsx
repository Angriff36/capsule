import type { FormEvent } from "react";

type VendorOption = {
  _id: string;
  name: string;
  status: string;
};

type EventOption = {
  _id: string;
  title: string;
  deletedAt?: number | null;
};

export type PurchasingFormKind = "vendor" | "order";

export type PurchasingCommandFormProps = {
  form: PurchasingFormKind;
  busy: boolean;
  activeVendors: VendorOption[];
  events: EventOption[] | undefined;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function PurchasingCommandForm({
  form,
  busy,
  activeVendors,
  events,
  onCancel,
  onSubmit,
}: PurchasingCommandFormProps) {
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Governed procurement command</p>
          <h2>{form === "vendor" ? "Onboard vendor" : "Open vendor order"}</h2>
        </div>
        <div className="supply-row-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Working…" : "Create"}
          </button>
        </div>
      </div>
      <div className="supply-form-grid">
        {form === "vendor" ? (
          <>
            <label className="field-label">
              Vendor name
              <input name="name" className="input" required autoFocus />
            </label>
            <label className="field-label">
              Email
              <input name="email" type="email" className="input" />
            </label>
            <label className="field-label">
              Phone
              <input name="phone" className="input" />
            </label>
            <label className="field-label">
              Payment terms (days)
              <input
                name="paymentTermsDays"
                type="number"
                className="input"
                defaultValue={30}
                min={0}
                required
              />
            </label>
            <label className="field-label supply-span-2">
              Notes
              <textarea name="notes" className="input" rows={2} />
            </label>
          </>
        ) : (
          <>
            <label className="field-label">
              Vendor
              <select name="vendorId" className="input" required autoFocus>
                <option value="">Select vendor</option>
                {activeVendors
                  .filter((vendor) => vendor.status === "active")
                  .map((vendor) => (
                    <option key={vendor._id} value={vendor._id}>
                      {vendor.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Event (optional)
              <select name="eventId" className="input">
                <option value="">General stock</option>
                {(events ?? [])
                  .filter((event) => event.deletedAt == null)
                  .map((event) => (
                    <option key={event._id} value={event._id}>
                      {event.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Order number
              <input name="orderNumber" className="input" />
            </label>
            <label className="field-label supply-span-2">
              Notes
              <textarea name="notes" className="input" rows={2} />
            </label>
          </>
        )}
      </div>
    </form>
  );
}
