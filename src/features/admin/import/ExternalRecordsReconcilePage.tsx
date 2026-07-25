import { useMemo, useState } from "react";
import {
  useListExternalRecordLink,
  useExternalRecordLinkVerifyLink,
  useExternalRecordLinkResolveConflict,
} from "../../../lib/manifest-convex-react";
import { ErrorState, StatusChip } from "../../../ui/primitives";
import { AdminWorkspaceNav } from "../AdminWorkspaceNav";

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

// Record type labels
const RECORD_TYPE_LABELS: Record<string, string> = {
  event_record: "Event",
  contact: "Contact",
  lead: "Lead",
  menu: "Menu",
  venue: "Venue",
  payment: "Payment",
  invoice: "Invoice",
  contract: "Contract",
  proposal: "Proposal",
  client: "Client",
  vendor: "Vendor",
  person: "Person",
  task: "Task",
  batch: "Batch",
  order: "Order",
  delivery: "Delivery",
  stock: "Stock",
  location: "Location",
};

// Conflict status labels
const CONFLICT_STATUS_LABELS: Record<string, string> = {
  resolved: "Resolved",
  pending_conflict: "Conflict",
  superseded: "Superseded",
};

export function ExternalRecordsReconcilePage() {
  const [selectedSourceSystem, setSelectedSourceSystem] = useState<
    string | null
  >(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Query for all external records
  const allRecords = useListExternalRecordLink();

  // Commands for resolving records
  const verifyLink = useExternalRecordLinkVerifyLink();
  const resolveConflict = useExternalRecordLinkResolveConflict();

  // Filter for unverified records and optional source system
  const filteredRecords = useMemo(() => {
    const records = (allRecords ?? []).filter((r) => r.verified === false);
    if (selectedSourceSystem) {
      return records.filter((r) => r.sourceSystem === selectedSourceSystem);
    }
    return records;
  }, [allRecords, selectedSourceSystem]);

  // Toggle selection
  function toggleSelection(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  // Toggle all
  function toggleAll() {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r._id)));
    }
  }

  // Clear notice
  function clearNotice() {
    setNotice(null);
  }

  // Verify selected records
  async function verifySelected() {
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      for (const id of selectedIds) {
        await verifyLink({
          id: id as any,
          verified: true,
          lastVerifiedAt: Date.now(),
        });
      }
      setNotice(`Verified ${selectedIds.size} record(s) successfully.`);
      setSelectedIds(new Set());
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Failed to verify records.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Skip selected records (mark as resolved with note)
  async function skipSelected() {
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      for (const id of selectedIds) {
        await resolveConflict({
          id: id as any,
          conflictStatus: "resolved",
          resolutionNote: "Skipped during reconciliation",
        });
      }
      setNotice(`Skipped ${selectedIds.size} record(s).`);
      setSelectedIds(new Set());
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Failed to skip records.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Import · Reconciliation</p>
          <h1 className="display-title mt-2">External Record Links</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Review and verify external system records mapped to Capsule
            entities. Unverified records appear here after import runs.
          </p>
        </div>
      </header>

      <AdminWorkspaceNav />

      {error ? (
        <ErrorState title="Reconciliation failed" detail={error} />
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

      <div className="card">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <div>
            <label
              htmlFor="source-system-filter"
              className="block text-sm font-medium text-ink-2 mb-1"
            >
              Source System
            </label>
            <select
              id="source-system-filter"
              value={selectedSourceSystem ?? ""}
              onChange={(e) => setSelectedSourceSystem(e.target.value || null)}
              className="min-w-48 px-3 py-2 border border-slate-300 rounded-md text-sm"
            >
              <option value="">All Systems</option>
              {Object.entries(SOURCE_SYSTEM_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto">
            <p className="text-sm text-ink-2">
              {filteredRecords.length} unverified record(s)
            </p>
          </div>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 ? (
          <div className="flex items-center gap-3 p-4 bg-slate-50 border-b border-line">
            <span className="text-sm font-medium">
              {selectedIds.size} record(s) selected
            </span>
            <button
              type="button"
              onClick={verifySelected}
              disabled={busy}
              className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium disabled:opacity-50"
            >
              Verify Selected
            </button>
            <button
              type="button"
              onClick={skipSelected}
              disabled={busy}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md text-sm font-medium disabled:opacity-50"
            >
              Skip Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-2 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-100"
            >
              Clear Selection
            </button>
          </div>
        ) : null}

        {/* Records table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-inset">
                <th className="text-left py-3 px-4 font-medium">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === filteredRecords.length &&
                      filteredRecords.length > 0
                    }
                    onChange={toggleAll}
                    className="w-4 h-4"
                  />
                </th>
                <th className="text-left py-3 px-4 font-medium">
                  Source System
                </th>
                <th className="text-left py-3 px-4 font-medium">Record Type</th>
                <th className="text-left py-3 px-4 font-medium">External ID</th>
                <th className="text-left py-3 px-4 font-medium">
                  Capsule Entity
                </th>
                <th className="text-left py-3 px-4 font-medium">Capsule ID</th>
                <th className="text-left py-3 px-4 font-medium">
                  Conflict Status
                </th>
                <th className="text-left py-3 px-4 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-ink-2">
                    No unverified records found. Great job!
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr
                    key={record._id}
                    className="border-b border-line hover:bg-slate-50"
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(record._id)}
                        onChange={() => toggleSelection(record._id)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="py-3 px-4">
                      {SOURCE_SYSTEM_LABELS[record.sourceSystem] ||
                        record.sourceSystem}
                    </td>
                    <td className="py-3 px-4">
                      {RECORD_TYPE_LABELS[record.capsuleEntity] ||
                        record.capsuleEntity}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      {record.externalId}
                    </td>
                    <td className="py-3 px-4">
                      {RECORD_TYPE_LABELS[record.capsuleEntity] ||
                        record.capsuleEntity}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      {record.capsuleId || (
                        <span className="text-ink-3 italic">Unlinked</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {record.conflictStatus !== "resolved" ? (
                        <StatusChip
                          status={
                            CONFLICT_STATUS_LABELS[record.conflictStatus] ||
                            record.conflictStatus
                          }
                        />
                      ) : (
                        <span className="text-ink-2">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-ink-2">
                      {record.createdAt
                        ? new Date(record.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Help text */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            Reconciliation Workflow
          </h2>
        </div>
        <div className="p-4">
          <h3 className="font-medium text-sm mb-2">Actions</h3>
          <ul className="text-sm text-ink-2 space-y-1">
            <li>
              • <strong>Verify</strong>: Confirm the mapping is correct. The
              record will be marked as verified and won't appear in this queue.
            </li>
            <li>
              • <strong>Skip</strong>: Mark as resolved with a note. Use this
              for records that shouldn't be imported or need manual review
              later.
            </li>
          </ul>
          <h3 className="font-medium text-sm mb-2 mt-4">Status Guide</h3>
          <ul className="text-sm text-ink-2 space-y-1">
            <li>
              • Records with <strong>Conflict</strong> status require resolution
              before they can be verified.
            </li>
            <li>
              • Filter by source system to focus on specific imports (TPP
              Legacy, QuickBooks, etc.).
            </li>
            <li>• Select multiple records to perform bulk actions.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
