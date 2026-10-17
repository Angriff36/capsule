import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "../../../lib/api";
import {
  useExternalRecordLinkResolveConflict,
  useExternalRecordLinkVerifyLink,
} from "../../../lib/manifest-convex-react";
import { useImportQueue } from "../../../lib/useExternalRecordLinkLists";
import { ErrorState, PageHeader, TableSkeleton } from "../../../ui/primitives";
import { AdminWorkspaceNav } from "../AdminWorkspaceNav";
import { useActionNotice, useActionFailure } from "../../../ui/action-result";
import { ImportQueueRow } from "./ImportQueueRow";
import { OldInvoiceRebuild } from "./OldInvoiceRebuild";
import { SameIdPaymentMatch } from "./SameIdPaymentMatch";
import { SourceChangeReview } from "./SourceChangeReview";
import { isDerivedSourceId } from "../../../../convex/lib/importIdentity";
import { sourceSummary } from "../../../../convex/lib/importResolution";
import {
  BulkActionPreview,
  type BulkAction,
  type BulkPreviewItem,
} from "./BulkActionPreview";

// Source system labels
const SOURCE_SYSTEM_LABELS: Record<string, string> = {
  tpp_legacy: "TPP Legacy",
  csv_export: "CSV Export",
  api_sync: "API Sync",
  quickbooks_online: "QuickBooks Online",
  google_calendar: "Google Calendar",
  stripe: "Stripe",
  other: "Other",
};

export function ExternalRecordsReconcilePage() {
  const [selectedSourceSystem, setSelectedSourceSystem] = useState<
    string | null
  >(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();

  // One page of rows still waiting. Show more reads the next page.
  const queue = useImportQueue(selectedSourceSystem);
  const waiting = useQuery(api.externalRecordLinkLists.waitingCount, {
    sourceSystem: selectedSourceSystem ?? undefined,
  });
  const reference = useQuery(
    api.externalRecordLinkLists.referenceOnlyCount,
    {},
  );
  const allRecords = queue.results;

  // Commands for resolving records.
  const verifyLink = useExternalRecordLinkVerifyLink();
  const resolveConflict = useExternalRecordLinkResolveConflict();

  // ponytail: the queue is records still needing action. Filtering on
  // `verified === false` was wrong — resolveConflict/updateCapsuleId never set
  // verified=true, so Skip/Match results would never leave the queue. The only
  // non-terminal ConflictStatus is pending_conflict (resolved/superseded are
  // terminal), so that is the faithful "needs action" set.
  const filteredRecords = useMemo(
    () =>
      (allRecords ?? []).filter((r) => r.conflictStatus === "pending_conflict"),
    [allRecords],
  );

  // PL-SOURCE-RESOLUTION: the Capsule record each waiting item points at, by
  // name, shown beside the old-system row.
  const recordLabels = useQuery(
    api.importResolution.itemRecordLabels,
    filteredRecords.length > 0
      ? {
          linkIds: filteredRecords
            .slice(0, 200)
            .map((r) => r._id as Id<"externalRecordLinks">),
        }
      : "skip",
  );

  // Only rows on screen count as selected: a row hidden by the filter or gone
  // from the queue is never part of a bulk action.
  const visibleSelected = filteredRecords.filter((r) => selectedIds.has(r._id));
  const bulkItems: BulkPreviewItem[] = visibleSelected.map((r) => ({
    id: r._id,
    sourceId: isDerivedSourceId(r.externalId) ? "" : r.externalId,
    sourceName:
      r.sourceName ||
      sourceSummary(
        "rawSourceData" in r && typeof r.rawSourceData === "string"
          ? r.rawSourceData
          : null,
      ).name,
    recordLabel: r.capsuleId ? (recordLabels?.[r._id] ?? r.capsuleId) : null,
  }));

  const referenceOnly = reference?.count ?? 0;

  // Toggle selection
  function toggleSelection(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    if (newSelected.size === 0) setBulkAction(null);
  }

  // Toggle all
  function toggleAll() {
    if (visibleSelected.length === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r._id)));
    }
  }

  // Clear notice
  function clearNotice() {
    setNotice(null);
  }

  // Run one write per item in the preview list. Every item is tried; the ones
  // that fail stay selected and the notice says how many went through.
  async function runEachSelected(
    selectedList: string[],
    write: (id: string) => Promise<unknown>,
    doneLabel: string,
    failedLabel: string,
  ) {
    if (selectedList.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const failed = new Set<string>();
    let firstFailure: string | null = null;
    for (const id of selectedList) {
      try {
        await write(id);
      } catch (cause: unknown) {
        failed.add(id);
        firstFailure ??=
          cause instanceof Error ? cause.message : "Something went wrong.";
      }
    }
    const done = selectedList.length - failed.size;
    if (done > 0) setNotice(`${doneLabel}${done} item(s).`);
    if (failed.size > 0) {
      setError(
        `${failedLabel} ${failed.size} item(s) are still selected. ${firstFailure}`,
      );
    } else {
      setBulkAction(null);
    }
    setSelectedIds(failed);
    setBusy(false);
  }

  // Verify selected records. The generated hook reads `docId` (not `id`); the
  // server records the signed-in person as the one who checked each record.
  function verifySelected(ids: string[]) {
    return runEachSelected(
      ids,
      (id) => verifyLink({ docId: id, verified: true }),
      "Checked ",
      "Couldn't check those items.",
    );
  }

  // Skip selected records (mark as resolved with note).
  function skipSelected(ids: string[]) {
    return runEachSelected(
      ids,
      (id) =>
        resolveConflict({
          docId: id,
          conflictStatus: "resolved",
          resolutionNote: "Skipped while matching leftover items",
        }),
      "Skipped ",
      "Couldn't skip those items.",
    );
  }

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Match leftover items"
        lead={
          <>
            Check what came over from your old system and confirm each item
            matches the right thing in Capsule. Anything still waiting shows
            here.
          </>
        }
      />
      {referenceOnly > 0 || reference?.more ? (
        <p className="mt-2 max-w-160 text-sm text-ink-3">
          {reference?.more
            ? referenceOnly > 0
              ? `${referenceOnly}+`
              : "Some"
            : referenceOnly}{" "}
          old money{" "}
          {referenceOnly === 1 && !reference?.more ? "line is" : "lines are"}{" "}
          kept for the record only (quotes, invoices, report totals, balances,
          credits, $0 lines and the same money seen twice). They are not counted
          in any total.
        </p>
      ) : null}

      <AdminWorkspaceNav />

      {error ? (
        <ErrorState title="Couldn't finish matching" detail={error} />
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

      <div className="card">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <div>
            <label
              htmlFor="source-system-filter"
              className="block text-xs font-medium text-ink-2 mb-1"
            >
              Old system
            </label>
            <select
              id="source-system-filter"
              value={selectedSourceSystem ?? ""}
              onChange={(e) => {
                setSelectedSourceSystem(e.target.value || null);
                setSelectedIds(new Set());
                setBulkAction(null);
              }}
              className="min-w-48 px-3 py-2 border border-line-2 rounded-sm text-xs"
            >
              <option value="">All Systems</option>
              {Object.entries(SOURCE_SYSTEM_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <SameIdPaymentMatch
            disabled={busy}
            onDone={setNotice}
            onError={setError}
          />

          <div className="ml-auto">
            <p className="text-xs text-ink-2">
              {waiting === undefined
                ? "Counting what is waiting…"
                : waiting.more
                  ? `${waiting.count}+ waiting to be matched`
                  : `${waiting.count} waiting to be matched`}
            </p>
          </div>
        </div>

        {/* Bulk actions: a preview of every affected item comes first. */}
        {bulkItems.length > 0 && bulkAction ? (
          <BulkActionPreview
            action={bulkAction}
            items={bulkItems}
            busy={busy}
            onApply={(ids) =>
              void (bulkAction === "verify"
                ? verifySelected(ids)
                : skipSelected(ids))
            }
            onCancel={() => setBulkAction(null)}
          />
        ) : visibleSelected.length > 0 ? (
          <div className="flex items-center gap-3 p-4 bg-inset border-b border-line">
            <span className="text-xs font-medium">
              {visibleSelected.length} item(s) selected
            </span>
            <button
              type="button"
              onClick={() => setBulkAction("verify")}
              disabled={busy}
              className="btn btn-primary"
            >
              Verify Selected
            </button>
            <button
              type="button"
              onClick={() => setBulkAction("skip")}
              disabled={busy}
              className="btn btn-secondary"
            >
              Skip Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="btn btn-ghost"
            >
              Clear Selection
            </button>
          </div>
        ) : null}

        {/* Records table */}
        <div className="overflow-x-auto max-md:px-3">
          <table className="phone-cards w-full text-xs">
            <thead>
              <tr className="border-b border-line bg-inset">
                <th className="text-left py-3 px-4 font-medium">
                  <input
                    type="checkbox"
                    checked={
                      visibleSelected.length === filteredRecords.length &&
                      filteredRecords.length > 0
                    }
                    onChange={toggleAll}
                    className="w-4 h-4"
                    aria-label="Select all items in this list"
                  />
                </th>
                <th className="text-left py-3 px-4 font-medium">Old system</th>
                <th className="text-left py-3 px-4 font-medium">Type</th>
                <th className="text-left py-3 px-4 font-medium">
                  ID in the old system
                </th>
                <th className="text-left py-3 px-4 font-medium">
                  In Capsule as
                </th>
                <th className="text-left py-3 px-4 font-medium">In Capsule</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Created</th>
                <th className="text-left py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.status === "LoadingFirstPage" ? (
                <tr>
                  <td colSpan={9} className="py-4">
                    <TableSkeleton rows={4} />
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-ink-2">
                    {queue.status === "CanLoadMore"
                      ? "Nothing else on this page."
                      : "Everything has been matched up. Great job!"}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <ImportQueueRow
                    key={record._id}
                    record={record}
                    sourceLabel={
                      SOURCE_SYSTEM_LABELS[record.sourceSystem] ||
                      record.sourceSystem
                    }
                    selected={selectedIds.has(record._id)}
                    recordLabel={recordLabels?.[record._id]}
                    disabled={busy}
                    onToggle={() => toggleSelection(record._id)}
                    onDone={setNotice}
                    onError={setError}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        {queue.status === "CanLoadMore" || queue.status === "LoadingMore" ? (
          <div className="border-t border-line p-4">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={queue.status === "LoadingMore"}
              onClick={() => queue.loadMore(50)}
            >
              {queue.status === "LoadingMore" ? "Loading…" : "Show more"}
            </button>
          </div>
        ) : null}
      </div>

      <SourceChangeReview
        links={allRecords ?? []}
        onDone={setNotice}
        onError={setError}
      />

      <OldInvoiceRebuild onDone={setNotice} onError={setError} />
    </div>
  );
}
