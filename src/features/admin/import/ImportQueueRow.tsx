import { StatusChip } from "../../../ui/primitives";
import { isDerivedSourceId } from "../../../../convex/lib/importIdentity";
import { sourceSummary } from "../../../../convex/lib/importResolution";
import { ImportedPaymentMatch } from "./ImportedPaymentMatch";
import { LookAlikeNote } from "./LookAlikeNote";
import { ResolveImportItem } from "./ResolveImportItem";
import { ServiceStyleMatch } from "./ServiceStyleMatch";

const RECORD_TYPE_LABELS: Record<string, string> = {
  event_record: "Event",
  contact: "Contact",
  lead: "Lead",
  menu: "Menu",
  dish: "Dish",
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
  client_communication: "Message or task",
};

const CONFLICT_STATUS_LABELS: Record<string, string> = {
  resolved: "Resolved",
  pending_conflict: "Conflict",
  superseded: "Superseded",
};

export type ImportQueueRecord = {
  _id: string;
  sourceSystem: string;
  recordType: string;
  externalId: string;
  capsuleEntity: string;
  capsuleId: string;
  conflictStatus: string;
  resolutionNote?: string | null;
  createdAt?: number | null;
  rawSourceData?: string | null;
  sourceName?: string | null;
  sourceDetail?: string | null;
};

function SourceRowSummary({
  raw,
  sourceName,
  sourceDetail,
}: Readonly<{
  raw?: string | null;
  sourceName?: string | null;
  sourceDetail?: string | null;
}>) {
  const parsed = sourceName == null ? sourceSummary(raw) : null;
  const name = sourceName ?? parsed?.name ?? "";
  const detail = sourceDetail ?? parsed?.detail ?? "";
  return (
    <>
      {name ? <p className="mt-1 font-sans text-xs text-ink">{name}</p> : null}
      {detail ? (
        <p className="font-sans text-2xs text-ink-2">{detail}</p>
      ) : null}
    </>
  );
}

/** One waiting imported row: what it was, where it landed, and what to do. */
export function ImportQueueRow({
  record,
  sourceLabel,
  selected,
  recordLabel,
  disabled,
  onToggle,
  onDone,
  onError,
}: Readonly<{
  record: ImportQueueRecord;
  sourceLabel: string;
  selected: boolean;
  recordLabel: string | undefined;
  disabled: boolean;
  onToggle: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const kind = RECORD_TYPE_LABELS[record.capsuleEntity] || record.capsuleEntity;
  return (
    <tr className="border-b border-line hover:bg-inset">
      <td className="py-3 px-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="w-4 h-4"
          aria-label={
            isDerivedSourceId(record.externalId)
              ? "Select this old-system item"
              : `Select old-system item ${record.externalId}`
          }
        />
      </td>
      <td className="py-3 px-4" data-label="Old system">
        {sourceLabel}
      </td>
      <td className="py-3 px-4" data-label="Type">
        {kind}
      </td>
      <td
        className="py-3 px-4 font-mono text-2xs"
        data-label="ID in the old system"
      >
        {isDerivedSourceId(record.externalId)
          ? "None — known by its name and details"
          : record.externalId}
        <SourceRowSummary
          raw={record.rawSourceData}
          sourceName={record.sourceName}
          sourceDetail={record.sourceDetail}
        />
      </td>
      <td className="py-3 px-4" data-label="In Capsule as">
        {kind}
      </td>
      <td className="py-3 px-4 text-xs" data-label="In Capsule">
        {record.capsuleId ? (
          (recordLabel ?? (
            <span className="font-mono text-2xs">{record.capsuleId}</span>
          ))
        ) : (
          <span className="text-ink-3 italic">Not linked yet</span>
        )}
      </td>
      <td className="py-3 px-4" data-label="Status">
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
        {record.resolutionNote ? (
          <p className="mt-1 max-w-80 text-2xs text-ink-2">
            <LookAlikeNote
              note={record.resolutionNote}
              capsuleEntity={record.capsuleEntity}
            />
          </p>
        ) : null}
      </td>
      <td className="py-3 px-4 text-ink-2" data-label="Created">
        {record.createdAt
          ? new Date(record.createdAt).toLocaleDateString()
          : "—"}
      </td>
      <td className="py-3 px-4">
        {record.capsuleEntity === "payment" ? (
          <ImportedPaymentMatch
            linkId={record._id}
            disabled={disabled}
            onDone={onDone}
            onError={onError}
          />
        ) : record.capsuleEntity === "service_style" ? (
          <ServiceStyleMatch
            linkId={record._id}
            disabled={disabled}
            onDone={onDone}
            onError={onError}
          />
        ) : (
          <ResolveImportItem
            link={record}
            disabled={disabled}
            onDone={onDone}
            onError={onError}
          />
        )}
      </td>
    </tr>
  );
}
