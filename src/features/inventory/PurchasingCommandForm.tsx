import { useState, type FormEvent } from "react";
import { SearchSelect } from "../../ui/SearchSelect";
import { ADD_NEW_CHOICE } from "./inlineCatalogChoice";
import { VENDOR_CONTACT_ROLES } from "./vendorContactRoles";
import { suggestOrderNumber } from "./vendorOrderNumber";
import { useWorkingEventId } from "../events/workingEvent";

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

export type PurchasingFormKind = "vendor" | "order" | "contact";

export type PurchasingCommandFormProps = {
  form: PurchasingFormKind;
  busy: boolean;
  activeVendors: VendorOption[];
  /** True while the vendor list has not loaded yet. */
  vendorsLoading?: boolean;
  events: EventOption[] | undefined;
  contactVendorId?: string | null;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Field name the order form reads when a new vendor is typed inline. */
export const NEW_VENDOR_FIELD = "newVendorName";

/**
 * Vendor for a new order. No vendors yet, or "New vendor…" picked: the field
 * becomes a name box and the order creates that vendor first, so the rest of
 * the order form stays filled in (PR04-09).
 */
function OrderVendorField({
  vendors,
  loading,
}: {
  vendors: VendorOption[];
  loading: boolean;
}) {
  const [adding, setAdding] = useState(false);
  if (loading) {
    return (
      <label className="field-label">
        Vendor
        <select name="vendorId" className="input" required disabled>
          <option value="">Loading vendors…</option>
        </select>
      </label>
    );
  }
  if (vendors.length === 0 || adding) {
    return (
      <label className="field-label">
        Vendor
        <input
          name={NEW_VENDOR_FIELD}
          className="input"
          placeholder="e.g. Sysco"
          autoComplete="off"
          required
          autoFocus
          data-testid="order-new-vendor"
        />
        <span className="field-hint">
          {vendors.length === 0
            ? "No vendors yet. Name one here and this order adds it."
            : "Name the new vendor. This order adds it; add contact details later."}
          {vendors.length > 0 ? (
            <>
              {" "}
              <button
                type="button"
                className="underline font-medium"
                onClick={() => setAdding(false)}
              >
                Pick an existing vendor
              </button>
            </>
          ) : null}
        </span>
      </label>
    );
  }
  return (
    <label className="field-label">
      Vendor
      <SearchSelect
        name="vendorId"
        required
        recentsKey="vendor"
        placeholder="Search vendors…"
        defaultValue={vendors.length === 1 ? vendors[0]!._id : ""}
        onChange={(id) => {
          if (id === ADD_NEW_CHOICE) setAdding(true);
        }}
        options={[
          ...vendors.map((vendor) => ({ id: vendor._id, label: vendor.name })),
          { id: ADD_NEW_CHOICE, label: "New vendor…" },
        ]}
      />
    </label>
  );
}

const FORM_TITLES: Record<PurchasingFormKind, string> = {
  vendor: "Onboard vendor",
  order: "Open vendor order",
  contact: "Add vendor contact",
};

export function PurchasingCommandForm({
  form,
  busy,
  activeVendors,
  vendorsLoading,
  events,
  contactVendorId,
  onCancel,
  onSubmit,
}: PurchasingCommandFormProps) {
  const workingId = useWorkingEventId();
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Purchasing</p>
          <h2>{FORM_TITLES[form]}</h2>
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
        ) : form === "contact" ? (
          <>
            <label className="field-label">
              Vendor
              <SearchSelect
                name="vendorId"
                recentsKey="vendor"
                placeholder="Search vendors…"
                defaultValue={contactVendorId ?? ""}
                required
                options={activeVendors.map((vendor) => ({
                  id: vendor._id,
                  label: vendor.name,
                }))}
              />
            </label>
            <label className="field-label">
              Contact name
              <input name="name" className="input" required autoFocus />
            </label>
            <label className="field-label">
              Role
              <select name="role" className="input" defaultValue="general">
                {VENDOR_CONTACT_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Phone
              <input name="phone" className="input" />
            </label>
            <label className="field-label">
              Email
              <input name="email" type="email" className="input" />
            </label>
            <label className="field-label supply-span-2">
              Notes
              <textarea name="notes" className="input" rows={2} />
            </label>
          </>
        ) : (
          <>
            <OrderVendorField
              loading={vendorsLoading === true}
              vendors={activeVendors.filter(
                (vendor) => vendor.status === "active",
              )}
            />
            <label className="field-label">
              Event (optional)
              <select
                key={events?.length ? "events-ready" : "events-loading"}
                name="eventId"
                className="input"
                defaultValue={workingId ?? ""}
              >
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
              {/* Prefilled so manual orders never land as "Unnumbered order";
                  still editable to match a vendor's own PO scheme. */}
              <input
                name="orderNumber"
                className="input"
                defaultValue={suggestOrderNumber()}
              />
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
