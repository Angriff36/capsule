import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  formatCount,
  formatDate,
  formatMoney,
  relativeDays,
} from "../../lib/format";
import { useListClient, useListEvent } from "../../lib/manifest-convex-react";
import { PlusIcon } from "../../ui/icons";
import {
  EmptyState,
  PageHeader,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { clientDisplayName } from "./clientName";
import { EVENT_STAGES, type EventStage, STAGE_LABEL } from "./eventStatus";

type Tab = "all" | EventStage;

export function EventsListPage() {
  const navigate = useNavigate();
  const events = useListEvent();
  const clients = useListClient();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const now = Date.now();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events?.length ?? 0 };
    for (const s of EVENT_STAGES) c[s] = 0;
    for (const e of events ?? []) {
      const stage = String(e.stage);
      c[stage] = (c[stage] ?? 0) + 1;
    }
    return c;
  }, [events]);

  const rows = useMemo(() => {
    let list = (events ?? []).filter((e) => e.deletedAt == null);
    if (tab !== "all") list = list.filter((e) => e.stage === tab);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          String(e.title ?? "")
            .toLowerCase()
            .includes(q) ||
          String(e.venueName ?? "")
            .toLowerCase()
            .includes(q) ||
          clientDisplayName(e.clientId, clients).toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const aDate = a.startsAt ?? 0;
      const bDate = b.startsAt ?? 0;
      return dir === "asc" ? aDate - bDate : bDate - aDate;
    });
  }, [events, clients, tab, search, dir]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Events"
        lead="Every booking across the operation."
        actions={
          <Link to="/events/new" className="btn btn-primary">
            <PlusIcon /> New event
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Filter by stage"
          className="flex max-w-full overflow-x-auto rounded-xs border border-line-2 bg-panel"
        >
          {(["all", ...EVENT_STAGES] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-8 shrink-0 cursor-pointer border-r border-line px-3 text-[12px] font-medium last:border-r-0 ${
                tab === t ? "bg-inset text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {t === "all" ? "All" : STAGE_LABEL[t]}
              <span className="ml-1.5 font-mono text-[11px] text-ink-3">
                {counts[t] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by title, client, venue…"
          className="input max-w-72"
          aria-label="Filter events"
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm ml-auto font-mono"
          onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
          aria-label={`Sort by date, currently ${dir === "asc" ? "soonest first" : "latest first"}`}
        >
          Date {dir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      <div className="card overflow-x-auto">
        {events === undefined ? (
          <TableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              search || tab !== "all"
                ? "No events match this filter"
                : "No events yet"
            }
            hint={
              search || tab !== "all"
                ? "Try a different stage tab or clear the search."
                : "Create the first engagement to begin planning."
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th w-full">Event</th>
                <th className="th">Client</th>
                <th className="th">Starts</th>
                <th className="th text-right">Headcount</th>
                <th className="th text-right">Budget</th>
                <th className="th">Stage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e._id}
                  onClick={() => navigate(`/events/${e._id}`)}
                  className="cursor-pointer transition-colors hover:bg-inset/60"
                >
                  <td className="td w-full max-w-0 truncate">
                    <span className="font-medium">{e.title}</span>
                    {e.venueName ? (
                      <span className="ml-2 text-[12px] text-ink-3">
                        {e.venueName}
                      </span>
                    ) : null}
                  </td>
                  <td className="td text-ink-2">
                    {clientDisplayName(e.clientId, clients)}
                  </td>
                  <td className="td font-mono text-[12px]">
                    {formatDate(e.startsAt)}
                    {e.startsAt != null ? (
                      <span className="ml-2 text-ink-3">
                        {relativeDays(e.startsAt, now)}
                      </span>
                    ) : null}
                  </td>
                  <td className="td text-right font-mono">
                    {formatCount(e.expectedHeadcount)}
                  </td>
                  <td className="td text-right font-mono">
                    {formatMoney(e.budgetAmount)}
                  </td>
                  <td className="td">
                    <StatusChip status={String(e.stage)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
