import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useGetImportRun,
  useImportRunRecordParse,
  useImportRunValidate,
  useImportRunBeginReview,
  useImportRunApproveReview,
  useImportRunCommit,
  useImportRunMarkFailed,
  useImportRunRevert,
} from "../../../lib/manifest-convex-react";
import { importRunsListPath } from "./importRoutes";
import { StatusChip } from "../../../ui/primitives";
import { AdminWorkspaceNav } from "../AdminWorkspaceNav";

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

// Stage transitions allowed from each status
const STAGE_TRANSITIONS: Record<string, { next: string; label: string }[]> = {
  started: [
    { next: "parsing", label: "Record Parse" },
    { next: "failed", label: "Fail" },
  ],
  parsing: [
    { next: "validating", label: "Validate" },
    { next: "failed", label: "Fail" },
  ],
  validating: [
    { next: "reviewing", label: "Begin Review" },
    { next: "failed", label: "Fail" },
  ],
  reviewing: [
    { next: "committing", label: "Approve & Commit" },
    { next: "failed", label: "Fail" },
  ],
  committing: [{ next: "completed", label: "Complete Commit" }],
  completed: [{ next: "reverted", label: "Revert" }],
  failed: [],
  reverted: [],
};

export function ImportRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const importRun = useGetImportRun(id ?? "skip");

  // Commands
  const recordParse = useImportRunRecordParse();
  const validate = useImportRunValidate();
  const beginReview = useImportRunBeginReview();
  const approveReview = useImportRunApproveReview();
  const commit = useImportRunCommit();
  const markFailed = useImportRunMarkFailed();
  const revert = useImportRunRevert();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showRecordCountsForm, setShowRecordCountsForm] = useState(false);
  const [recordCountsInput, setRecordCountsInput] = useState("{}");

  if (id === "skip" || importRun === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  if (importRun === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center text-gray-500">
          <p>Import run not found</p>
          <Link
            to={importRunsListPath()}
            className="text-primary hover:text-primary-darker"
          >
            Back to Import Runs
          </Link>
        </div>
      </div>
    );
  }

  const clearNotice = () => setNotice(null);

  const run = async (key: string, work: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
      setNotice("Action completed successfully.");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Operation failed");
    } finally {
      setBusy(null);
    }
  };

  const handleRecordParse = async () => {
    // Validate JSON
    try {
      JSON.parse(recordCountsInput);
    } catch {
      setError("Invalid JSON format for record counts");
      return;
    }
    void run("recordParse", async () => {
      await recordParse({
        docId: importRun._id,
        version: importRun.version,
        recordCounts: recordCountsInput,
      });
      setShowRecordCountsForm(false);
      setRecordCountsInput("{}");
    });
  };

  const handleValidate = () => {
    void run("validate", async () => {
      await validate({
        docId: importRun._id,
        version: importRun.version,
      });
    });
  };

  const handleBeginReview = () => {
    void run("beginReview", async () => {
      await beginReview({
        docId: importRun._id,
        version: importRun.version,
      });
    });
  };

  const handleApproveReview = async () => {
    const countsStr = prompt(
      "Enter final record counts (JSON format):",
      importRun.recordCounts,
    );
    if (!countsStr?.trim()) return;
    try {
      JSON.parse(countsStr);
    } catch {
      setError("Invalid JSON format for record counts");
      return;
    }
    void run("approveReview", async () => {
      await approveReview({
        docId: importRun._id,
        version: importRun.version,
        finalRecordCounts: countsStr,
      });
    });
  };

  const handleCommit = () => {
    void run("commit", async () => {
      await commit({
        docId: importRun._id,
        version: importRun.version,
      });
    });
  };

  const handleMarkFailed = async () => {
    const reason = prompt("Enter failure details:");
    if (!reason?.trim()) return;
    void run("markFailed", async () => {
      await markFailed({
        docId: importRun._id,
        version: importRun.version,
        failureDetails: reason.trim(),
      });
    });
  };

  const handleRevert = () => {
    if (
      !confirm(
        "Are you sure you want to revert this import? This will rollback all imported data.",
      )
    ) {
      return;
    }
    void run("revert", async () => {
      await revert({
        docId: importRun._id,
        version: importRun.version,
      });
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

  const counts = parseRecordCounts(importRun.recordCounts);
  const totalRecords = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const statusLabel = STATUS_LABELS[importRun.status] || importRun.status;
  const availableTransitions = STAGE_TRANSITIONS[importRun.status] || [];

  // Format date for display - handles both number (ms) and string dates
  const formatDate = (dateVal: string | number | null | undefined) => {
    if (!dateVal) return "—";
    const date =
      typeof dateVal === "number" ? new Date(dateVal) : new Date(dateVal);
    return date.toLocaleString();
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div className="flex items-center gap-4">
          <Link
            to={importRunsListPath()}
            className="text-ink-2 hover:text-ink-1 text-sm"
          >
            ← Import Runs
          </Link>
          <div className="h-6 w-px bg-line" />
        </div>
        <div className="mt-2">
          <div className="flex items-center gap-3">
            <h1 className="display-title">Import Run Details</h1>
            <StatusChip status={statusLabel} />
          </div>
          <p className="mt-1 text-ink-2">
            {SOURCE_SYSTEM_LABELS[importRun.sourceSystem]} ·{" "}
            {DATASET_TYPE_LABELS[importRun.datasetType]} · ID:{" "}
            <span className="font-mono text-xs">{importRun._id}</span>
          </p>
        </div>
      </header>

      <AdminWorkspaceNav />

      {error ? (
        <p className="card border-error/30 bg-error-soft px-4 py-3 text-[13px] text-error">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-[13px] text-ok"
          role="status"
        >
          {notice}
          <button
            type="button"
            onClick={clearNotice}
            className="ml-4 text-ok hover:text-ok-darker"
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {/* Actions Section */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            Available Actions
          </h2>
        </div>
        <div className="p-4 flex flex-wrap gap-3">
          {availableTransitions.map((transition) => {
            const isBusy = busy === transition.next;
            const handleClick = () => {
              switch (transition.next) {
                case "parsing":
                  setShowRecordCountsForm(true);
                  break;
                case "validating":
                  handleValidate();
                  break;
                case "reviewing":
                  handleBeginReview();
                  break;
                case "committing":
                  handleApproveReview();
                  break;
                case "completed":
                  handleCommit();
                  break;
                case "failed":
                  handleMarkFailed();
                  break;
                case "reverted":
                  handleRevert();
                  break;
              }
            };
            return (
              <button
                key={transition.next}
                type="button"
                onClick={handleClick}
                disabled={isBusy}
                className={`px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 ${
                  transition.next === "failed" || transition.next === "reverted"
                    ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    : "bg-primary text-white hover:bg-primary-darker"
                }`}
              >
                {isBusy ? "Processing..." : transition.label}
              </button>
            );
          })}
          {availableTransitions.length === 0 ? (
            <span className="text-ink-2 text-sm">
              No actions available for this status
            </span>
          ) : null}
        </div>
      </div>

      {/* Record Counts Form */}
      {showRecordCountsForm ? (
        <div className="card mt-4">
          <div className="border-b border-line px-3">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
              Record Parse Counts
            </h2>
          </div>
          <div className="p-4">
            <label
              htmlFor="recordCounts"
              className="block text-sm font-medium text-ink-1 mb-2"
            >
              Record Counts (JSON)
            </label>
            <textarea
              id="recordCounts"
              value={recordCountsInput}
              onChange={(e) => setRecordCountsInput(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-md text-sm font-mono"
              rows={6}
              placeholder='{"events": 100, "contacts": 50}'
            />
            <p className="text-xs text-ink-2 mt-2">
              Enter the count of each record type parsed from the source data.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleRecordParse}
                disabled={busy === "recordParse"}
                className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium disabled:opacity-50"
              >
                {busy === "recordParse" ? "Saving..." : "Save & Continue"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRecordCountsForm(false);
                  setRecordCountsInput("{}");
                }}
                className="px-4 py-2 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Details Section */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            Import Run Details
          </h2>
        </div>
        <div className="p-4">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="font-medium text-ink-1">Source System</dt>
              <dd className="mt-1 text-ink-2">
                {SOURCE_SYSTEM_LABELS[importRun.sourceSystem] ||
                  importRun.sourceSystem}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Dataset Type</dt>
              <dd className="mt-1 text-ink-2">
                {DATASET_TYPE_LABELS[importRun.datasetType] ||
                  importRun.datasetType}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Status</dt>
              <dd className="mt-1">
                <StatusChip status={statusLabel} />
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Total Records</dt>
              <dd className="mt-1 text-ink-2">{totalRecords}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Started At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.startTime)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Completed At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.completionTime)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Actor ID</dt>
              <dd className="mt-1 text-ink-2 font-mono text-xs">
                {importRun.actorId || "—"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Checksum</dt>
              <dd className="mt-1 text-ink-2 font-mono text-xs">
                {importRun.checksum || "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Timeline Section */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            Stage Timeline
          </h2>
        </div>
        <div className="p-4">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="font-medium text-ink-1">Started</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.startTime)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Parsed At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.parsedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Validated At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.validatedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Review Started At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.reviewStartedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Review Approved At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.reviewApprovedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Commit Started At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.commitStartedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">Reverted At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.revertedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-1">End Time</dt>
              <dd className="mt-1 text-ink-2">
                {formatDate(importRun.endTime)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Record Counts Section */}
      {Object.keys(counts).length > 0 ? (
        <div className="card mt-4">
          <div className="border-b border-line px-3">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
              Record Counts by Type
            </h2>
          </div>
          <div className="p-4">
            <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
              {Object.entries(counts).map(([type, count]) => (
                <div key={type}>
                  <dt className="font-medium text-ink-1 capitalize">{type}</dt>
                  <dd className="mt-1 text-ink-2">{count}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}

      {/* Failure Details Section */}
      {importRun.status === "failed" && importRun.failureDetails ? (
        <div className="card mt-4 border-error/30">
          <div className="border-b border-line px-3">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] text-error uppercase py-2">
              Failure Details
            </h2>
          </div>
          <div className="p-4">
            <pre className="text-sm text-error whitespace-pre-wrap">
              {importRun.failureDetails}
            </pre>
          </div>
        </div>
      ) : null}

      {/* Help Text */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            Import Run Actions Guide
          </h2>
        </div>
        <div className="p-4">
          <h3 className="font-medium text-sm mb-2">Stage Transitions</h3>
          <ul className="text-sm text-ink-2 space-y-1">
            <li>
              • <strong>Record Parse</strong>: After parsing source data, enter
              record counts to move to validating
            </li>
            <li>
              • <strong>Validate</strong>: Mark parsed data as validated and
              move to review
            </li>
            <li>
              • <strong>Begin Review</strong>: Start the review phase for manual
              verification
            </li>
            <li>
              • <strong>Approve & Commit</strong>: Finalize record counts and
              commit data to database
            </li>
            <li>
              • <strong>Fail</strong>: Mark the import as failed (requires
              failure details)
            </li>
            <li>
              • <strong>Revert</strong>: Rollback a completed import (removes
              all imported data)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
