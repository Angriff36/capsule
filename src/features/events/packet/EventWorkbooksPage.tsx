import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useEventWorkbookSummaries } from "../../../lib/eventPacket/useEventPacket";
import { EmptyState, PageHeader, TableSkeleton } from "../../../ui/primitives";
import { eventImportPath } from "../eventRoutes";
import { EventWorkbookRow } from "./EventWorkbookRow";

/** Cross-event workbook home: every event with packet evidence in one ledger. */
export function EventWorkbooksPage() {
  const summaries = useEventWorkbookSummaries();
  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    let list = summaries ?? [];
    if (openOnly) list = list.filter((r) => r.openBlocking + r.openWarning > 0);
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.clientName.toLowerCase().includes(q),
      );
    return list;
  }, [summaries, openOnly, search]);

  const totals = useMemo(() => {
    const list = summaries ?? [];
    return {
      events: list.length,
      openBlocking: list.reduce((sum, r) => sum + r.openBlocking, 0),
      ready: list.filter((r) => r.ready).length,
      openIssues: list.reduce(
        (sum, r) => sum + r.openBlocking + r.openWarning,
        0,
      ),
    };
  }, [summaries]);

  return (
    <div className="pb-10">
      <PageHeader
        title="Event Workbooks"
        lead={
          summaries
            ? `${totals.events} ${totals.events === 1 ? "workbook" : "workbooks"} · ${totals.openBlocking} open blocking · ${totals.ready} ready — counts as of the last import or decision`
            : "Source evidence, open issues, and printable packets across every event"
        }
        actions={
          <Link to={eventImportPath()} className="btn btn-primary">
            Import event sources
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-line py-3">
        <button
          type="button"
          aria-pressed={openOnly}
          onClick={() => setOpenOnly((v) => !v)}
          className={`h-11 cursor-pointer rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors md:h-9 ${
            openOnly
              ? "bg-panel text-ink shadow-[0_1px_2px_rgb(30_40_36/0.15)]"
              : "bg-inset text-ink-2 hover:text-ink"
          }`}
        >
          Open issues only
          <span className="ml-1.5 font-mono">{totals.openIssues}</span>
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or client…"
          className="input h-11 min-w-0 flex-1 basis-56 md:h-9"
          aria-label="Filter workbooks"
        />
      </div>

      {summaries === undefined ? (
        <div className="mt-6">
          <TableSkeleton rows={6} />
        </div>
      ) : summaries === null ? (
        <div className="mt-10">
          <EmptyState
            title="Management access required"
            hint="Ask an administrator for manager access to review event workbooks."
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title={
              openOnly || search
                ? "No workbooks match this view"
                : "No event workbooks yet"
            }
            hint={
              openOnly || search
                ? "Try clearing the filters, or import sources for another event."
                : "Import BEO, worksheet, or pack list sources to start a workbook."
            }
            action={
              <Link to={eventImportPath()} className="btn btn-primary">
                Import event sources
              </Link>
            }
          />
        </div>
      ) : (
        <div aria-label="Event workbooks" className="mt-2">
          {rows.map((row) => (
            <EventWorkbookRow key={row.eventId} row={row} />
          ))}
          <p className="mt-7 text-base text-ink-2">
            {rows.length} {rows.length === 1 ? "workbook" : "workbooks"} in this
            view.
          </p>
        </div>
      )}
    </div>
  );
}
