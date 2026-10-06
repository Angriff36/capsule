import { SearchSelect } from "../../ui/SearchSelect";
import { useState, type FormEvent } from "react";
import {
  useCreateEquipmentIssue,
  useEquipmentIssueSettle,
  useListEquipmentIssue,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { useActionNotice } from "../../ui/action-result";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import { useRentalVendorChoices } from "./equipmentCheckout";

type EquipmentRow = {
  _id: string;
  name: string;
  assetTag: string;
  status: string;
  deletedAt?: number | null;
};

const KIND_LABEL: Record<string, string> = {
  damaged: "Broken",
  missing: "Missing",
  cleaning: "Needs cleaning",
  repair: "Repair",
  late_return: "Late back",
  vendor_return: "Short to rental company",
};

const SEVERITY_LABEL: Record<string, string> = {
  low: "Minor",
  medium: "Normal",
  high: "Urgent",
};

const due = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/**
 * CF-11.4 / PL-RETURNS: open equipment problems across the catalog - what is
 * wrong, how bad, how many, who is on it, when it is due, what it costs - and
 * a form to report one by hand. "Out of use until fixed" keeps those units
 * from being booked; marking it sorted out puts them back.
 */
export function EquipmentRepairsPanel({
  equipment,
}: {
  equipment: readonly EquipmentRow[];
}) {
  const issues = useListEquipmentIssue();
  const vendors = useRentalVendorChoices();
  const raise = useCreateEquipmentIssue();
  const settle = useEquipmentIssueSettle();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();

  const names = new Map(equipment.map((row) => [String(row._id), row.name]));
  const open = (issues ?? [])
    .filter((row) => row.deletedAt == null && row.status === "open")
    .sort(
      (a, b) =>
        Number(a.dueAt ?? Number.MAX_SAFE_INTEGER) -
        Number(b.dueAt ?? Number.MAX_SAFE_INTEGER),
    );
  const active = equipment.filter(
    (row) => row.deletedAt == null && row.status === "active",
  );

  const run = (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setFailure(null);
    setNotice(null);
    void work()
      .then(() => setNotice(done))
      .catch(setFailure)
      .finally(() => setBusy(false));
  };

  const submit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const number = (key: string) =>
      text(key) === "" ? undefined : Number(text(key));
    const dueAt = text("dueAt");
    run(async () => {
      await raise({
        kind: "repair",
        equipmentId: text("equipmentId"),
        description: text("description"),
        severity: text("severity") || undefined,
        quantity: number("quantity"),
        holdsUnits: data.get("holdsUnits") === "on",
        dueAt: dueAt ? new Date(dueAt).getTime() : undefined,
        ownerName: text("ownerName") || undefined,
        vendorId: text("vendorId") || undefined,
        cost: number("cost"),
        notes: text("notes") || undefined,
      });
      form.reset();
      setShowForm(false);
    }, "Problem recorded.");
  };

  const markSorted = (row: (typeof open)[number]) =>
    run(
      () =>
        settle({
          docId: row._id,
          version: row.version,
          resolution: "Fixed and back in use",
        }),
      "Marked sorted out. The units can be booked again.",
    );

  return (
    <section
      className="card space-y-3 p-5"
      aria-labelledby="equipment-repairs-title"
      data-testid="equipment-repairs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="equipment-repairs-title"
          className="text-lg font-semibold text-ink"
        >
          Equipment problems
        </h2>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowForm((value) => !value)}
        >
          {showForm ? "Close form" : "Report a problem"}
        </button>
      </div>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="text-sm text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      {showForm ? (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <label className="field-label">
            Equipment
            <SearchSelect
              name="equipmentId"
              required
              placeholder="Type a name or tag…"
              aria-label="Equipment"
              recentsKey="equipment-repair"
              options={active.map((row) => ({
                id: row._id,
                label: row.name,
                hint: row.assetTag,
              }))}
            />
          </label>
          <label className="field-label">
            What is wrong
            <input name="description" className="input" required />
          </label>
          <label className="field-label">
            How bad
            <select name="severity" className="input" defaultValue="medium">
              {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            How many
            <input
              name="quantity"
              type="number"
              min={1}
              defaultValue={1}
              className="input"
            />
          </label>
          <label className="field-label">
            Fix by
            <BoundedDateTimeLocalInput name="dueAt" className="input" />
          </label>
          <label className="field-label">
            Who is on it
            <input
              name="ownerName"
              className="input"
              placeholder="Optional: a name"
            />
          </label>
          <label className="field-label">
            Repair company
            <select name="vendorId" className="input">
              <option value="">None</option>
              {(vendors ?? []).map((vendor) => (
                <option key={vendor.vendorId} value={vendor.vendorId}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Cost
            <input
              name="cost"
              type="number"
              min={0}
              step="0.01"
              className="input"
            />
          </label>
          <label className="field-label sm:col-span-2">
            Notes
            <input name="notes" className="input" />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" name="holdsUnits" defaultChecked />
            Out of use until fixed (can't be booked)
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" disabled={busy}>
              Save problem
            </button>
          </div>
        </form>
      ) : null}

      {issues === undefined ? null : open.length === 0 ? (
        <p className="text-sm text-ink-3">No open equipment problems.</p>
      ) : (
        <ul className="divide-y divide-line">
          {open.map((row) => (
            <li
              key={row._id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-2"
            >
              <span className="text-ink">
                <strong>{KIND_LABEL[row.kind] ?? row.kind}</strong> ·{" "}
                {names.get(String(row.equipmentId)) ?? "Rented item"} ·{" "}
                {row.description}
                <span className="text-sm text-ink-2">
                  {" · "}
                  {SEVERITY_LABEL[row.severity] ?? row.severity}
                  {row.holdsUnits ? ` · ${row.quantity} out of use` : ""}
                  {row.dueAt ? ` · fix by ${due.format(row.dueAt)}` : ""}
                  {row.ownerName ? ` · ${row.ownerName}` : ""}
                  {row.cost != null ? ` · ${formatMoneyExact(row.cost)}` : ""}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => markSorted(row)}
              >
                Sorted out
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
