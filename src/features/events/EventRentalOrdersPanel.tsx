import { useState, type FormEvent } from "react";
import type { Id } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import {
  useCreateRentalOrderLine,
  useCreateVendor,
  useListEquipment,
  useListRentalOrderLine,
  useRentalOrderLineCancel,
  useRentalOrderLineConfirm,
  useRentalOrderLineMarkDelivered,
  useRentalOrderLineMarkReturned,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { useActionNotice } from "../../ui/action-result";
import { Link } from "react-router-dom";
import {
  useEventEquipmentExceptions,
  useRentalVendorChoices,
  useVenueVendorRules,
  VENUE_VENDOR_NOTE,
} from "../facilities/equipmentCheckout";
import { ADD_NEW_CHOICE, findByName } from "../inventory/inlineCatalogChoice";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import { rentalAvailability } from "../logistics/eventRequirements";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";

type RentalRow = {
  _id: string;
  version: number;
  eventId: string;
  vendorId: string;
  equipmentId?: string | null;
  description: string;
  quantity: number;
  countUnit: string;
  vendorCost: number;
  deliverBy?: number | null;
  pickupAt?: number | null;
  vendorReference?: string | null;
  status: string;
  deliveredQuantity?: number | null;
  returnedQuantity?: number | null;
  returnNote?: string | null;
  deletedAt?: number | null;
};

function toTime(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  return text ? new Date(text).getTime() : undefined;
}

function shortTime(value?: number | null): string {
  return value
    ? new Date(value).toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "not set";
}

/** Items rented from outside vendors for this event - never our own stock. */
export function EventRentalOrdersPanel({ eventId }: { eventId: Id<"events"> }) {
  const lines = useListRentalOrderLine() as RentalRow[] | undefined;
  const equipment = useListEquipment();
  const vendorChoices = useRentalVendorChoices();
  const venueRuleRows = useVenueVendorRules(eventId);
  const vendors = vendorChoices ?? [];
  const createVendor = useCreateVendor();
  // No vendors yet, or "New vendor…" picked: name one here and the rental
  // adds it first, so the rest of the form stays filled in (PR10-08).
  const [addingVendor, setAddingVendor] = useState(false);
  const typingVendor =
    addingVendor || (vendorChoices !== undefined && vendors.length === 0);
  const askVendor = useCreateRentalOrderLine();
  const confirm = useRentalOrderLineConfirm();
  const markDelivered = useRentalOrderLineMarkDelivered();
  const markReturned = useRentalOrderLineMarkReturned();
  const cancel = useRentalOrderLineCancel();
  const [showForm, setShowForm] = useState(false);
  // Approved rental items the event could not hold: one click opens the
  // form filled in with the item and the missing count.
  const exceptions = useEventEquipmentExceptions(eventId) as
    | {
        notHeld?: Array<{
          equipmentId: string;
          name: string;
          approved: number;
          held: number;
          fromVendor: number;
        }>;
      }
    | null
    | undefined;
  const short = (exceptions?.notHeld ?? []).map((row) => ({
    equipmentId: row.equipmentId,
    name: row.name,
    missing: row.approved - row.held - row.fromVendor,
  }));
  const [prefill, setPrefill] = useState<(typeof short)[number] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
  const { prompt, host } = useActionPrompt(busy != null);

  const vendorName = new Map(vendors.map((v) => [String(v.vendorId), v.name]));
  const venueRules = new Map(
    (venueRuleRows ?? []).map((rule) => [rule.vendorId, rule.status]),
  );
  const [pickedVendor, setPickedVendor] = useState("");
  const rentedItems = (equipment ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.status === "active" &&
      row.ownership === "rented",
  );
  const eventLines = (lines ?? []).filter(
    (row) => row.eventId === eventId && row.deletedAt == null,
  );
  const cost = eventLines
    .filter((row) => row.status !== "cancelled")
    .reduce((sum, row) => sum + Number(row.vendorCost ?? 0), 0);

  const run = async (key: string, work: () => Promise<unknown>) => {
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

  const submit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    const equipmentId =
      String(data.get("equipmentId") ?? "") ||
      String(data.get("approvedEquipmentId") ?? "");
    const item = rentedItems.find((row) => row._id === equipmentId);
    const newVendorName = String(data.get("newVendorName") ?? "").trim();
    const pickedVendorId =
      String(data.get("vendorId") ?? "") || String(item?.vendorId ?? "");
    const description =
      String(data.get("description") ?? "").trim() || item?.name || "";
    const costText = String(data.get("vendorCost") ?? "").trim();
    // Keep the typed vendor box after a failed save, even once the vendor it
    // added shows up in the list, so a retry sends the same name.
    if (newVendorName) setAddingVendor(true);
    void run("ask", async () => {
      // A retry, or a teammate, may already have added this name: reuse it.
      const vendorId = newVendorName
        ? String(
            findByName(vendors, newVendorName)?.vendorId ??
              (
                (await createVendor({
                  name: newVendorName,
                  paymentTermsDays: 30,
                })) as { docId: string }
              ).docId,
          )
        : pickedVendorId;
      await askVendor({
        eventId,
        vendorId,
        equipmentId: equipmentId || undefined,
        description,
        quantity: Number(data.get("quantity")),
        countUnit: item?.countUnit ?? undefined,
        vendorCost: costText ? Number(costText) : undefined,
        deliverBy: toTime(data.get("deliverBy")),
        pickupAt: toTime(data.get("pickupAt")),
      });
      form.reset();
      setAddingVendor(false);
      setShowForm(false);
      setPrefill(null);
      setNotice("Rental added. Mark it confirmed when the vendor says yes.");
    });
  };

  const act = (row: RentalRow, action: string) => {
    const base = { docId: row._id, version: row.version };
    void run(`${row._id}:${action}`, async () => {
      if (action === "confirm") {
        const values = await prompt.askFields({
          title: `Vendor confirmed ${row.description}?`,
          description: "Add the vendor's order number if they gave one.",
          fields: [{ name: "reference", label: "Vendor order number" }],
          confirmLabel: "Mark confirmed",
        });
        if (!values) return;
        await confirm({
          ...base,
          vendorReference: values.reference?.trim() || undefined,
        });
      }
      if (action === "arrived") {
        const values = await prompt.askFields({
          title: `How many ${row.description} arrived?`,
          description: "Enter the count that came off the vendor's truck.",
          fields: [
            {
              name: "count",
              label: "Arrived",
              inputType: "number",
              defaultValue: String(row.quantity),
              required: true,
            },
          ],
          confirmLabel: "Save count",
        });
        if (!values) return;
        await markDelivered({
          ...base,
          deliveredQuantity: Number(values.count),
        });
      }
      if (action === "returned") {
        const came = row.deliveredQuantity ?? row.quantity;
        const values = await prompt.askFields({
          title: `How many ${row.description} went back?`,
          description:
            "Anything short is what the vendor will bill as missing or broken.",
          fields: [
            {
              name: "count",
              label: "Sent back",
              inputType: "number",
              defaultValue: String(came),
              required: true,
            },
            { name: "note", label: "What happened (if any are short)" },
          ],
          confirmLabel: "Save return",
        });
        if (!values) return;
        await markReturned({
          ...base,
          returnedQuantity: Number(values.count),
          note: values.note?.trim() || undefined,
        });
      }
      if (action === "cancel") {
        const values = await prompt.askFields({
          title: `Cancel ${row.description}?`,
          description: "Tell the vendor too. The line stays in the history.",
          fields: [{ name: "reason", label: "Why (if you want to say)" }],
          confirmLabel: "Cancel rental",
        });
        if (!values) return;
        await cancel({ ...base, reason: values.reason?.trim() || undefined });
      }
    });
  };

  return (
    <section className="card space-y-4 p-5" aria-labelledby="rentals-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="rentals-title" className="text-lg font-semibold text-ink">
            Rented from vendors
          </h2>
          <p className="text-sm text-ink-2">
            Items an outside company brings for this event. They are not our
            stock and never count against our equipment.
          </p>
        </div>
        <span className="text-sm text-ink-3">
          Vendor cost {formatMoney(cost)}
        </span>
      </div>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="banner banner-ok" role="status">
          {notice}
        </p>
      ) : null}
      {host}
      {lines === undefined ? null : eventLines.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing rented for this event.</p>
      ) : (
        <ul className="divide-y divide-line">
          {eventLines.map((row) => (
            <li
              key={row._id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div>
                <strong className="text-ink">
                  {row.quantity} {row.countUnit} · {row.description}
                </strong>
                <div className="text-xs text-ink-3">
                  {vendorName.get(String(row.vendorId)) ?? "Vendor"}
                  {row.vendorReference ? ` · order ${row.vendorReference}` : ""}
                  {` · drop-off ${shortTime(row.deliverBy)} · pick-up ${shortTime(row.pickupAt)}`}
                  {` · ${formatMoney(row.vendorCost)}`}
                </div>
                <div className="text-xs text-ink-2">
                  {rentalAvailability({
                    id: row._id,
                    description: row.description,
                    vendorName: "",
                    quantity: row.quantity,
                    countUnit: row.countUnit,
                    status: row.status,
                    deliveredQuantity: row.deliveredQuantity,
                    returnedQuantity: row.returnedQuantity,
                  })}
                  {row.returnNote ? ` · ${row.returnNote}` : ""}
                </div>
              </div>
              <div className="supply-row-actions">
                {row.status === "requested" ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() => act(row, "confirm")}
                  >
                    Confirmed
                  </button>
                ) : null}
                {row.status === "requested" || row.status === "confirmed" ? (
                  <>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => act(row, "arrived")}
                    >
                      Arrived
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => act(row, "cancel")}
                    >
                      Cancel
                    </button>
                  </>
                ) : null}
                {row.status === "delivered" ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() => act(row, "returned")}
                  >
                    Sent back
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!showForm && short.length > 0 ? (
        <div className="supply-row-actions">
          {short.map((row) => (
            <button
              key={row.equipmentId}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setPrefill(row);
                setShowForm(true);
              }}
            >
              Rent {row.missing} {row.name} from a vendor
            </button>
          ))}
        </div>
      ) : null}
      {showForm ? (
        <form
          key={prefill?.equipmentId ?? "blank"}
          className="supply-form"
          onSubmit={submit}
        >
          {prefill ? (
            <input
              type="hidden"
              name="approvedEquipmentId"
              value={prefill.equipmentId}
            />
          ) : null}
          <div className="supply-form-grid">
            <label className="field-label">
              From our rental list
              <select name="equipmentId" className="input" defaultValue="">
                <option value="">Not on our list</option>
                {rentedItems.map((row) => (
                  <option key={row._id} value={row._id}>
                    {row.name}
                  </option>
                ))}
              </select>
              {equipment !== undefined && rentedItems.length === 0 ? (
                <span className="field-hint">
                  Nothing on the rental list yet. Type what it is below, or{" "}
                  <Link
                    to="/facilities/equipment"
                    target="_blank"
                    rel="noopener"
                    className="underline font-medium"
                  >
                    add it to the equipment list
                  </Link>{" "}
                  (opens a new tab; this form stays filled in).
                </span>
              ) : null}
            </label>
            <label className="field-label">
              What it is
              <input
                name="description"
                className="input"
                placeholder="Blank uses the list item's name"
                defaultValue={prefill?.name ?? ""}
              />
            </label>
            {typingVendor ? (
              <label className="field-label">
                Vendor
                <input
                  name="newVendorName"
                  className="input"
                  placeholder="e.g. Party Rentals Co"
                  autoComplete="off"
                  required
                />
                <span className="field-hint">
                  {vendors.length === 0
                    ? "No vendors yet. Name one here and this rental adds it."
                    : "Name the new vendor. This rental adds it; add contact details later."}
                  {vendors.length > 0 ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="underline font-medium"
                        onClick={() => setAddingVendor(false)}
                      >
                        Pick an existing vendor
                      </button>
                    </>
                  ) : null}
                </span>
              </label>
            ) : (
              <label className="field-label">
                Vendor
                <select
                  name="vendorId"
                  className="input"
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value === ADD_NEW_CHOICE)
                      setAddingVendor(true);
                    setPickedVendor(event.target.value);
                  }}
                >
                  <option value="">The list item's vendor</option>
                  {vendors.map((vendor) => {
                    const rule = venueRules.get(String(vendor.vendorId));
                    return (
                      <option
                        key={vendor.vendorId}
                        value={vendor.vendorId}
                        disabled={rule === "banned"}
                      >
                        {vendor.name}
                        {rule ? VENUE_VENDOR_NOTE[rule] : ""}
                      </option>
                    );
                  })}
                  <option value={ADD_NEW_CHOICE}>New vendor…</option>
                </select>
                {venueRules.get(pickedVendor) === "restricted" ? (
                  <span className="text-xs text-warn" role="status">
                    This venue restricts this vendor. Check with the venue
                    before you book.
                  </span>
                ) : null}
              </label>
            )}
            <label className="field-label">
              How many
              <input
                name="quantity"
                className="input"
                type="number"
                min={1}
                step={1}
                defaultValue={prefill?.missing ?? 1}
                required
              />
            </label>
            <label className="field-label">
              Vendor cost (whole line)
              <input
                name="vendorCost"
                className="input"
                type="number"
                min={0}
                step="any"
              />
            </label>
            <label className="field-label">
              Drop-off by
              <BoundedDateTimeLocalInput name="deliverBy" className="input" />
            </label>
            <label className="field-label">
              Pick-up
              <BoundedDateTimeLocalInput name="pickupAt" className="input" />
            </label>
          </div>
          <div className="supply-row-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setShowForm(false);
                setPrefill(null);
              }}
            >
              Close
            </button>
            <button className="btn btn-primary" disabled={busy != null}>
              Add rental
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setPrefill(null);
            setShowForm(true);
          }}
        >
          Rent from a vendor
        </button>
      )}
    </section>
  );
}
