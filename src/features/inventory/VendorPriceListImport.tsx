// Bring in a vendor price list (CSV). New vendors are added, each row becomes
// or updates that vendor's item for one ingredient, and a new price keeps the
// old one in the item's history. Reading the same file again changes nothing.
import { useState, type ChangeEvent } from "react";
import { useImportVendorPriceRows } from "../facilities/vendorPriceList";
import { formatCountNoun } from "../../lib/format";
import { parseCsv } from "../../lib/tppMenuCsv";

const CHUNK_SIZE = 200;
const SHOWN_PROBLEMS = 20;

/** Header row + body rows → one object per row, keyed by the sheet's headers. */
function sheetRows(text: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(text).filter((cells) =>
    cells.some((cell) => cell.trim() !== ""),
  );
  if (!header) return [];
  return body.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name.trim(), cells[i] ?? ""])),
  );
}

type Problem = { row: number; reason: string };

export function VendorPriceListImport() {
  const importRows = useImportVendorPriceRows();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setMessage("");
    setProblems([]);
    setBusy(true);
    const total = {
      vendorsAdded: 0,
      added: 0,
      updated: 0,
      unchanged: 0,
      pastPrices: 0,
    };
    const found: Problem[] = [];
    try {
      const rows = sheetRows(await file.text());
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const part = rows.slice(i, i + CHUNK_SIZE);
        setMessage(
          `Reading ${Math.min(i + part.length, rows.length)} of ${rows.length} rows…`,
        );
        const result = await importRows({ rows: part, firstRowNumber: i + 2 });
        total.vendorsAdded += result.vendorsAdded;
        total.added += result.added;
        total.updated += result.updated;
        total.unchanged += result.unchanged;
        total.pastPrices += result.pastPrices;
        found.push(...result.problems);
      }
      setProblems(found);
      setMessage(
        rows.length === 0
          ? "No rows found in the file."
          : [
              `${formatCountNoun(total.added, "item")} added`,
              `${total.updated} updated`,
              `${total.unchanged} already up to date`,
              total.pastPrices > 0
                ? `${formatCountNoun(total.pastPrices, "older price")} kept in price history`
                : "",
              total.vendorsAdded > 0
                ? formatCountNoun(total.vendorsAdded, "new vendor")
                : "",
              found.length > 0
                ? `${formatCountNoun(found.length, "row")} not read`
                : "",
            ]
              .filter(Boolean)
              .join(", ") + ".",
      );
    } catch (cause: unknown) {
      const reason =
        cause instanceof Error ? cause.message : "The import did not work.";
      // Rows saved before the stop are kept; reading the file again skips them.
      setError(
        total.added + total.updated > 0
          ? `${reason} Rows saved before it stopped are kept. Read the file again to finish; saved rows are not added twice.`
          : reason,
      );
      setMessage("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="working-ledger mt-10">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Vendors · Price list</p>
          <h2>Bring in a vendor price list</h2>
          <p className="text-xs text-ink-2">
            A CSV with Vendor, Item name, Pack amount and Pack unit columns,
            plus any of: Item number, Ingredient, Pack price, Price date. Each
            row is one item a vendor sells for one ingredient. New vendors are
            added. A new price keeps the old one in the item&apos;s history. To
            bring in old prices, put one row per price with its Price date: the
            newest becomes the price, older ones go into the history. Reading
            the same file again changes nothing.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <label className="field-label max-w-full min-w-0">
          Price list
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            disabled={busy}
            className="max-w-full text-xs"
          />
        </label>
      </div>
      {message ? (
        <p className="px-4 pb-3 text-xs text-ink-2" role="status">
          {message}
        </p>
      ) : null}
      {problems.length > 0 ? (
        <ul className="px-4 pb-3 text-xs text-ink-2">
          {problems.slice(0, SHOWN_PROBLEMS).map((problem) => (
            <li key={problem.row}>
              Row {problem.row}: {problem.reason}
            </li>
          ))}
          {problems.length > SHOWN_PROBLEMS ? (
            <li>And {problems.length - SHOWN_PROBLEMS} more rows.</li>
          ) : null}
        </ul>
      ) : null}
      {error ? (
        <p className="px-4 pb-3 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
