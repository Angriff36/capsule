import { useState } from "react";
import { useListTaxRate } from "../../lib/manifest-convex-react";
import { useSetVenueTaxRates } from "../../lib/venueTaxRateQueries";
import { reportActionFail, reportActionOk } from "../../ui/action-result";
import type { Id } from "../../lib/api";

/**
 * The sales tax charged at this venue (TPP's tax location). With none
 * ticked, a bill here uses every active company rate.
 */
export function VenueTaxRatesPanel({
  venue,
}: {
  venue: {
    _id: string;
    version: number;
    taxRateIds?: (string | null)[] | null;
  };
}) {
  const allRates = useListTaxRate();
  const rates = (allRates ?? []).filter(
    (rate) => rate.deletedAt == null && rate.active === true,
  );
  const setTaxRates = useSetVenueTaxRates();
  const saved = (venue.taxRateIds ?? []).filter(
    (id): id is string => typeof id === "string",
  );
  const [picked, setPicked] = useState<string[]>(saved);
  const [busy, setBusy] = useState(false);
  // Only rates shown here can be saved: a paused or removed rate left on the
  // venue is dropped by the next save instead of riding along unseen.
  const shown = new Set(rates.map((rate) => String(rate._id)));
  const toSave = picked.filter((id) => shown.has(id));
  const changed =
    toSave.length !== saved.length || saved.some((id) => !toSave.includes(id));

  // Nothing to save until the rates are known.
  if (allRates === undefined) return null;
  return (
    <section className="mt-6 rounded-sm border border-line bg-panel p-4">
      <h2 className="text-lg font-semibold text-ink">
        Sales tax at this venue
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {saved.length === 0
          ? "Bills for events here use every active company tax rate. Tick the rates that apply here if this venue is in another town or county."
          : "Bills for events here use only the ticked rates."}
      </p>
      {rates.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">
          No active tax rates yet. Add them under Finance → Tax.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rates.map((rate) => (
            <li key={rate._id}>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={picked.includes(String(rate._id))}
                  disabled={busy}
                  onChange={(event) =>
                    setPicked((current) =>
                      event.target.checked
                        ? [...current, String(rate._id)]
                        : current.filter((id) => id !== String(rate._id)),
                    )
                  }
                />
                {rate.name} ({Number(rate.percentage)}%)
              </label>
            </li>
          ))}
        </ul>
      )}
      {changed ? (
        <button
          type="button"
          className="btn btn-primary btn-sm mt-3"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void setTaxRates({
              venueId: venue._id as Id<"venues">,
              taxRateIds: toSave as Id<"taxRates">[],
            })
              .then(() =>
                reportActionOk(
                  toSave.length === 0
                    ? "This venue uses every active company tax rate again."
                    : "Tax rates for this venue saved.",
                ),
              )
              .catch((error) =>
                reportActionFail(
                  error instanceof Error
                    ? error.message
                        .replace(/^.*(ConvexError|Uncaught Error): /, "")
                        .split("\n")[0]!
                    : "Couldn't save the tax rates.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Saving…" : "Save tax rates"}
        </button>
      ) : null}
    </section>
  );
}
