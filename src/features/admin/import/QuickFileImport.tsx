// One-shot file import — pick what the file holds and the old system's file,
// press Import. Drives the whole ImportRun pipeline (allocate → parse →
// validate → review → commit) server-side via convex/quickImport.ts, so the
// operator never touches the five-stage ceremony. Chunked per ~500 rows: each
// chunk is its own run, so Revert and the reconcile queue stay per-chunk
// precise. Menu items read the TPP menu CSV; the other kinds read any .xlsx or
// .csv report with a heading row (src/lib/importSourceFile.ts).

import { useAction } from "convex/react";
import { useRef, useState, type ChangeEvent } from "react";
import { api } from "../../../lib/api";
import { sourceRowsFromGrid } from "../../../lib/importSourceFile";
import { tppMenuCsvToRows } from "../../../lib/tppMenuCsv";
import { importRunDetailPath } from "./importRoutes";
import { sourceFileGrid } from "./sourceFileGrid";
import { Link } from "react-router-dom";

const CHUNK_SIZE = 500;

const KINDS = [
  { value: "menus", label: "Menu items (TPP menu export, .csv)" },
  { value: "contacts", label: "Contacts and companies (Address / Phone List)" },
  { value: "venues", label: "Venues" },
  { value: "events", label: "Events" },
  { value: "leads", label: "Leads" },
  { value: "history", label: "Messages and tasks" },
] as const;

/** SHA-256 of the file as read, so each run records its source version. */
async function fileChecksum(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface ChunkResult {
  importRunId: string;
  committed: number;
  skipped: number;
  pending: number;
  parseErrors: number;
  updated?: number;
  conflicted?: number;
}

export function QuickFileImport() {
  const importFile = useAction(api.quickImport.importFile);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [skippedRows, setSkippedRows] = useState(0);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("menus");
  const [columns, setColumns] = useState("");

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setResults([]);
    setSkippedRows(0);
    setColumns("");
    setBusy(true);
    try {
      const checksum = await fileChecksum(await file.arrayBuffer());
      let rows: unknown[];
      if (kind === "menus") {
        const read = tppMenuCsvToRows(await file.text());
        rows = read.rows;
        setSkippedRows(read.skipped);
      } else {
        let grid: string[][];
        try {
          grid = await sourceFileGrid(file);
        } catch {
          throw new Error(
            `${file.name} could not be read. Use the old system's export as .xlsx or .csv.`,
          );
        }
        const read = sourceRowsFromGrid(grid, kind);
        if (read.rows.length === 0)
          throw new Error(
            `No heading row found in ${file.name}. The file needs headings like First Name, Email or Zip.`,
          );
        rows = read.rows;
        setColumns(
          `Columns used: ${read.matched
            .map(({ heading, field }) =>
              heading === field ? heading : `${heading} (${field})`,
            )
            .join(", ")}.` +
            (read.keptAsWritten.length > 0
              ? ` Kept with each row as written: ${read.keptAsWritten.join(", ")}.`
              : ""),
        );
      }
      const chunks: ChunkResult[] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const part = rows.slice(i, i + CHUNK_SIZE);
        setProgress(
          `Importing ${Math.min(i + part.length, rows.length)} of ${rows.length}…`,
        );
        const result = await importFile({
          datasetType: kind,
          sourceSystem: "tpp_legacy",
          rows: part,
          checksum,
        });
        chunks.push(result);
        setResults([...chunks]);
      }
      setProgress(
        rows.length === 0 ? "No rows found in the file." : "Import complete.",
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Import failed");
      setProgress("");
    } finally {
      setBusy(false);
    }
  };

  const totalCommitted = results.reduce((n, r) => n + r.committed, 0);
  const totalSkipped = results.reduce((n, r) => n + r.skipped, 0);
  const totalPending = results.reduce((n, r) => n + r.pending, 0);
  const totalErrors = results.reduce((n, r) => n + r.parseErrors, 0);
  const totalUpdated = results.reduce((n, r) => n + (r.updated ?? 0), 0);
  const totalConflicted = results.reduce((n, r) => n + (r.conflicted ?? 0), 0);

  return (
    <section className="working-ledger mt-6">
      <div className="ledger-heading">
        <div>
          <h2>Import a file from the old system</h2>
          <p className="text-xs text-ink-2">
            Pick what the file holds, then the file. Menu items read the TPP
            menu export (or any CSV with a Name column). The other kinds read
            the old system&apos;s report as .xlsx or .csv: its headings (First
            Name, Zip, Venue Name…) are matched for you, and columns Capsule has
            no place for are kept with each row. Records are made right away —
            no extra steps. Importing the same file again is safe; records
            already brought in are skipped.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <label className="field-label max-w-full min-w-0">
          What is in the file
          <select
            className="input"
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as (typeof KINDS)[number]["value"])
            }
            disabled={busy}
            data-testid="quick-import-kind"
          >
            {KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={fileInput}
          type="file"
          accept={
            kind === "menus"
              ? ".csv,text/csv"
              : ".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          }
          onChange={handleFile}
          disabled={busy}
          className="max-w-full text-xs"
          data-testid="quick-import-file"
        />
        {progress ? (
          <span className="text-xs text-ink-2" role="status">
            {progress}
          </span>
        ) : null}
      </div>
      {columns ? (
        <p className="px-4 pb-3 text-xs text-ink-2">{columns}</p>
      ) : null}
      {error ? (
        <p className="px-4 pb-3 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {results.length > 0 ? (
        <div className="px-4 pb-4">
          <p className="text-xs">
            {totalCommitted.toLocaleString()} imported
            {totalSkipped > 0
              ? `, ${totalSkipped.toLocaleString()} already existed (skipped)`
              : ""}
            {totalUpdated > 0
              ? `, ${totalUpdated.toLocaleString()} updated from the old system`
              : ""}
            {totalConflicted > 0
              ? `, ${totalConflicted.toLocaleString()} also changed in Capsule`
              : ""}
            {totalPending > 0
              ? `, ${totalPending.toLocaleString()} need review`
              : ""}
            {totalErrors > 0 ? `, ${totalErrors} parse errors` : ""}
            {skippedRows > 0 ? `, ${skippedRows} empty rows ignored` : ""}.
          </p>
          {totalPending > 0 || totalErrors > 0 || totalConflicted > 0 ? (
            <p className="mt-1 text-xs text-ink-3">
              Items that need review are in the{" "}
              <Link to="/admin/reconcile" className="text-brand">
                leftover match list
              </Link>
              .
            </p>
          ) : null}
          <p className="mt-1 text-xs text-ink-3">
            {results.length} import{results.length === 1 ? "" : "s"}:{" "}
            {results.map((r, i) => (
              <span key={r.importRunId}>
                {i > 0 ? ", " : ""}
                <Link
                  to={importRunDetailPath(r.importRunId)}
                  className="text-brand"
                >
                  {r.importRunId.slice(0, 8)}…
                </Link>
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </section>
  );
}
