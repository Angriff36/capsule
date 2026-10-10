// One-shot file import — pick what the file holds and the old system's file,
// press Import. Drives the whole ImportRun pipeline (allocate → parse →
// validate → review → commit) server-side via convex/quickImport.ts, so the
// operator never touches the five-stage ceremony. Chunked per ~500 rows: each
// chunk is its own run, so Revert and the reconcile queue stay per-chunk
// precise. Menu items read the TPP Menu Items Export; the other kinds read any
// .xlsx or .csv report with a heading row (src/lib/importSourceFile.ts).

import { useAction, useMutation } from "convex/react";
import { useRef, useState, type ChangeEvent } from "react";
import { api } from "../../../lib/api";
import { sourceRowsFromGrid } from "../../../lib/importSourceFile";
import {
  isQuickBooksPaymentReport,
  quickBooksPaymentRowsFromGrid,
} from "../../../lib/quickbooksPayments";
import { tppMenuTableToRows } from "../../../lib/tppMenuCsv";
import {
  contactTaskRowsFromGrid,
  isContactTasksReport,
} from "../../../lib/tppReports/parseContactTasks";
import {
  isVenueListingReport,
  venueListingRowsFromGrid,
} from "../../../lib/tppReports/parseVenueListing";
import { importRunDetailPath } from "./importRoutes";
import {
  addPackageResults,
  packageSummary,
  PACKAGES_PER_SAVE,
  readMenuPackagesFile,
  type PackageSaveResult,
} from "./menuPackagesImport";
import { sourceFileGrid } from "./sourceFileGrid";
import { Link } from "react-router-dom";
import { classifyCommandFailure } from "../../events/CommandFailure";

const CHUNK_SIZE = 500;

const KINDS = [
  { value: "menus", label: "Menu items (TPP Menu Items Export)" },
  { value: "packages", label: "Menu packages (TPP Menu Item Packages)" },
  { value: "contacts", label: "Contacts and companies (Address / Phone List)" },
  { value: "venues", label: "Venues" },
  { value: "events", label: "Events" },
  { value: "leads", label: "Leads" },
  { value: "history", label: "Messages and tasks" },
  { value: "payments", label: "Payments (old system)" },
  { value: "qbo_payments", label: "Past payments (QuickBooks report)" },
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
  const importPackages = useMutation(api.tppMenuPackages.importTppMenuPackages);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [skippedRows, setSkippedRows] = useState(0);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("menus");
  const [columns, setColumns] = useState("");
  const [packageNotes, setPackageNotes] = useState<string[]>([]);

  // A file refused under the wrong kind is read again when the kind changes,
  // so nobody has to pick the same file twice.
  const refusedFile = useRef<File | null>(null);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await readAndImport(file, kind);
  };

  const readAndImport = async (
    file: File,
    kind: (typeof KINDS)[number]["value"],
  ) => {
    refusedFile.current = null;
    setError(null);
    setResults([]);
    setSkippedRows(0);
    setColumns("");
    setPackageNotes([]);
    setBusy(true);
    // Once any rows went to the server some may be saved even if the call
    // failed, so only a file refused before that is brought in again under
    // another kind.
    const chunks: ChunkResult[] = [];
    let sent = false;
    try {
      if (kind === "packages") {
        // The package report tells packages, choice groups and dishes apart
        // only by font, so it is read from the .xlsx itself.
        let packages;
        try {
          packages = await readMenuPackagesFile(file);
        } catch {
          throw new Error(
            `${file.name} could not be read. Use the old system's Menu Item Packages report as .xlsx.`,
          );
        }
        if (packages.length === 0)
          throw new Error(
            `No packages found in ${file.name}. Use the old system's Menu Item Packages report as .xlsx.`,
          );
        setColumns(
          `Read as the old system's Menu Item Packages: ${packages.length} packages, ${packages
            .reduce(
              (n, pack) =>
                n +
                pack.groups.reduce((m, group) => m + group.dishes.length, 0),
              0,
            )
            .toLocaleString()} dishes.`,
        );
        let total: PackageSaveResult = {
          added: 0,
          updated: 0,
          unchanged: 0,
          lines: 0,
          leftAlone: [],
          notFound: [],
          several: [],
        };
        for (let i = 0; i < packages.length; i += PACKAGES_PER_SAVE) {
          const part = packages.slice(i, i + PACKAGES_PER_SAVE);
          setProgress(
            `Saving packages ${i + part.length} of ${packages.length}…`,
          );
          sent = true;
          total = addPackageResults(
            total,
            await importPackages({ packages: part }),
          );
          setPackageNotes(packageSummary(total));
        }
        setProgress("Import complete.");
        return;
      }
      const checksum = await fileChecksum(await file.arrayBuffer());
      let grid: string[][];
      try {
        grid = await sourceFileGrid(file);
      } catch {
        throw new Error(
          `${file.name} could not be read. Use the old system's export as .xlsx or .csv.`,
        );
      }
      let rows: unknown[];
      if (kind === "menus") {
        const read = tppMenuTableToRows(grid);
        rows = read.rows;
        setSkippedRows(read.skipped);
        if (read.keptAsWritten.length > 0)
          setColumns(
            `Kept with each row as written: ${read.keptAsWritten.join(", ")}.`,
          );
      } else if (kind === "history" && isContactTasksReport(grid)) {
        // TPP's Contact Tasks & Notes prints blocks, not one heading row.
        rows = contactTaskRowsFromGrid(grid);
        setColumns(
          `Read as the old system's Contact Tasks & Notes: ${rows.length.toLocaleString()} tasks. Each joins its event by event number, or its client by name.`,
        );
      } else if (kind === "venues" && isVenueListingReport(grid)) {
        // TPP's Venue Listing repeats its headings on every page and puts
        // the part of the site under the venue as an "Area:" line.
        rows = venueListingRowsFromGrid(grid);
        setColumns(
          `Read as the old system's Venue Listing: ${rows.length.toLocaleString()} venues. Each area under a venue goes to its access notes.`,
        );
      } else if (kind === "qbo_payments") {
        if (!isQuickBooksPaymentReport(grid))
          throw new Error(
            `No QuickBooks headings found in ${file.name}. Export a QuickBooks report with Date, Transaction type and Amount columns (for example Transaction List by Date).`,
          );
        rows = quickBooksPaymentRowsFromGrid(grid);
        setColumns(
          `Read as a QuickBooks report: ${rows.length.toLocaleString()} dated lines. Payments wait on the leftover match list; invoices and totals are kept for the record only.`,
        );
      } else {
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
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const part = rows.slice(i, i + CHUNK_SIZE);
        setProgress(
          `Importing ${Math.min(i + part.length, rows.length)} of ${rows.length}…`,
        );
        sent = true;
        const result = await importFile({
          datasetType: kind === "qbo_payments" ? "payments" : kind,
          sourceSystem:
            kind === "qbo_payments" ? "quickbooks_online" : "tpp_legacy",
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
      if (!sent) refusedFile.current = file;
      // Server faults arrive wrapped in request ids; show the plain sentence.
      const failure = classifyCommandFailure(cause);
      setError(
        failure.detail && failure.detail !== failure.title
          ? `${failure.title} ${failure.detail}`
          : failure.title,
      );
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
            Pick what the file holds, then the file, as .xlsx or .csv. Menu
            items read the TPP Menu Items Export (or any sheet with a Name
            column). Menu packages read the TPP Menu Item Packages report
            (.xlsx): each package becomes a draft menu with its dishes. The
            other kinds read the old system&apos;s report: its headings (First
            Name, Zip, Venue Name…) are matched for you, and columns Capsule has
            no place for are kept with each row. A QuickBooks report
            (Transaction List by Date, Deposit Detail…) brings in past payments
            to match against Capsule payments; nothing is charged or sent to
            QuickBooks. Records are made right away — no extra steps. Importing
            the same file again is safe; records already brought in are skipped.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <label className="field-label max-w-full min-w-0">
          What is in the file
          <select
            className="input"
            value={kind}
            onChange={(event) => {
              const next = event.target
                .value as (typeof KINDS)[number]["value"];
              setKind(next);
              if (refusedFile.current)
                void readAndImport(refusedFile.current, next);
            }}
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
          aria-label="File to import"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
      {packageNotes.length > 0 ? (
        <div className="px-4 pb-4" data-testid="quick-import-packages">
          {packageNotes.map((note, index) => (
            <p
              key={note}
              className={index === 0 ? "text-xs" : "mt-1 text-xs text-ink-3"}
            >
              {note}
            </p>
          ))}
        </div>
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
          {totalPending > 0 ||
          totalErrors > 0 ||
          totalConflicted > 0 ||
          kind === "payments" ||
          kind === "qbo_payments" ? (
            <p className="mt-1 text-xs text-ink-3">
              {kind === "payments" || kind === "qbo_payments"
                ? "Payments wait to be matched to a Capsule payment in the"
                : "Items that need review are in the"}{" "}
              <Link to="/admin/reconcile" className="text-brand">
                leftover match list
              </Link>
              .
            </p>
          ) : null}
          <p className="mt-1 text-xs text-ink-3">
            {results.map((r, i) => (
              <span key={r.importRunId}>
                {i > 0 ? " · " : ""}
                <Link
                  to={importRunDetailPath(r.importRunId)}
                  className="text-brand"
                >
                  {results.length === 1
                    ? "See what came in"
                    : `See part ${i + 1} of ${results.length}`}
                </Link>
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </section>
  );
}
