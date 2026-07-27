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
  const importRun = useGetImportRun(id ?? "skip");

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

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showRecordCountsForm, setShowRecordCountsForm] = useState(false);
  const [recordCountsInput, setRecordCountsInput] = useState("{}");
  // Source-row commit form state — shared by the venues/contacts/events/leads/
  // payments/menus datasets (each pastes a JSON array of TPP rows into the
  // authored commitImportRun).
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceRowsInput, setSourceRowsInput] = useState("[]");

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
        "Revert this import? All ExternalRecordLinks created by this run are superseded (imported records are left in place for operator deactivation).",
      )
    ) {
      return;
    }
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

      {/* Source Rows (commit) — venues or contacts */}
      {showSourceForm ? (
        <div className="card mt-4">
          <div className="border-b border-line px-3">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
              Commit {commitNounLabel} Source Rows
            </h2>
          </div>
          <div className="p-4">
            <label
              htmlFor="sourceRows"
              className="block text-sm font-medium text-ink-1 mb-2"
            >
              {commitNounLabel} source rows (JSON array)
            </label>
            <textarea
              id="sourceRows"
              value={sourceRowsInput}
              onChange={(e) => setSourceRowsInput(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-md text-sm font-mono"
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
            <p className="text-xs text-ink-2 mt-2">
              Paste TPP {commitNoun} rows. Each is parsed, created as a{" "}
              {commitNoun === "contact"
                ? "Client account"
                : commitNoun === "event"
                  ? "Event (client/venue resolved from prior imports)"
                  : commitNoun === "lead"
                    ? "Lead (pre-client inquiry; client linked later on conversion)"
                    : commitNoun === "payment"
                      ? "reconciliation-reference link staged in the queue (no Payment entity; matched to a Capsule payment later via markMatched — spec §6.4)"
                      : commitNoun === "menu"
                        ? "Dish (menu catalog item; requires kitchenAccess; price preserved on the link — Dish has no price field)"
                        : commitNoun === "pack list"
                          ? "PackList + PackListItems (source event resolved from a prior events import; unrecognized items land as free-text lines — spec §6.3)"
                          : "Venue"}
              , and linked to this run. Re-running is safe (already-linked rows
              are skipped).
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleCommitSource}
                disabled={busy === "commit"}
                className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium disabled:opacity-50"
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
              • <strong>Approve &amp; Commit</strong>: Finalize record counts,
              then paste source rows to materialize entities (venues → Venue,
              contacts → Client account, events → Event with client/venue
              resolved from prior imports, leads → Lead pre-client inquiry,
              payments → reconciliation-reference links staged in the queue for
              matching to a Capsule payment, menus → Dish catalog items with
              price preserved on the link, pack lists → PackList + PackListItems
              with the source event resolved from a prior events import) and
              link them to this run
              (venues/contacts/events/leads/payments/menus/pack lists datasets
              only)
            </li>
            <li>
              • <strong>Fail</strong>: Mark the import as failed (requires
              failure details)
            </li>
            <li>
              • <strong>Revert</strong>: Supersede the links created by a
              completed import (venues are left for operator deactivation)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
