// One-shot CSV import — pick the TPP menu export, press Import. Drives the
// whole ImportRun pipeline (allocate → parse → validate → review → commit)
// server-side via convex/quickImport.ts, so the operator never touches the
// five-stage ceremony. Chunked per ~500 rows: each chunk is its own run, so
// Revert and the reconcile queue stay per-chunk precise.

import { useAction } from "convex/react";
import { useRef, useState, type ChangeEvent } from "react";
import { api } from "../../../lib/api";
import { tppMenuCsvToRows } from "../../../lib/tppMenuCsv";
import { importRunDetailPath } from "./importRoutes";
import { Link } from "react-router-dom";

const CHUNK_SIZE = 500;

interface ChunkResult {
  importRunId: string;
  committed: number;
  skipped: number;
  pending: number;
  parseErrors: number;
}

export function QuickFileImport() {
  const importFile = useAction(api.quickImport.importFile);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [skippedRows, setSkippedRows] = useState(0);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setResults([]);
    setSkippedRows(0);
    setBusy(true);
    try {
      const { rows, skipped } = tppMenuCsvToRows(await file.text());
      setSkippedRows(skipped);
      const chunks: ChunkResult[] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const part = rows.slice(i, i + CHUNK_SIZE);
        setProgress(
          `Importing ${Math.min(i + part.length, rows.length)} of ${rows.length}…`,
        );
        const result = await importFile({
          datasetType: "menus",
          sourceSystem: "tpp_legacy",
          rows: part,
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

  return (
    <section className="working-ledger mt-6">
      <div className="ledger-heading">
        <div>
          <h2>Import menu items from CSV</h2>
          <p className="text-xs text-ink-2">
            Pick the TPP menu export (or any CSV with a Name column). Dishes are
            created right away — no extra steps. Re-importing the same file is
            safe; already-imported dishes are skipped.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-4">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          disabled={busy}
          className="text-xs"
        />
        {busy ? <span className="text-xs text-ink-2">{progress}</span> : null}
      </div>
      {error ? <p className="px-4 pb-3 text-xs text-danger">{error}</p> : null}
      {results.length > 0 ? (
        <div className="px-4 pb-4">
          <p className="text-xs">
            {totalCommitted.toLocaleString()} imported
            {totalSkipped > 0
              ? `, ${totalSkipped.toLocaleString()} already existed (skipped)`
              : ""}
            {totalPending > 0
              ? `, ${totalPending.toLocaleString()} need review`
              : ""}
            {totalErrors > 0 ? `, ${totalErrors} parse errors` : ""}
            {skippedRows > 0 ? `, ${skippedRows} empty rows ignored` : ""}.
          </p>
          {totalPending > 0 || totalErrors > 0 ? (
            <p className="mt-1 text-xs text-ink-3">
              Records that need review are in the{" "}
              <Link to="/admin/reconcile" className="text-brand">
                reconcile queue
              </Link>
              .
            </p>
          ) : null}
          <p className="mt-1 text-xs text-ink-3">
            {results.length} import run{results.length === 1 ? "" : "s"}:{" "}
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
