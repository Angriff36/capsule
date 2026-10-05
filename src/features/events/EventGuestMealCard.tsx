import {
  kitchenCountSheetCsv,
  placeCardListCsv,
  type EntreeLine,
  type GuestMealCounts,
  type PlatedGuest,
} from "./guestMealCounts";

function download(fileName: string, csv: string) {
  const url = URL.createObjectURL(
    new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Plated service: live entrée counts from guest picks, one action that
 * writes them to the menu lines (which drives prep and purchasing demand),
 * and the kitchen count sheet / place-card exports.
 */
export function EventGuestMealCard({
  counts,
  guests,
  lines,
  busy,
  onApplyCounts,
}: {
  counts: GuestMealCounts;
  guests: readonly PlatedGuest[];
  lines: readonly EntreeLine[];
  busy: boolean;
  onApplyCounts: () => void;
}) {
  const outOfSync = counts.rows.some((row) => row.outOfSync);
  const picked = counts.rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="card p-4" data-testid="guest-meal-counts">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Plated entrée counts</p>
          <p className="mt-0.5 text-sm text-ink-3">
            {picked} of {counts.eating} guests picked an entrée
            {counts.unchosen > 0 ? ` · ${counts.unchosen} still to pick` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() =>
            download(
              "kitchen-count-sheet.csv",
              kitchenCountSheetCsv(counts, guests, lines),
            )
          }
        >
          Kitchen count sheet
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() =>
            download("place-cards.csv", placeCardListCsv(guests, lines))
          }
        >
          Place cards
        </button>
      </div>
      {counts.rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">
          Add main-course dishes on the Menu tab to take entrée picks.
        </p>
      ) : (
        <>
          <table className="mt-3 w-full">
            <thead>
              <tr>
                <th className="th">Entrée</th>
                <th className="th text-right">Guests</th>
                <th className="th text-right">Menu servings</th>
              </tr>
            </thead>
            <tbody>
              {counts.rows.map((row) => (
                <tr key={row.line.id}>
                  <td className="td text-sm text-ink">{row.line.name}</td>
                  <td className="td text-right font-mono text-sm">
                    {row.count}
                  </td>
                  <td
                    className={`td text-right font-mono text-sm ${row.outOfSync ? "text-warn" : "text-ink-3"}`}
                  >
                    {row.line.quantityServings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {outOfSync ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-sm text-ink-3">
                Menu servings differ from the guest picks. Prep and purchasing
                use menu servings.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={onApplyCounts}
              >
                Use guest counts for the kitchen
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
