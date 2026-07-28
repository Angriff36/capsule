import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useListImportRun,
  useImportRunStart,
  useImportRunMarkFailed,
  useImportRunRevert,
} from "../../../lib/manifest-convex-react";
import { importRunDetailPath } from "./importRoutes";
import { StatusChip, TableSkeleton } from "../../../ui/primitives";

// Source system labels
const SOURCE_SYSTEM_LABELS: Record<string, string> = {
  tpp_legacy: "TPP Legacy",
  csv_export: "CSV Export",
  api_sync: "API Sync",
};

// Dataset type labels
const DATASET_TYPE_LABELS: Record<string, string> = {
  events: "Events",
  contacts: "Contacts",
  leads: "Leads",
  menus: "Menus",
  venues: "Venues",
  payments: "Payments",
  pack_list: "Pack Lists",
};

// Status labels
const STATUS_LABELS: Record<string, string> = {
  started: "Started",
  parsing: "Parsing",
  validating: "Validating",
  reviewing: "Reviewing",
  committing: "Committing",
  completed: "Completed",
  failed: "Failed",
  reverted: "Reverted",
};

export function ImportRunsListPage() {
  const allRuns = useListImportRun();
  const startImport = useImportRunStart();
  const markFailed = useImportRunMarkFailed();
  const revertImport = useImportRunRevert();

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [sourceSystemFilter, setSourceSystemFilter] = useState<string>("");
  const [datasetTypeFilter, setDatasetTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Filter runs
  const filteredRuns = useMemo(() => {
    const runs = (allRuns ?? []).filter((r) => r.deletedAt == null);
    return runs.filter((run) => {
      if (sourceSystemFilter && run.sourceSystem !== sourceSystemFilter)
        return false;
      if (datasetTypeFilter && run.datasetType !== datasetTypeFilter)
        return false;
      if (statusFilter && run.status !== statusFilter) return false;
      return true;
    });
  }, [allRuns, sourceSystemFilter, datasetTypeFilter, statusFilter]);

  const clearNotice = () => setNotice(null);

  const run = async (key: string, work: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
      setNotice(`Action completed successfully.`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Operation failed");
    } finally {
      setBusy(null);
    }
  };

  const handleStartImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    void run("start", async () => {
      await startImport({
        sourceSystem: (data.get("sourceSystem") ?? "tpp_legacy") as any,
        datasetType: (data.get("datasetType") ?? "events") as any,
        actorId: data.get("actorId")?.toString().trim() || undefined,
        checksum: data.get("checksum")?.toString().trim() || undefined,
      });
      setShowForm(false);
      (event.target as HTMLFormElement).reset();
    });
  };

  const handleMarkFailed = async (
    runId: string,
    id: string,
    version: number,
  ) => {
    const reason = prompt("Enter failure details:");
    if (!reason?.trim()) return;
    void run(`fail-${id}`, async () => {
      await markFailed({
        docId: runId,
        version,
        failureDetails: reason.trim(),
      });
    });
  };

  const handleRevert = async (runId: string, id: string, version: number) => {
    if (
      !confirm(
        "Are you sure you want to revert this import? This will rollback all imported data.",
      )
    ) {
      return;
    }
    void run(`revert-${id}`, async () => {
      await revertImport({ docId: runId, version });
    });
  };

  // Parse record counts for display
  const parseRecordCounts = (countsStr: string): Record<string, number> => {
    try {
      return JSON.parse(countsStr || "{}");
    } catch {
      return {};
    }
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Import · Framework</p>
          <h1 className="display-title mt-2">Import Runs</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Manage data import runs from external systems (TPP Legacy, CSV
            Export, API Sync). Track import status, review records, and commit
            data.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-brand text-white rounded-md text-sm font-medium hover:bg-brand"
          >
            {showForm ? "Cancel" : "New Import Run"}
          </button>
        </div>
      </header>

      {/* New import form */}
      {showForm ? (
        <div className="card mt-4">
          <div className="border-b border-line px-3">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
              Start New Import Run
            </h2>
          </div>
          <form onSubmit={handleStartImport} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="sourceSystem"
                  className="block text-sm font-medium text-ink mb-1"
                >
                  Source System
                </label>
                <select
                  id="sourceSystem"
                  name="sourceSystem"
                  required
                  className="w-full px-3 py-2 border border-line rounded-md text-sm"
                >
                  {Object.entries(SOURCE_SYSTEM_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label
                  htmlFor="datasetType"
                  className="block text-sm font-medium text-ink mb-1"
                >
                  Dataset Type
                </label>
                <select
                  id="datasetType"
                  name="datasetType"
                  required
                  className="w-full px-3 py-2 border border-line rounded-md text-sm"
                >
                  {Object.entries(DATASET_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="checksum"
                  className="block text-sm font-medium text-ink mb-1"
                >
                  Checksum (optional)
                </label>
                <input
                  type="text"
                  id="checksum"
                  name="checksum"
                  className="w-full px-3 py-2 border border-line rounded-md text-sm"
                  placeholder="SHA-256 checksum"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={busy === "start"}
                className="px-4 py-2 bg-brand text-white rounded-md text-sm font-medium disabled:opacity-50"
              >
                {busy === "start" ? "Starting..." : "Start Import"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {error ? (
        <p className="card border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger mt-4">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-[13px] text-ok mt-4"
          role="status"
        >
          {notice}
          <button
            type="button"
            onClick={clearNotice}
            className="ml-4 text-ok hover:text-ok"
          >
            Dismiss
          </button>
        </p>
      ) : null}

      <div className="card mt-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <div>
            <label
              htmlFor="source-filter"
              className="block text-sm font-medium text-ink-2 mb-1"
            >
              Source System
            </label>
            <select
              id="source-filter"
              value={sourceSystemFilter}
              onChange={(e) => setSourceSystemFilter(e.target.value)}
              className="min-w-40 px-3 py-2 border border-line rounded-md text-sm"
            >
              <option value="">All Sources</option>
              {Object.entries(SOURCE_SYSTEM_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="dataset-filter"
              className="block text-sm font-medium text-ink-2 mb-1"
            >
              Dataset Type
            </label>
            <select
              id="dataset-filter"
              value={datasetTypeFilter}
              onChange={(e) => setDatasetTypeFilter(e.target.value)}
              className="min-w-40 px-3 py-2 border border-line rounded-md text-sm"
            >
              <option value="">All Types</option>
              {Object.entries(DATASET_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="status-filter"
              className="block text-sm font-medium text-ink-2 mb-1"
            >
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-w-40 px-3 py-2 border border-line rounded-md text-sm"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto">
            <p className="text-sm text-ink-2">
              {filteredRuns.length} import run(s)
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-inset">
                <th className="text-left py-3 px-4 font-medium">Source</th>
                <th className="text-left py-3 px-4 font-medium">Dataset</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Records</th>
                <th className="text-left py-3 px-4 font-medium">Started</th>
                <th className="text-left py-3 px-4 font-medium">Completed</th>
                <th className="text-left py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!allRuns ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <TableSkeleton />
                  </td>
                </tr>
              ) : filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-ink-2">
                    No import runs found.{" "}
                    {!sourceSystemFilter && !datasetTypeFilter && !statusFilter
                      ? "Create a new import run to get started."
                      : "Adjust filters to see more results."}
                  </td>
                </tr>
              ) : (
                filteredRuns.map((run) => {
                  const counts = parseRecordCounts(run.recordCounts);
                  const totalRecords = Object.values(counts).reduce(
                    (sum, count) => sum + count,
                    0,
                  );
                  const statusLabel = STATUS_LABELS[run.status] || run.status;

                  return (
                    <tr
                      key={run._id}
                      className="border-b border-line hover:bg-slate-50"
                    >
                      <td className="py-3 px-4">
                        {SOURCE_SYSTEM_LABELS[run.sourceSystem] ||
                          run.sourceSystem}
                      </td>
                      <td className="py-3 px-4">
                        {DATASET_TYPE_LABELS[run.datasetType] ||
                          run.datasetType}
                      </td>
                      <td className="py-3 px-4">
                        <StatusChip status={statusLabel} />
                      </td>
                      <td className="py-3 px-4">
                        {totalRecords > 0 ? totalRecords.toString() : "—"}
                      </td>
                      <td className="py-3 px-4 text-ink-2">
                        {run.startTime
                          ? new Date(run.startTime).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-3 px-4 text-ink-2">
                        {run.completionTime
                          ? new Date(run.completionTime).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={importRunDetailPath(run._id)}
                            className="text-brand hover:text-brand text-sm font-medium"
                          >
                            View
                          </Link>
                          {run.status === "failed" ||
                          run.status === "started" ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleMarkFailed(run._id, run._id, run.version)
                              }
                              disabled={busy === `fail-${run._id}`}
                              className="text-danger hover:text-danger text-sm disabled:opacity-50"
                            >
                              {busy === `fail-${run._id}` ? "..." : "Fail"}
                            </button>
                          ) : null}
                          {run.status === "completed" ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleRevert(run._id, run._id, run.version)
                              }
                              disabled={busy === `revert-${run._id}`}
                              className="text-warn hover:text-warn-darker text-sm disabled:opacity-50"
                            >
                              {busy === `revert-${run._id}` ? "..." : "Revert"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Help text */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            Import Run Workflow
          </h2>
        </div>
        <div className="p-4">
          <h3 className="font-medium text-sm mb-2">Lifecycle Stages</h3>
          <ol className="text-sm text-ink-2 space-y-1 list-decimal list-inside">
            <li>
              <strong>Started</strong>: Import run initialized, ready for
              parsing
            </li>
            <li>
              <strong>Parsing</strong>: Source data is being parsed and
              transformed
            </li>
            <li>
              <strong>Validating</strong>: Parsed data is being validated
              against schema rules
            </li>
            <li>
              <strong>Reviewing</strong>: Data is ready for review before commit
            </li>
            <li>
              <strong>Committing</strong>: Validated data is being committed to
              the database
            </li>
            <li>
              <strong>Completed</strong>: Import finished successfully (can be
              reverted)
            </li>
            <li>
              <strong>Failed</strong>: Import failed with error details
            </li>
            <li>
              <strong>Reverted</strong>: Previously completed import was rolled
              back
            </li>
          </ol>
          <h3 className="font-medium text-sm mb-2 mt-4">Actions</h3>
          <ul className="text-sm text-ink-2 space-y-1">
            <li>
              • <strong>View</strong>: See detailed import run information and
              stage transitions
            </li>
            <li>
              • <strong>Fail</strong>: Manually mark an import as failed (for
              stuck runs)
            </li>
            <li>
              • <strong>Revert</strong>: Roll back a completed import (removes
              imported data)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
