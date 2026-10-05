// Pick the old system's report file (.xlsx or .csv) instead of pasting rows.
// The printed headings are matched to the import's field names; columns with
// no field are kept on the import as written (src/lib/importSourceFile.ts).
import { useState, type ChangeEvent } from "react";
import { formatCountNoun } from "../../../lib/format";
import {
  datasetReadsFile,
  sourceRowsFromGrid,
  type SourceFileRows,
} from "../../../lib/importSourceFile";
import { sourceFileGrid } from "./sourceFileGrid";

export function SourceRowsFilePicker({
  datasetType,
  noun,
  onRows,
}: {
  datasetType: string;
  noun: string;
  onRows: (rows: Record<string, string>[]) => void;
}) {
  const [read, setRead] = useState<(SourceFileRows & { file: string }) | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  if (!datasetReadsFile(datasetType)) return null;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setRead(null);
    try {
      const result = sourceRowsFromGrid(
        await sourceFileGrid(file),
        datasetType,
      );
      if (result.rows.length === 0) {
        setError(
          `No ${noun} rows found in ${file.name}. The file needs a heading row with names like First Name, Email or Zip.`,
        );
        return;
      }
      setRead({ ...result, file: file.name });
      onRows(result.rows);
    } catch {
      setError(
        `${file.name} could not be read. Use the old system's export as .xlsx or .csv.`,
      );
    }
  };

  return (
    <div className="mb-3 space-y-1">
      <label className="field-label max-w-full min-w-0">
        Old system file (.xlsx or .csv)
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFile}
          className="max-w-full text-xs"
          data-testid="import-source-file"
        />
      </label>
      {read ? (
        <p className="text-xs text-ink-2" role="status">
          {formatCountNoun(read.rows.length, `${noun} row`)} read from{" "}
          {read.file}. Columns used:{" "}
          {read.matched
            .map(({ heading, field }) =>
              heading === field ? heading : `${heading} (${field})`,
            )
            .join(", ")}
          .
          {read.keptAsWritten.length > 0
            ? ` Kept with each row as written: ${read.keptAsWritten.join(", ")}.`
            : ""}{" "}
          Check the rows below, then bring them in.
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
