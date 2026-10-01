import { useMemo, useState } from "react";
import {
  useListExternalRecordLink,
  useListInvoice,
  useListPayment,
  useExternalRecordLinkResolveConflict,
  useExternalRecordLinkVerifyLink,
} from "../../../lib/manifest-convex-react";
import { ErrorState, StatusChip, TableSkeleton } from "../../../ui/primitives";
import { AdminWorkspaceNav } from "../AdminWorkspaceNav";
import { useActionNotice, useActionFailure } from "../../../ui/action-result";
import { ImportedPaymentMatch } from "./ImportedPaymentMatch";
import { OldInvoiceRebuild } from "./OldInvoiceRebuild";
import { SameIdPaymentMatch } from "./SameIdPaymentMatch";
import { ServiceStyleMatch } from "./ServiceStyleMatch";
import { SourceChangeReview } from "./SourceChangeReview";
import { referenceOnlyMoneyRows } from "./referenceOnlyRows";
import { isDerivedSourceId } from "../../../../convex/lib/importIdentity";

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
  service_style: "Service style",
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
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();

  // Query for all external records + Capsule payments (for the §6.4 match flow).
  const allRecords = useListExternalRecordLink();
  const payments = useListPayment();
  const invoices = useListInvoice();

  // Commands for resolving records.
  const verifyLink = useExternalRecordLinkVerifyLink();
  const resolveConflict = useExternalRecordLinkResolveConflict();

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

  const referenceOnly = useMemo(
    () => referenceOnlyMoneyRows(allRecords ?? []),
    [allRecords],
  );

  const candidatePayments = useMemo(
    () => (payments ?? []).filter((p) => p.deletedAt == null),
    [payments],
  );
  // A Capsule payment already matched by an imported row is not offered again.
  const takenPaymentIds = useMemo(
    () =>
      new Set(
        (allRecords ?? [])
          .filter(
            (r) =>
              r.deletedAt == null &&
              r.recordType === "payment" &&
              r.capsuleEntity === "payment" &&
              r.conflictStatus !== "superseded" &&
              r.capsuleId,
          )
          .map((r) => String(r.capsuleId)),
      ),
    [allRecords],
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

  // Verify selected records. The generated hook reads `docId` (not `id`); the
  // server records the signed-in person as the one who checked each record.
  async function verifySelected() {
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      for (const id of selectedIds) {
        await verifyLink({
          docId: id,
          verified: true,
        });
      }
      setNotice(`Checked ${selectedIds.size} item(s).`);
      setSelectedIds(new Set());
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't check those items.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Skip selected records (mark as resolved with note).
  async function skipSelected() {
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      for (const id of selectedIds) {
        await resolveConflict({
          docId: id,
          conflictStatus: "resolved",
          resolutionNote: "Skipped while matching leftover items",
        });
      }
      setNotice(`Skipped ${selectedIds.size} item(s).`);
      setSelectedIds(new Set());
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't skip those items.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Import · Matching</p>
          <h1 className="display-title mt-2">Match leftover items</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Check what came over from your old system and confirm each item
            matches the right thing in Capsule. Anything still waiting shows
            here.
          </p>
          {referenceOnly > 0 ? (
            <p className="mt-2 max-w-160 text-sm text-ink-3">
              {referenceOnly} old money{" "}
              {referenceOnly === 1 ? "line is" : "lines are"} kept for the
              record only (quotes, invoices, report totals, balances, credits,
              $0 lines and the same money seen twice). They are not counted in
              any total.
            </p>
          ) : null}
        </div>
      </header>

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
              onChange={(e) => setSelectedSourceSystem(e.target.value || null)}
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
              {filteredRecords.length} waiting to be matched
            </p>
          </div>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 ? (
          <div className="flex items-center gap-3 p-4 bg-inset border-b border-line">
            <span className="text-xs font-medium">
              {selectedIds.size} item(s) selected
            </span>
            <button
              type="button"
              onClick={verifySelected}
              disabled={busy}
              className="btn btn-primary"
            >
              Verify Selected
            </button>
            <button
              type="button"
              onClick={skipSelected}
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
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
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
              {allRecords === undefined || payments === undefined ? (
                <tr>
                  <td colSpan={9} className="py-4">
                    <TableSkeleton rows={4} />
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-ink-2">
                    Everything has been matched up. Great job!
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr
                    key={record._id}
                    className="border-b border-line hover:bg-inset"
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
                    <td className="py-3 px-4 font-mono text-2xs">
                      {isDerivedSourceId(record.externalId)
                        ? "None — known by its name and details"
                        : record.externalId}
                    </td>
                    <td className="py-3 px-4">
                      {RECORD_TYPE_LABELS[record.capsuleEntity] ||
                        record.capsuleEntity}
                    </td>
                    <td className="py-3 px-4 font-mono text-2xs">
                      {record.capsuleId || (
                        <span className="text-ink-3 italic">
                          Not linked yet
                        </span>
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
                      {/* PL-SOURCE-IDENTITY: why this item waits (for example
                          the same name as a client Capsule already has). */}
                      {record.resolutionNote ? (
                        <p className="mt-1 max-w-80 text-2xs text-ink-2">
                          {record.resolutionNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 px-4 text-ink-2">
                      {record.createdAt
                        ? new Date(record.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3 px-4">
                      {record.capsuleEntity === "payment" ? (
                        <ImportedPaymentMatch
                          link={record}
                          payments={candidatePayments}
                          takenPaymentIds={takenPaymentIds}
                          invoiceLabel={invoiceNumber}
                          disabled={busy}
                          onDone={setNotice}
                          onError={setError}
                        />
                      ) : record.capsuleEntity === "service_style" ? (
                        <ServiceStyleMatch
                          linkId={record._id}
                          disabled={busy}
                          onDone={setNotice}
                          onError={setError}
                        />
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

      <SourceChangeReview
        links={allRecords ?? []}
        onDone={setNotice}
        onError={setError}
      />

      <OldInvoiceRebuild onDone={setNotice} onError={setError} />

      {/* Help text */}
      <div className="card mt-4">
        <div className="border-b border-line px-3">
          <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
            How matching works
          </h2>
        </div>
        <div className="p-4">
          <h3 className="font-medium text-xs mb-2">Actions</h3>
          <ul className="text-xs text-ink-2 space-y-1">
            <li>
              • <strong>Match</strong>: Link an imported payment to an existing
              Capsule payment, then mark it resolved. A payment with the same id
              is safe to match; a payment that only has the same amount is a
              guess, so check it first. One payment is matched only once.
            </li>
            <li>
              • <strong>Verify</strong>: Confirm a match is correct; the item is
              marked done and leaves this list.
            </li>
            <li>
              • <strong>Same name or email</strong>: An imported client or venue
              that looks like one you already have is added on its own and waits
              here. Verify it if it is a different one. If it is the same, merge
              the two on the Clients page; the old names and old-system links
              stay on the client you keep.
            </li>
            <li>
              • <strong>Skip</strong>: Mark as resolved with a note. Use this
              for items that shouldn&apos;t be linked or need manual review
              later.
            </li>
          </ul>
          <h3 className="font-medium text-xs mb-2 mt-4">Status Guide</h3>
          <ul className="text-xs text-ink-2 space-y-1">
            <li>
              • Items marked <strong>Conflict</strong> need to be sorted out
              before they leave this list.
            </li>
            <li>
              • Filter by old system to focus on specific imports (TPP,
              QuickBooks, etc.).
            </li>
            <li>
              • Select multiple items to perform bulk Verify / Skip actions.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
