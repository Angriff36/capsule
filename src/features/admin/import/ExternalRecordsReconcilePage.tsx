import { useMemo, useState } from "react";
import { useUser } from "@clerk/react";
import {
  useListExternalRecordLink,
  useListInvoice,
  useListPayment,
  useExternalRecordLinkResolveConflict,
  useExternalRecordLinkUpdateCapsuleId,
  useExternalRecordLinkVerifyLink,
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
  pack_list: "Pack List",
};

// Conflict status labels
const CONFLICT_STATUS_LABELS: Record<string, string> = {
  resolved: "Resolved",
  pending_conflict: "Conflict",
  superseded: "Superseded",
};

export function ExternalRecordsReconcilePage() {
  const { user } = useUser();
  const operatorId = user?.id ?? "";
  const [selectedSourceSystem, setSelectedSourceSystem] = useState<
    string | null
  >(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Per-row "Match to Capsule payment" picker state.
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [matchPaymentId, setMatchPaymentId] = useState("");

  // Query for all external records + Capsule payments (for the §6.4 match flow).
  const allRecords = useListExternalRecordLink();
  const payments = useListPayment();
  const invoices = useListInvoice();

  // Commands for resolving records.
  const verifyLink = useExternalRecordLinkVerifyLink();
  const resolveConflict = useExternalRecordLinkResolveConflict();
  const updateCapsuleId = useExternalRecordLinkUpdateCapsuleId();

  // ponytail: the queue is records still needing action. Filtering on
  // `verified === false` was wrong — resolveConflict/updateCapsuleId never set
  // verified=true, so Skip/Match results would never leave the queue. The only
  // non-terminal ConflictStatus is pending_conflict (resolved/superseded are
  // terminal), so that is the faithful "needs action" set.
  const filteredRecords = useMemo(() => {
    const records = (allRecords ?? []).filter(
      (r) => r.conflictStatus === "pending_conflict",
    );
    if (selectedSourceSystem) {
      return records.filter((r) => r.sourceSystem === selectedSourceSystem);
    }
    return records;
  }, [allRecords, selectedSourceSystem]);

  const candidatePayments = useMemo(
    () => (payments ?? []).filter((p) => p.deletedAt == null),
    [payments],
  );

  const invoiceNumber = (id: string) =>
    invoices?.find((row) => row._id === id)?.invoiceNumber || "Unknown invoice";

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

  // Verify selected records. The generated hook reads `docId` (not `id`) and
  // verifyLink requires a non-empty `verifiedByUserId`; both were missing before,
  // so every click threw before reaching the mutation.
  async function verifySelected() {
    if (selectedIds.size === 0 || !operatorId) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      for (const id of selectedIds) {
        await verifyLink({
          docId: id,
          verifiedByUserId: operatorId,
          verified: true,
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

  // Skip selected records (mark as resolved with note).
  async function skipSelected() {
    if (selectedIds.size === 0 || !operatorId) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      for (const id of selectedIds) {
        await resolveConflict({
          docId: id,
          conflictStatus: "resolved",
          resolvedByUserId: operatorId,
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

  // §6.4 match flow for an imported payment reference: link it to an existing
  // Capsule payment, then mark the conflict resolved. The import stages payments
  // as pending_conflict links with capsuleId "" and a note saying "match via
  // markMatched" — this is the UI that finally performs that match.
  async function matchPayment(linkId: string) {
    if (!matchPaymentId || !operatorId) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await updateCapsuleId({ docId: linkId, capsuleId: matchPaymentId });
      await resolveConflict({
        docId: linkId,
        conflictStatus: "resolved",
        resolvedByUserId: operatorId,
        resolutionNote: "Matched to Capsule payment during reconciliation",
      });
      setNotice("Payment linked and resolved.");
      setMatchingId(null);
      setMatchPaymentId("");
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Failed to match payment.",
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
            Review and resolve external system records mapped to Capsule
            entities. Imported records awaiting reconciliation appear here.
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
              {filteredRecords.length} record(s) awaiting reconciliation
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
                <th className="text-left py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-ink-2">
                    No records awaiting reconciliation. Great job!
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
                    <td className="py-3 px-4">
                      {record.capsuleEntity === "payment" ? (
                        matchingId === record._id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {/* ponytail: native select scales to hundreds of payments;
                                a searchable combobox is the upgrade path for high-volume tenants. */}
                            <select
                              value={matchPaymentId}
                              onChange={(e) =>
                                setMatchPaymentId(e.target.value)
                              }
                              disabled={busy}
                              className="px-2 py-1 border border-slate-300 rounded-md text-xs min-w-56"
                            >
                              <option value="">Select Capsule payment…</option>
                              {candidatePayments.map((payment) => (
                                <option key={payment._id} value={payment._id}>
                                  {invoiceNumber(String(payment.invoiceId))} ·{" "}
                                  {Number(payment.amount ?? 0).toLocaleString(
                                    undefined,
                                    {
                                      style: "currency",
                                      currency: "USD",
                                    },
                                  )}{" "}
                                  · {String(payment.status)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void matchPayment(record._id)}
                              disabled={busy || !matchPaymentId}
                              className="px-3 py-1 bg-primary text-white rounded-md text-xs font-medium disabled:opacity-50"
                            >
                              Link
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMatchingId(null);
                                setMatchPaymentId("");
                              }}
                              disabled={busy}
                              className="px-3 py-1 text-slate-600 rounded-md text-xs font-medium hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setMatchingId(record._id);
                              setMatchPaymentId("");
                            }}
                            disabled={busy}
                            className="px-3 py-1 text-primary rounded-md text-xs font-medium hover:bg-primary/10 disabled:opacity-50"
                          >
                            Match
                          </button>
                        )
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
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
              • <strong>Match</strong>: Link an imported payment reference to an
              existing Capsule payment, then mark it resolved (spec §6.4).
            </li>
            <li>
              • <strong>Verify</strong>: Confirm a mapping is correct; the
              record is marked verified and resolved and leaves this queue.
            </li>
            <li>
              • <strong>Skip</strong>: Mark as resolved with a note. Use this
              for records that shouldn&apos;t be linked or need manual review
              later.
            </li>
          </ul>
          <h3 className="font-medium text-sm mb-2 mt-4">Status Guide</h3>
          <ul className="text-sm text-ink-2 space-y-1">
            <li>
              • Records with <strong>Conflict</strong> status require resolution
              before they leave this queue.
            </li>
            <li>
              • Filter by source system to focus on specific imports (TPP
              Legacy, QuickBooks, etc.).
            </li>
            <li>
              • Select multiple records to perform bulk Verify / Skip actions.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
