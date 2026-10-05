import { Link } from "react-router-dom";
import { useSourceLinksByCapsuleId } from "../../lib/sourceProvenance";
import { importRunDetailPath } from "../admin/import/importRoutes";
import { isDerivedSourceId } from "../../../convex/lib/importIdentity";

export type SourceLink = NonNullable<
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
 * The import links behind one Capsule record: where it came from, its id in
 * the old system, the original row as it was imported (kept apart from the
 * values Capsule uses), and a way to the import itself. For a report-file
 * import the import page shows each sheet cell, the raw stored value, the
 * date system and the reader version (AC-271).
 */
export function SourceLinkList({
  links,
}: {
  readonly links: readonly SourceLink[];
}) {
  return (
    <ul className="space-y-2">
      {links.map((link, index) => {
        const oldStatus = oldSystemStatus(link.rawSourceData);
        return (
          <li
            key={`${link.sourceSystem}-${link.externalId}-${index}`}
            data-testid="event-source-provenance-link"
            className="rounded-sm border border-line-2 bg-panel p-3 text-sm"
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
                <dt className="text-ink-3">ID in the old system</dt>
                <dd className="break-all text-ink-2">
                  {isDerivedSourceId(link.externalId)
                    ? "None — known by its name and details"
                    : link.externalId || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Imported as</dt>
                <dd className="text-ink-2">{link.recordType || "—"}</dd>
              </div>
              {oldStatus ? (
                <div data-testid="source-link-old-status">
                  <dt className="text-ink-3">Status in the old system</dt>
                  <dd className="text-ink-2">{oldStatus}</dd>
                </div>
              ) : null}
            </dl>
            {oldStatus ? (
              <p className="mt-2 text-ink-3">
                Imported events that are over come in finished, or cancelled
                when they were cancelled or never booked; the others start in
                Planning. Move this event on when you are ready.
              </p>
            ) : null}
            {link.mergedFromName ? (
              <p className="mt-2 text-ink-2">
                Came in as {link.mergedFromName}, merged into this client.
              </p>
            ) : null}
            {link.resolutionNote ? (
              <p className="mt-2 text-ink-2">Note: {link.resolutionNote}</p>
            ) : null}
            {link.rawSourceData ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-ink-3">
                  Original import details
                </summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded-sm bg-inset p-2 text-xs text-ink-2">
                  {prettySourceData(link.rawSourceData)}
                </pre>
              </details>
            ) : null}
            {link.sourceImportRunId ? (
              <p className="mt-2" data-testid="source-link-import-run">
                <Link
                  className="text-link"
                  to={importRunDetailPath(link.sourceImportRunId)}
                >
                  {link.fromReportFile
                    ? "See the report file cells this came from"
                    : "Open the import"}
                </Link>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
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
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium ${entry.cls}`}
    >
      {entry.label}
    </span>
  );
}

/**
 * The event status the old system had (TPP EventStatus, kept on the import
 * row because the import does not apply it as the Capsule stage).
 */
export function oldSystemStatus(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "rawEventStatus" in parsed) {
      const status = (parsed as { rawEventStatus: unknown }).rawEventStatus;
      return typeof status === "string" && status.trim() ? status.trim() : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Pretty-print the captured source JSON; fall back to the raw string. */
function prettySourceData(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
