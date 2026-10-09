import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateLeftoverDisposition,
  useLeftoverDispositionRemove,
  useLeftoverDispositionRevise,
} from "../../lib/manifest-convex-react";
import { useEventLeftovers } from "../../lib/financeScopedQueries";
import { formatMoneyExact } from "../../lib/format";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import {
  LEFTOVER_DISPOSITION_LABELS,
  activeLeftovers,
  formatPounds,
  leftoverValuesFromForm,
  todayDateKey,
  type LeftoverDisposition,
  type LeftoverDispositionKind,
} from "./leftoverDispositions";

/**
 * Closeout step: what happened to the food left over from one event.
 * Donations name the organization and the weight so the yearly donation
 * summary has what the tax file and Good Samaritan records need.
 */
export function LeftoverDispositionPanel({ eventId }: { eventId: string }) {
  const rows = useEventLeftovers(eventId) as LeftoverDisposition[] | undefined;
  const create = useCreateLeftoverDisposition();
  const revise = useLeftoverDispositionRevise();
  const remove = useLeftoverDispositionRemove();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const eventRows = activeLeftovers(rows).filter(
    (row) => String(row.eventId) === eventId,
  );

  const run = async (work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
      setEditing(null);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const submit =
    (row: LeftoverDisposition | null) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const values = leftoverValuesFromForm(new FormData(event.currentTarget));
      void run(() =>
        row
          ? revise({ docId: row._id, version: row.version, ...values })
          : create({ eventId, ...values }),
      );
    };

  return (
    <section aria-label="Leftover food" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-semibold">Leftover food</h3>
          <p className="text-sm text-ink-2">
            Record what happened to the leftovers: donated, returned to stock,
            or thrown out. Donations show on the{" "}
            <Link className="text-link" to={FINANCE_ROUTES.donations}>
              yearly donation summary
            </Link>
            .
          </p>
        </div>
        {editing !== "new" ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => setEditing("new")}
          >
            Add leftovers
          </button>
        ) : null}
      </div>
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {editing === "new" ? (
        <LeftoverForm
          busy={busy}
          pastDonations={rows ?? []}
          onSubmit={submit(null)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {rows === undefined ? (
        <p className="text-sm text-ink-3">Loading leftovers…</p>
      ) : eventRows.length === 0 ? (
        <p className="text-sm text-ink-3">No leftovers recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {eventRows.map((row) =>
            editing === row._id ? (
              <li key={row._id}>
                <LeftoverForm
                  row={row}
                  busy={busy}
                  pastDonations={rows ?? []}
                  onSubmit={submit(row)}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li
                key={row._id}
                className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-2"
              >
                <div className="text-sm">
                  <strong>
                    {LEFTOVER_DISPOSITION_LABELS[row.disposition]}
                  </strong>{" "}
                  · {row.itemDescription} · {formatPounds(row.weightLb)}
                  {row.estimatedValue != null
                    ? ` · ${formatMoneyExact(row.estimatedValue)}`
                    : ""}
                  <span className="block text-ink-2">
                    {row.dispositionDate}
                    {row.recipientOrganization
                      ? ` · to ${row.recipientOrganization}`
                      : ""}
                    {row.disposition === "donated"
                      ? row.receiptReference
                        ? ` · receipt ${row.receiptReference}`
                        : " · no receipt yet"
                      : ""}
                  </span>
                </div>
                <div className="supply-row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => setEditing(row._id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        remove({ docId: row._id, version: row.version }),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function LeftoverForm({
  row,
  busy,
  pastDonations,
  onSubmit,
  onCancel,
}: {
  row?: LeftoverDisposition;
  busy: boolean;
  pastDonations: readonly LeftoverDisposition[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<LeftoverDispositionKind>(
    row?.disposition ?? "donated",
  );
  const donated = kind === "donated";
  // Kitchens donate to the same few food banks: offer them by name and fill
  // in their tax ID, address and contact from the last donation to them.
  const recipients = new Map<string, LeftoverDisposition>();
  for (const past of pastDonations) {
    const name = past.recipientOrganization?.trim();
    if (name && past.deletedAt == null) recipients.set(name, past);
  }
  const fillRecipient = (input: HTMLInputElement) => {
    const known = recipients.get(input.value.trim());
    const form = input.form;
    if (!known || !form) return;
    const fill = (name: string, value: string | null | undefined) => {
      const field = form.elements.namedItem(name) as HTMLInputElement | null;
      if (field && !field.value && value) field.value = value;
    };
    fill("recipientEin", known.recipientEin);
    fill("recipientAddress", known.recipientAddress);
    fill("recipientContact", known.recipientContact);
  };
  const listId = `leftover-recipients-${row?._id ?? "new"}`;
  return (
    <form
      onSubmit={onSubmit}
      aria-label={row ? "Edit leftovers" : "Add leftovers"}
      className="bg-panel border border-line rounded-sm p-3 space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="field-label">
          What happened *
          <select
            name="disposition"
            className="input"
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as LeftoverDispositionKind)
            }
          >
            {Object.entries(LEFTOVER_DISPOSITION_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="field-label sm:col-span-2">
          Food *
          <input
            name="itemDescription"
            className="input"
            required
            defaultValue={row?.itemDescription ?? ""}
            placeholder="e.g. Chicken piccata, 2 hotel pans"
          />
        </label>
        <label className="field-label">
          Date *
          <BoundedDateInput
            naturalDateDirection="any"
            name="dispositionDate"
            className="input"
            required
            defaultValue={row?.dispositionDate ?? todayDateKey()}
          />
        </label>
        <label className="field-label">
          Weight (lb){donated ? " *" : ""}
          <input
            name="weightLb"
            type="number"
            min={0}
            step="0.1"
            className="input"
            required={donated}
            defaultValue={row?.weightLb ?? ""}
          />
        </label>
        <label className="field-label">
          Value ($)
          <input
            name="estimatedValue"
            type="number"
            min={0}
            step="0.01"
            className="input"
            defaultValue={row?.estimatedValue ?? ""}
          />
        </label>
        {donated ? (
          <>
            <label className="field-label sm:col-span-2">
              Recipient organization *
              <input
                name="recipientOrganization"
                className="input"
                required
                list={listId}
                defaultValue={row?.recipientOrganization ?? ""}
                placeholder="e.g. City Harvest Food Bank"
                onChange={(event) => fillRecipient(event.currentTarget)}
              />
              <datalist id={listId}>
                {[...recipients.keys()].map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="field-label">
              Recipient tax ID (EIN)
              <input
                name="recipientEin"
                className="input"
                defaultValue={row?.recipientEin ?? ""}
              />
            </label>
            <label className="field-label">
              Receipt number
              <input
                name="receiptReference"
                className="input"
                defaultValue={row?.receiptReference ?? ""}
              />
            </label>
            <label className="field-label sm:col-span-2">
              Recipient address
              <input
                name="recipientAddress"
                className="input"
                defaultValue={row?.recipientAddress ?? ""}
              />
            </label>
            <label className="field-label">
              Recipient contact
              <input
                name="recipientContact"
                className="input"
                defaultValue={row?.recipientContact ?? ""}
              />
            </label>
          </>
        ) : null}
        <label className="field-label sm:col-span-2">
          Handling
          <input
            name="handlingNote"
            className="input"
            defaultValue={row?.handlingNote ?? ""}
            placeholder="e.g. Held at 140°F, out of holding 45 min"
          />
        </label>
        <label className="field-label sm:col-span-2">
          Note
          <input name="note" className="input" defaultValue={row?.note ?? ""} />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={busy}
        >
          {busy ? "Saving…" : row ? "Save changes" : "Save leftovers"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
