// Import a stock count sheet (CSV). Every row lands on the opening stock list
// below for review; nothing changes on-hand stock until a person uses a row.
import { useState, type ChangeEvent } from "react";
import { useImportStockFile } from "../facilities/openingStock";
import { readOpeningStockRow } from "../../lib/openingStock";
import { parseCsv } from "../../lib/tppMenuCsv";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

const CHUNK_SIZE = 500;

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

export function OpeningStockImport() {
  const importFile = useImportStockFile();
  const [countDate, setCountDate] = useState("");
  const [allCounted, setAllCounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setMessage("");
    setBusy(true);
    let added = 0;
    let already = 0;
    try {
      const rows = sheetRows(await file.text()).map((row) => {
        const read = readOpeningStockRow(row);
        const withDate =
          read && !read.asOfText && countDate
            ? { ...row, "As of": countDate }
            : row;
        const withCount =
          read && !read.countStateText && allCounted
            ? { ...withDate, Counted: "counted" }
            : withDate;
        return { ...withCount, SourceFile: file.name };
      });
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const part = rows.slice(i, i + CHUNK_SIZE);
        setMessage(
          `Reading ${Math.min(i + part.length, rows.length)} of ${rows.length} rows…`,
        );
        const result = await importFile({
          datasetType: "stock",
          sourceSystem: "csv_export",
          rows: part,
        });
        added += result.committed;
        already += result.skipped;
      }
      setMessage(
        rows.length === 0
          ? "No rows found in the file."
          : `${added} rows added to the list below${already > 0 ? `, ${already} were already on it` : ""}. Stock on hand does not change until you check a row and use it.`,
      );
    } catch (cause: unknown) {
      const reason =
        cause instanceof Error ? cause.message : "The import did not work.";
      // Rows read before the stop are kept; reading the file again skips them.
      setError(
        added + already > 0
          ? `${reason} ${added} rows were added before it stopped. Read the file again to add the rest; rows already on the list are skipped.`
          : reason,
      );
      setMessage("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="working-ledger">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Inventory · Opening stock</p>
          <h2>Bring in a count sheet</h2>
          <p className="text-xs text-ink-2">
            A CSV with a Name column, plus any of: Type, Quantity, Unit,
            Location, As of, Counted. Food, equipment, disposables, items made
            in house and instructions are kept apart. Importing the same sheet
            again adds nothing.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <label className="field-label">
          Count date for rows with no date
          <BoundedDateInput
            className="input"
            value={countDate}
            onChange={(event) => setCountDate(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allCounted}
            onChange={(event) => setAllCounted(event.target.checked)}
            disabled={busy}
          />
          Every row on this sheet was counted by hand
        </label>
        <label className="field-label max-w-full min-w-0">
          Count sheet
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
      {error ? (
        <p className="px-4 pb-3 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
