import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAction } from "convex/react";
import {
  useGetImportRun,
  useImportRunRecordParse,
  useImportRunValidate,
  useImportRunBeginReview,
  useImportRunApproveReview,
  useImportRunMarkFailed,
} from "../../../lib/manifest-convex-react";
import { api } from "../../../lib/api";
import { formatDate, formatTime } from "../../../lib/format";
import { useRouteRecord } from "../../../lib/routeRecord";
import { importRunsListPath } from "./importRoutes";
import { StatusChip } from "../../../ui/primitives";
import { useActionPrompt } from "../../../ui/action-prompt";
import { AdminWorkspaceNav } from "../AdminWorkspaceNav";
import { useActionNotice, useActionFailure } from "../../../ui/action-result";

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
  const importRun = useRouteRecord(useGetImportRun, id);

  // Commands
  const recordParse = useImportRunRecordParse();
  const validate = useImportRunValidate();
  const beginReview = useImportRunBeginReview();
  const approveReview = useImportRunApproveReview();
  const markFailed = useImportRunMarkFailed();
  // Commit/revert go through the authored importCommit seam, which actually
  // materializes entities + links (the generated ImportRun_commit only flips
  // status). Venues + contacts + events + leads + payments + menus supported;
  // see convex/importCommit.ts.
  const commitImportRun = useAction(api.importCommit.commitImportRun);
  const revertImportRun = useAction(api.importCommit.revertImportRun);

  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();
  const [showRecordCountsForm, setShowRecordCountsForm] = useState(false);
  const [recordCountsInput, setRecordCountsInput] = useState("{}");
  // Final-counts confirmation card for Approve & Commit (prefilled from the
  // run's parsed counts; mirrors the record-counts card pattern above).
  const [showFinalCountsForm, setShowFinalCountsForm] = useState(false);
  const [finalCountsInput, setFinalCountsInput] = useState("{}");
  // Source-row commit form state — shared by the venues/contacts/events/leads/
  // payments/menus datasets (each pastes a JSON array of TPP rows into the
  // authored commitImportRun).
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceRowsInput, setSourceRowsInput] = useState("[]");

  if (id === "skip" || importRun === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center text-ink-3">Loading...</div>
      </div>
    );
  }

  if (importRun === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center text-ink-3">
          <p>Import run not found</p>
          <Link
            to={importRunsListPath()}
            className="text-brand hover:text-brand"
          >
            Back to Import Runs
          </Link>
        </div>
      </div>
    );
  }

  // Datasets whose commit path materializes entities/references (see
  // importCommit.ts).
  const supportedCommitDatasets =
    importRun.datasetType === "venues" ||
    importRun.datasetType === "contacts" ||
    importRun.datasetType === "events" ||
    importRun.datasetType === "leads" ||
    importRun.datasetType === "payments" ||
    importRun.datasetType === "menus" ||
    importRun.datasetType === "pack_list";
  const commitNoun =
    importRun.datasetType === "contacts"
      ? "contact"
      : importRun.datasetType === "events"
        ? "event"
        : importRun.datasetType === "leads"
          ? "lead"
          : importRun.datasetType === "payments"
            ? "payment"
            : importRun.datasetType === "menus"
              ? "menu"
              : importRun.datasetType === "pack_list"
                ? "pack list"
                : "venue";
  const commitNounLabel =
    commitNoun.charAt(0).toUpperCase() + commitNoun.slice(1);

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

  const handleApproveReview = () => {
    setFinalCountsInput(importRun.recordCounts || "{}");
    setShowFinalCountsForm(true);
  };

  const handleApproveReviewSubmit = () => {
    try {
      JSON.parse(finalCountsInput);
    } catch {
      setError("Invalid JSON format for record counts");
      return;
    }
    void run("approveReview", async () => {
      await approveReview({
        docId: importRun._id,
        version: importRun.version,
        finalRecordCounts: finalCountsInput,
      });
      setShowFinalCountsForm(false);
    });
  };

  const handleCommit = () => {
    if (!supportedCommitDatasets) {
      setError(
        "Commit supports the 'venues', 'contacts', 'events', 'leads', 'payments', 'menus', and 'pack lists' datasets.",
      );
      return;
    }
    setShowSourceForm(true);
  };

  const handleCommitSource = async () => {
    let rows: unknown[];
    try {
      const parsed = JSON.parse(sourceRowsInput);
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      setError(`Invalid JSON for ${commitNoun} source rows`);
      return;
    }
    if (rows.length === 0) {
      setError(`Paste at least one ${commitNoun} source row (JSON array)`);
      return;
    }
    setError(null);
    setNotice(null);
    setBusy("commit");
    try {
      const result = await commitImportRun({
        importRunId: importRun._id,
        rawRows: rows,
      });
      setShowSourceForm(false);
      setSourceRowsInput("[]");
      setNotice(
        `Imported ${result.committed} ${commitNoun}(s)` +
          (result.skipped ? `, ${result.skipped} already linked` : "") +
          (result.pending ? `, ${result.pending} pending review` : "") +
          (result.parseErrors ? `, ${result.parseErrors} parse error(s)` : "") +
          ".",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Commit failed");
    } finally {
      setBusy(null);
    }
  };

  const handleMarkFailed = async () => {
    const reason = await prompt.askReason({
      title: "Mark Import Failed",
      description:
        "Record why this run failed so the next attempt knows what went wrong.",
      label: "Failure details",
      placeholder: "What went wrong…",
      confirmLabel: "Mark failed",
      tone: "danger",
    });
    if (!reason?.trim()) return;
    void run("markFailed", async () => {
      await markFailed({
        docId: importRun._id,
        version: importRun.version,
        failureDetails: reason.trim(),
      });
    });
  };

  const handleRevert = async () => {
    const confirmed = await prompt.askConfirm({
      title: "Revert Import",
      description:
        "The records this import linked are marked superseded. Imported venues and other entities stay in place — deactivate them yourself if needed.",
      confirmLabel: "Revert import",
      tone: "danger",
    });
    if (!confirmed) return;
    setError(null);
    setNotice(null);
    setBusy("revert");
    void (async () => {
      try {
        const result = await revertImportRun({ importRunId: importRun._id });
        setNotice(`Reverted — ${result.rolledBack} link(s) superseded.`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Revert failed");
      } finally {
        setBusy(null);
      }
    })();
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

  // Normalizes ms-or-string timestamps into the shared date+time format.
  const formatDateTime = (dateVal: string | number | null | undefined) => {
    if (!dateVal) return "—";
    const ms =
      typeof dateVal === "number" ? dateVal : new Date(dateVal).getTime();
    return `${formatDate(ms)} ${formatTime(ms)}`;
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div className="flex items-center gap-4">
          <Link
            to={importRunsListPath()}
            className="text-ink-2 hover:text-ink text-xs"
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
            {DATASET_TYPE_LABELS[importRun.datasetType]}
            <button
              type="button"
              className="ml-3 font-mono text-xs text-ink-3 hover:text-ink"
              title="Copy the internal run ID for support"
              onClick={() =>
                void navigator.clipboard.writeText(String(importRun._id))
              }
            >
              Copy run ID
            </button>
          </p>
        </div>
      </header>

      <AdminWorkspaceNav />

      {host}

      {error ? (
        <p className="card border-danger/30 bg-danger-soft px-4 py-3 text-base text-danger">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-base text-ok"
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

      {/* Actions Section */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
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
                  void handleMarkFailed();
                  break;
                case "reverted":
                  void handleRevert();
                  break;
              }
            };
            return (
              <button
                key={transition.next}
                type="button"
                onClick={handleClick}
                disabled={isBusy}
                className={`btn ${
                  transition.next === "failed" || transition.next === "reverted"
                    ? "btn-ghost"
                    : "btn-primary"
                }`}
              >
                {isBusy ? "Processing..." : transition.label}
              </button>
            );
          })}
          {availableTransitions.length === 0 ? (
            <span className="text-ink-2 text-xs">
              No actions available for this status
            </span>
          ) : null}
        </div>
      </div>

      {/* Record Counts Form */}
      {showRecordCountsForm ? (
        <div className="card mt-4">
          <div className="border-b border-line px-3">
            <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
              Record Parse Counts
            </h2>
          </div>
          <div className="p-4">
            <label
              htmlFor="recordCounts"
              className="block text-xs font-medium text-ink mb-2"
            >
              Record Counts (JSON)
            </label>
            <textarea
              id="recordCounts"
              value={recordCountsInput}
              onChange={(e) => setRecordCountsInput(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-sm text-xs font-mono"
              rows={6}
              placeholder='{"events": 100, "contacts": 50}'
            />
            <p className="text-2xs text-ink-2 mt-2">
              Enter the count of each record type parsed from the source data.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleRecordParse}
                disabled={busy === "recordParse"}
                className="btn btn-primary"
              >
                {busy === "recordParse" ? "Saving..." : "Save & Continue"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRecordCountsForm(false);
                  setRecordCountsInput("{}");
                }}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Final Record Counts (Approve & Commit) */}
      {showFinalCountsForm ? (
        <div className="card mt-4">
          <div className="border-b border-line px-3">
            <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
              Confirm Final Record Counts
            </h2>
          </div>
          <div className="p-4">
            <label
              htmlFor="finalRecordCounts"
              className="block text-xs font-medium text-ink mb-2"
            >
              Final record counts (JSON)
            </label>
            <textarea
              id="finalRecordCounts"
              value={finalCountsInput}
              onChange={(e) => setFinalCountsInput(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-sm text-xs font-mono"
              rows={6}
            />
            <p className="text-2xs text-ink-2 mt-2">
              Confirm (or correct) the counts before the reviewed data is
              approved for commit.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleApproveReviewSubmit}
                disabled={busy === "approveReview"}
                className="btn btn-primary"
              >
                {busy === "approveReview" ? "Approving..." : "Approve & Commit"}
              </button>
              <button
                type="button"
                onClick={() => setShowFinalCountsForm(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Source Rows (commit) — venues or contacts */}
      {showSourceForm ? (
        <div className="card mt-4">
          <div className="border-b border-line px-3">
            <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
              Commit {commitNounLabel} Source Rows
            </h2>
          </div>
          <div className="p-4">
            <label
              htmlFor="sourceRows"
              className="block text-xs font-medium text-ink mb-2"
            >
              {commitNounLabel} source rows (JSON array)
            </label>
            <textarea
              id="sourceRows"
              value={sourceRowsInput}
              onChange={(e) => setSourceRowsInput(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-sm text-xs font-mono"
              rows={8}
              placeholder={
                commitNoun === "contact"
                  ? '[{"ContactID":"C1","FirstName":"Maria","LastName":"Gomez","Email":"maria@acme.com","Phone":"512-555-0100","Title":"Event Planner","CompanyID":"ACME1","IsPrimary":true}]'
                  : commitNoun === "event"
                    ? '[{"EventID":"E1","EventName":"Smith Wedding","EventType":"Wedding","EventDate":"2025-06-14","StartTime":"17:00","EndTime":"23:00","ExpectedCount":150,"ClientID":"C1","VenueID":"V1","EventStatus":"Sales Lock","TotalRevenue":28500}]'
                    : commitNoun === "lead"
                      ? '[{"LeadID":"L1","OpportunityName":"Smith Wedding","ClientID":"C1","Stage":"Qualified","Probability":40,"EstimatedValue":12000,"Source":"Wedding Wire","CloseDate":"2025-09-01"}]'
                      : commitNoun === "payment"
                        ? '[{"PaymentID":"P1","InvoiceID":"INV1","EventID":"E1","PaymentDate":"2025-06-10","PaymentAmount":5000,"PaymentMethod":"Credit Card","Reference":"CHK 1234","Notes":"Deposit"}]'
                        : commitNoun === "menu"
                          ? '[{"name":"Lobster Deviled Eggs","description":"Lobster deviled egg filling piped into egg whites and garnished with chives.","category":"Appetizer","service_style":"Passed","portion_size_description":"75 servings","allergens":"Eggs; Shellfish","price_per_person":3.5}]'
                          : commitNoun === "pack list"
                            ? '[{"SourceEventID":"E1","SourcePage":"pack-list.html","ExtractedAt":"2026-07-26T12:00:00Z","Name":"Smith Wedding pack list","Items":[{"Item":"Chafing dish","Quantity":4,"Unit":"ea","Group":"Front of house"},{"Item":"Sternos","Quantity":8,"Unit":"each"}]}]'
                            : '[{"VenueID":"V1","VenueName":"Grand Hall","VenueType":"On Premise","Address":"1 Main St","City":"Austin","State":"TX","ZipCode":"78701","Capacity":200,"ContactName":"...","ContactPhone":"...","ContactEmail":"..."}]'
              }
            />
            <p className="text-2xs text-ink-2 mt-2">
              Paste {commitNoun} rows from TPP. Each one is read, created as a{" "}
              {commitNoun === "contact"
                ? "Client account"
                : commitNoun === "event"
                  ? "Event (its client and venue are found from earlier imports)"
                  : commitNoun === "lead"
                    ? "Lead (an inquiry — it links to a client if it converts)"
                    : commitNoun === "payment"
                      ? "payment reference in the matching queue (it gets matched to a Capsule payment later)"
                      : commitNoun === "menu"
                        ? "Dish in your menu catalog (needs kitchen access; the old price is kept with the import details)"
                        : commitNoun === "pack list"
                          ? "pack list with its items (tied to the event from an earlier import; unrecognized items come in as plain text lines)"
                          : "Venue"}
              , and tied to this import. Running it again is safe (rows already
              brought in are skipped).
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleCommitSource}
                disabled={busy === "commit"}
                className="btn btn-primary"
              >
                {busy === "commit"
                  ? "Committing..."
                  : `Commit ${commitNounLabel}s`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSourceForm(false);
                  setSourceRowsInput("[]");
                }}
                className="btn btn-ghost"
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
          <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            Import Run Details
          </h2>
        </div>
        <div className="p-4">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="font-medium text-ink">Source System</dt>
              <dd className="mt-1 text-ink-2">
                {SOURCE_SYSTEM_LABELS[importRun.sourceSystem] ||
                  importRun.sourceSystem}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Dataset Type</dt>
              <dd className="mt-1 text-ink-2">
                {DATASET_TYPE_LABELS[importRun.datasetType] ||
                  importRun.datasetType}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Status</dt>
              <dd className="mt-1">
                <StatusChip status={statusLabel} />
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Total Records</dt>
              <dd className="mt-1 text-ink-2">{totalRecords}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Started At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.startTime)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Completed At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.completionTime)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Actor ID</dt>
              <dd className="mt-1 text-ink-2 font-mono text-2xs">
                {importRun.actorId || "—"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Checksum</dt>
              <dd className="mt-1 text-ink-2 font-mono text-2xs">
                {importRun.checksum || "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Timeline Section */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            Stage Timeline
          </h2>
        </div>
        <div className="p-4">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="font-medium text-ink">Started</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.startTime)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Parsed At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.parsedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Validated At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.validatedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Review Started At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.reviewStartedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Review Approved At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.reviewApprovedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Commit Started At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.commitStartedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Reverted At</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.revertedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">End Time</dt>
              <dd className="mt-1 text-ink-2">
                {formatDateTime(importRun.endTime)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Record Counts Section */}
      {Object.keys(counts).length > 0 ? (
        <div className="card mt-4">
          <div className="border-b border-line px-3">
            <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
              Record Counts by Type
            </h2>
          </div>
          <div className="p-4">
            <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
              {Object.entries(counts).map(([type, count]) => (
                <div key={type}>
                  <dt className="font-medium text-ink capitalize">{type}</dt>
                  <dd className="mt-1 text-ink-2">{count}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}

      {/* Failure Details Section */}
      {importRun.status === "failed" && importRun.failureDetails ? (
        <div className="card mt-4 border-danger/30">
          <div className="border-b border-line px-3">
            <h2 className="text-xs font-semibold tracking-[0.08em] text-danger uppercase py-2">
              Failure Details
            </h2>
          </div>
          <div className="p-4">
            <pre className="max-h-60 overflow-auto rounded-xs bg-inset p-3 font-mono text-sm whitespace-pre-wrap text-danger">
              {importRun.failureDetails}
            </pre>
          </div>
        </div>
      ) : null}

      {/* Help Text */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            Import Run Actions Guide
          </h2>
        </div>
        <div className="p-4">
          <h3 className="font-medium text-xs mb-2">Moving an import forward</h3>
          <ul className="text-xs text-ink-2 space-y-1">
            <li>
              • <strong>Record Parse</strong>: After the file is read, enter how
              many rows were found to move on to checking
            </li>
            <li>
              • <strong>Validate</strong>: Mark the data as checked and move to
              review
            </li>
            <li>
              • <strong>Begin Review</strong>: Look the data over yourself
              before it's saved
            </li>
            <li>
              • <strong>Approve &amp; Commit</strong>: Confirm the counts, then
              paste rows from your old system to create the real records —
              venues, client accounts, events, leads, payment references, menu
              dishes, and pack lists — all tied to this import
            </li>
            <li>
              • <strong>Fail</strong>: Mark the import as failed (requires
              failure details)
            </li>
            <li>
              • <strong>Revert</strong>: Undo what a finished import brought in
              (venues stay — deactivate them yourself if needed)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
