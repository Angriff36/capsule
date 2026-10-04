// Bring in the Goodshuffle item list (its inventory export, .xlsx or .csv).
// Each item becomes an equipment item with its price, place, details and
// picture; reading the file again updates the same items and adds nothing
// twice.
import { useState, type ChangeEvent } from "react";
import { formatCountNoun } from "../../lib/format";
import { goodshuffleSheetRows } from "../../lib/goodshuffleItems";
import { parseCsv } from "../../lib/tppMenuCsv";
import { readXlsxSheetsFromEntries } from "../../lib/tppReports/xlsxWorkbookParser";
import { readZipEntriesInBrowser } from "../../lib/tppReports/zipReaderBrowser";
import {
  useBringInGoodshufflePicture,
  useImportGoodshuffleItems,
} from "./goodshuffleItems";

const CHUNK_SIZE = 100;
const SHOWN = 20;

type Problem = { row: number; reason: string };
type CountDiff = { name: string; inFile: number; inCapsule: number };

async function fileGrid(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const entries = await readZipEntriesInBrowser(
    new Uint8Array(await file.arrayBuffer()),
  );
  return readXlsxSheetsFromEntries(entries)[0]?.rows ?? [];
}

export function GoodshuffleItemsImport({ onClose }: { onClose: () => void }) {
  const importItems = useImportGoodshuffleItems();
  const bringInPicture = useBringInGoodshufflePicture();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problems, setProblems] = useState<Problem[]>([]);
  const [sameName, setSameName] = useState<string[]>([]);
  const [countDiffers, setCountDiffers] = useState<CountDiff[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setMessage("");
    setProblems([]);
    setSameName([]);
    setCountDiffers([]);
    setBusy(true);
    const total = { added: 0, updated: 0, unchanged: 0, pictures: 0 };
    const found: Problem[] = [];
    const named: string[] = [];
    const counts: CountDiff[] = [];
    const pictures: Awaited<ReturnType<typeof importItems>>["pictures"] = [];
    try {
      let grid: string[][];
      try {
        grid = await fileGrid(file);
      } catch {
        throw new Error(
          `${file.name} could not be read. Use the Goodshuffle inventory export (.xlsx) or the same sheet saved as .csv.`,
        );
      }
      const { rows, firstRowNumber } = goodshuffleSheetRows(grid);
      if (rows.length === 0) {
        setMessage(
          "No items found. The file needs a Product ID column (the Goodshuffle inventory export has one).",
        );
        return;
      }
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const part = rows.slice(i, i + CHUNK_SIZE);
        setMessage(
          `Reading ${Math.min(i + part.length, rows.length)} of ${rows.length} items…`,
        );
        const result = await importItems({
          rows: part,
          firstRowNumber: firstRowNumber + i,
        });
        total.added += result.added;
        total.updated += result.updated;
        total.unchanged += result.unchanged;
        found.push(...result.problems);
        named.push(...result.sameName);
        counts.push(...result.countDiffers);
        pictures.push(...result.pictures);
      }
      for (const [index, picture] of pictures.entries()) {
        setMessage(`Copying pictures, ${index + 1} of ${pictures.length}…`);
        try {
          const { pictureAdded } = await bringInPicture(picture);
          if (pictureAdded) total.pictures += 1;
        } catch {
          // A picture that will not come is left out; the item is in.
        }
      }
      setProblems(found);
      setSameName(named);
      setCountDiffers(counts);
      setMessage(
        [
          `${formatCountNoun(total.added, "item")} added`,
          `${total.updated} updated`,
          `${total.unchanged} already up to date`,
          pictures.length > 0
            ? `${total.pictures} of ${formatCountNoun(pictures.length, "picture")} copied`
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
      // Items saved before the stop are kept; reading the file again skips them.
      setError(
        total.added + total.updated > 0
          ? `${reason} Items saved before it stopped are kept. Read the file again to finish; saved items are not added twice.`
          : reason,
      );
      setMessage("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="supply-form space-y-4" data-testid="goodshuffle-import">
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Equipment</p>
          <h2>Bring in Goodshuffle items</h2>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="text-sm text-ink-2">
        Use the Goodshuffle inventory export (.xlsx, or the same sheet saved as
        .csv). Each product becomes an item here with its count, client price,
        storage place, description, details and picture. Services and delivery
        fees are charges, not items, so they are left out. Reading the file
        again updates the same items and adds nothing twice; counts you changed
        here are kept.
      </p>
      <label className="field-label max-w-full min-w-0">
        Goodshuffle file
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFile}
          disabled={busy}
          className="max-w-full text-xs"
          data-testid="goodshuffle-file"
        />
      </label>
      {message ? (
        <p className="text-sm text-ink-2" role="status">
          {message}
        </p>
      ) : null}
      {sameName.length > 0 ? (
        <p className="text-sm text-ink-2">
          Already here under the same name, left as they are:{" "}
          {sameName.slice(0, SHOWN).join(", ")}
          {sameName.length > SHOWN
            ? ` and ${sameName.length - SHOWN} more`
            : ""}
          .
        </p>
      ) : null}
      {countDiffers.length > 0 ? (
        <div className="text-sm text-ink-2">
          <p>Counts that differ from Goodshuffle (recount these):</p>
          <ul>
            {countDiffers.slice(0, SHOWN).map((row) => (
              <li key={row.name}>
                {row.name}: {row.inCapsule} here, {row.inFile} in Goodshuffle
              </li>
            ))}
            {countDiffers.length > SHOWN ? (
              <li>And {countDiffers.length - SHOWN} more.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {problems.length > 0 ? (
        <ul className="text-sm text-ink-2">
          {problems.slice(0, SHOWN).map((problem) => (
            <li key={problem.row}>
              Row {problem.row}: {problem.reason}
            </li>
          ))}
          {problems.length > SHOWN ? (
            <li>And {problems.length - SHOWN} more rows.</li>
          ) : null}
        </ul>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
