import { EventTabPanel } from "./EventTabPanel";
import { useSourceLinksByCapsuleId } from "../../lib/sourceProvenance";

type SourceLink = NonNullable<
  ReturnType<typeof useSourceLinksByCapsuleId>
>[number];

const SOURCE_LABEL: Record<string, string> = {
  tpp_legacy: "TPP (legacy)",
  csv_export: "CSV export",
  api_sync: "API sync",
  quickbooks_online: "QuickBooks Online",
  google_calendar: "Google Calendar",
  stripe: "Stripe",
  other: "Other",
};

const IMPORTED_DATE = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * Shows the external-system provenance of the event on the Overview tab —
 * where the record was imported from (TPP/QuickBooks/etc.), its external id,
 * the import-run link, and the raw source payload captured for §6.1
 * reconciliation. Read-only; renders only when an import link exists, so a
 * natively-created event shows no empty section.
 */
export function EventSourceProvenancePanel({
  capsuleId,
}: {
  readonly capsuleId: string | undefined | null;
}) {
  const links = useSourceLinksByCapsuleId(capsuleId);
  // Loading (undefined) or no provenance → render nothing.
  if (!links || links.length === 0) return null;

  return (
    <EventTabPanel
      eyebrow="Source"
      title="Imported record"
      description="This event was brought in from another system. Here's where it came from and how it was matched up."
      testId="event-source-provenance-panel"
    >
      <ul className="space-y-2">
        {links.map((link, index) => (
          <li
            key={`${link.sourceSystem}-${link.externalId}-${index}`}
            data-testid="event-source-provenance-link"
            className="rounded-sm border border-line-2 bg-panel p-3 text-[12.5px]"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-ink">
                {SOURCE_LABEL[link.sourceSystem] ?? link.sourceSystem}
              </span>
              <StatusChip status={link.conflictStatus} />
              {!link.verified ? (
                <span className="text-ink-3">· not yet checked</span>
              ) : null}
              {link.importedAt ? (
                <span className="text-ink-3">
                  Imported {IMPORTED_DATE.format(link.importedAt)}
                </span>
              ) : null}
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              <div>
                <dt className="text-ink-3">Reference in the old system</dt>
                <dd className="break-all text-ink-2">
                  {link.externalId || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Imported as</dt>
                <dd className="text-ink-2">{link.recordType || "—"}</dd>
              </div>
            </dl>
            {link.resolutionNote ? (
              <p className="mt-2 text-ink-2">Note: {link.resolutionNote}</p>
            ) : null}
            {link.rawSourceData ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-ink-3">
                  Original import details
                </summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded-sm bg-inset p-2 text-[11px] text-ink-2">
                  {prettySourceData(link.rawSourceData)}
                </pre>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </EventTabPanel>
  );
}

function StatusChip({ status }: { readonly status: string }) {
  // conflictStatus is the reconcile-queue state (resolved / pending_conflict).
  const map: Record<string, { label: string; cls: string }> = {
    resolved: {
      label: "Matched",
      cls: "border-ok/50 bg-ok-soft/50 text-ok",
    },
    pending_conflict: {
      label: "Pending match",
      cls: "border-warn/50 bg-warn-soft/50 text-warn",
    },
  };
  const entry = map[status] ?? {
    label: status,
    cls: "border-line-2 bg-panel text-ink-2",
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-medium ${entry.cls}`}
    >
      {entry.label}
    </span>
  );
}

/** Pretty-print the captured source JSON; fall back to the raw string. */
function prettySourceData(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
