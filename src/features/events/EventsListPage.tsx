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
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  ActionMenu,
  EmptyState,
  PageHeader,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { SavedViewsBar } from "../views/SavedViewsBar";
import { clientDisplayName } from "./clientName";
import { EVENT_STAGES, type EventStage, STAGE_LABEL } from "./eventStatus";

/** Question tabs first (what is upcoming / needs action), then the stages. */
type Tab = "upcoming" | "attention" | "all" | EventStage;
type EventsView = { tab: Tab; search: string; dir: "asc" | "desc" };

const DAY = 86_400_000;
const DONE_STAGES = new Set(["completed", "cancelled", "closed_out"]);

type EventRow = {
  stage: unknown;
  startsAt?: number | null;
  expectedHeadcount?: number | null;
};

const isUpcoming = (e: EventRow, now: number) =>
  !DONE_STAGES.has(String(e.stage)) &&
  (e.startsAt == null || e.startsAt >= now - DAY);

/** Needs a decision or is about to happen without being ready. */
const needsAction = (e: EventRow, now: number) => {
  const stage = String(e.stage);
  if (stage === "pending_approval" || stage === "quote") return true;
  if (DONE_STAGES.has(stage)) return false;
  const soon = e.startsAt != null && e.startsAt - now < 14 * DAY;
  return soon && (stage === "planning" || !e.expectedHeadcount);
};

const TAB_LABEL: Record<"upcoming" | "attention" | "all", string> = {
  upcoming: "Upcoming",
  attention: "Needs action",
  all: "All",
};

export function EventsListPage() {
  const navigate = useNavigate();
  const events = useListEvent();
  const clients = useListClient();
  // Open on "Upcoming"; when nothing is upcoming, fall back to "All" so the
  // page never opens empty. A user choice always wins.
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [search, setSearch] = useState("");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const now = Date.now();

  const live = useMemo(
    () => (events ?? []).filter((e) => e.deletedAt == null),
    [events],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: live.length,
      upcoming: live.filter((e) => isUpcoming(e, now)).length,
      attention: live.filter((e) => needsAction(e, now)).length,
    };
    for (const s of EVENT_STAGES) c[s] = 0;
    for (const e of live) {
      const stage = String(e.stage);
      c[stage] = (c[stage] ?? 0) + 1;
    }
    return c;
  }, [live, now]);

  const tab: Tab =
    chosenTab ?? ((counts.upcoming ?? 0) > 0 ? "upcoming" : "all");

  const rows = useMemo(() => {
    let list = live;
    if (tab === "upcoming") list = list.filter((e) => isUpcoming(e, now));
    else if (tab === "attention")
      list = list.filter((e) => needsAction(e, now));
    else if (tab !== "all") list = list.filter((e) => e.stage === tab);
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
  }, [live, clients, tab, search, dir, now]);

  const questionTabs: Tab[] = ["upcoming", "attention", "all"];
  const stageFilter: EventStage | "" = questionTabs.includes(tab)
    ? ""
    : (tab as EventStage);
  const listTitle =
    tab === "upcoming"
      ? "Upcoming events"
      : tab === "attention"
        ? "Events that need action"
        : tab === "all"
          ? "All events"
          : `${STAGE_LABEL[tab as EventStage]} events`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Events"
        lead={`${counts.upcoming ?? 0} upcoming · ${counts.attention ?? 0} need action`}
        actions={[
          <Link key="new" to="/events/new" className="btn btn-primary">
            <PlusIcon /> New event
          </Link>,
          <ActionMenu key="more">
            <Link to="/events/capacity">Capacity calendar</Link>
            <Link to="/events/templates">Templates</Link>
          </ActionMenu>,
        ]}
      />

      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <div
          role="tablist"
          aria-label="Show"
          className="flex rounded-full bg-inset p-1"
        >
          {questionTabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-8 cursor-pointer rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === t
                  ? "bg-panel text-ink shadow-[0_1px_2px_rgb(30_40_36/0.15)]"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              {TAB_LABEL[t as keyof typeof TAB_LABEL]}
              <span
                className={`ml-1.5 text-xs ${t === "attention" && (counts[t] ?? 0) > 0 ? "font-bold text-warn" : "text-ink-2"}`}
              >
                {counts[t] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
          Stage
          <select
            className="input w-44"
            aria-label="Filter by stage"
            value={stageFilter}
            onChange={(e) =>
              setTab(e.target.value ? (e.target.value as EventStage) : "all")
            }
          >
            <option value="">Any stage</option>
            {EVENT_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]} ({counts[s] ?? 0})
              </option>
            ))}
          </select>
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, client, venue…"
          className="input min-w-0 flex-1 basis-56"
          aria-label="Filter events"
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
          aria-label={`Sort by date, currently ${dir === "asc" ? "soonest first" : "latest first"}`}
        >
          {dir === "asc" ? "Soonest first" : "Latest first"}
        </button>
        <div className="max-md:w-full">
          <SavedViewsBar<EventsView>
            pageKey="events"
            subjectArea="events"
            currentState={{ tab, search, dir }}
            onApply={(s) => {
              setTab(s.tab);
              setSearch(s.search);
              setDir(s.dir);
            }}
          />
        </div>
      </div>

      <section className="card" aria-labelledby="events-list-title">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id="events-list-title" className="text-lg font-semibold text-ink">
            {listTitle}
            <span className="ml-2 text-base font-medium text-ink-2">
              {rows.length}
            </span>
          </h2>
        </div>
        {events === undefined ? (
          <TableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              search || tab !== "all"
                ? "No events match this view"
                : "No events yet"
            }
            hint={
              search || tab !== "all"
                ? "Try another view, clear the search, or book a new event."
                : "Book the first event to start planning."
            }
            action={
              <Link to="/events/new" className="btn btn-primary">
                <PlusIcon /> New event
              </Link>
            }
          />
        ) : (
          <>
            <table className="w-full max-md:hidden">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th w-full">Event</th>
                  <th className="th">Stage</th>
                  <th className="th">Client</th>
                  <th className="th text-right">Guests</th>
                  <th className="th text-right">Budget</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e._id}
                    onClick={() => navigate(`/events/${e._id}`)}
                    className="cursor-pointer transition-colors hover:bg-inset"
                  >
                    <td className="td h-12">
                      <span className="block font-semibold text-ink">
                        {formatDate(e.startsAt)}
                      </span>
                      {e.startsAt != null ? (
                        <span
                          className={`block text-xs ${needsAction(e, now) ? "font-semibold text-warn" : "text-ink-2"}`}
                        >
                          {relativeDays(e.startsAt, now)}
                        </span>
                      ) : null}
                    </td>
                    <td className="td h-12 w-full max-w-0">
                      <Link
                        to={`/events/${e._id}`}
                        className="block truncate text-base font-semibold text-ink hover:underline"
                        onClick={(click) => click.stopPropagation()}
                      >
                        {e.title}
                      </Link>
                      <span className="block truncate text-xs text-ink-2">
                        {formatStatusLabel(e.eventType)}
                        {e.venueName ? ` · ${e.venueName}` : ""}
                      </span>
                    </td>
                    <td className="td h-12">
                      <StatusChip status={String(e.stage)} />
                    </td>
                    <td className="td h-12 text-ink-2">
                      {clientDisplayName(e.clientId, clients)}
                    </td>
                    <td className="td h-12 text-right">
                      {formatCount(e.expectedHeadcount)}
                    </td>
                    <td className="td h-12 text-right">
                      {formatMoney(e.budgetAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((e) => (
                <li key={e._id}>
                  <Link
                    to={`/events/${e._id}`}
                    className="block px-4 py-3 hover:bg-inset"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-base font-semibold text-ink">
                        {e.title}
                      </span>
                      <StatusChip status={String(e.stage)} />
                    </span>
                    <span className="mt-1 block text-sm text-ink-2">
                      {formatDate(e.startsAt)}
                      {e.startsAt != null ? (
                        <span
                          className={
                            needsAction(e, now) ? "font-semibold text-warn" : ""
                          }
                        >
                          {" "}
                          · {relativeDays(e.startsAt, now)}
                        </span>
                      ) : null}
                      {" · "}
                      {formatCount(e.expectedHeadcount)} guests
                    </span>
                    <span className="block truncate text-sm text-ink-2">
                      {clientDisplayName(e.clientId, clients)}
                      {e.venueName ? ` · ${e.venueName}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
