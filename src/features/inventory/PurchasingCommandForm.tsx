import type { Dispatch, FormEvent, SetStateAction } from "react";
import { isoDate } from "./PurchasingFormHelpers";

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

export type PurchasingFormKind = "vendor" | "order" | "prepDraft";

export type PurchasingCommandFormProps = {
  form: PurchasingFormKind;
  busy: boolean;
  activeVendors: VendorOption[];
  events: EventOption[] | undefined;
  draftRange: { start: string; end: string };
  setDraftRange: Dispatch<SetStateAction<{ start: string; end: string }>>;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function PurchasingCommandForm({
  form,
  busy,
  activeVendors,
  events,
  draftRange,
  setDraftRange,
  onCancel,
  onSubmit,
}: PurchasingCommandFormProps) {
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Governed procurement command</p>
          <h2>
            {form === "vendor"
              ? "Onboard vendor"
              : form === "order"
                ? "Open vendor order"
                : "Generate prep-list draft"}
          </h2>
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
                min={0}
                defaultValue={30}
                className="input"
                required
              />
            </label>
            <label className="field-label supply-span-2">
              Notes
              <textarea name="notes" className="input min-h-20 py-2" />
            </label>
          </>
        ) : form === "order" ? (
          <>
            <label className="field-label">
              Vendor
              <select name="vendorId" className="input" required>
                <option value="">Select vendor</option>
                {activeVendors
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Event (optional)
              <select name="eventId" className="input">
                <option value="">No event</option>
                {(events ?? [])
                  .filter((item) => item.deletedAt == null)
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title}
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
              <textarea name="notes" className="input min-h-20 py-2" />
            </label>
          </>
        ) : (
          <>
            <label className="field-label">
              Vendor
              <select name="vendorId" className="input" required>
                <option value="">Select vendor</option>
                {activeVendors
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="field-label">
              Quick range
              <div className="supply-row-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const today = new Date();
                    const start = new Date(today);
                    start.setDate(today.getDate() - 7);
                    setDraftRange({
                      start: isoDate(start),
                      end: isoDate(today),
                    });
                  }}
                >
                  Last 7 days
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const today = new Date();
                    const end = new Date(today);
                    end.setDate(today.getDate() + 7);
                    setDraftRange({
                      start: isoDate(today),
                      end: isoDate(end),
                    });
                  }}
                >
                  Upcoming 7 days
                </button>
              </div>
            </div>
            <label className="field-label">
              From
              <input
                name="rangeStart"
                type="date"
                className="input"
                required
                value={draftRange.start}
                onChange={(event) =>
                  setDraftRange((range) => ({
                    ...range,
                    start: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field-label">
              Through
              <input
                name="rangeEnd"
                type="date"
                className="input"
                required
                value={draftRange.end}
                onChange={(event) =>
                  setDraftRange((range) => ({
                    ...range,
                    end: event.target.value,
                  }))
                }
              />
            </label>
            <p className="supply-span-2 text-[12px] text-ink-2">
              Combines open prep-list purchase needs across every event in the
              selected inclusive range. The generated order remains a draft
              until you submit it.
            </p>
          </>
        )}
      </div>
    </form>
  );
}
