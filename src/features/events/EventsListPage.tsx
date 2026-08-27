import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCount } from "../../lib/format";
import { useListClient, useListEvent } from "../../lib/manifest-convex-react";
import { PlusIcon } from "../../ui/icons";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  ActionMenu,
  EmptyState,
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

/** Ledger group heading: "Today" / "Tomorrow" / "Fri 28 August". */
function dayLabel(day: number, now: number): string {
  const today = new Date(now).setHours(0, 0, 0, 0);
  if (day === today) return "Today";
  if (day === today + DAY) return "Tomorrow";
  if (day === today - DAY) return "Yesterday";
  return new Date(day).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

/** Service time — the column an operator scans first. */
function timeLabel(startsAt: number | null | undefined): string {
  if (startsAt == null) return "—";
  return new Date(startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventsListPage() {
  const navigate = useNavigate();
  const events = useListEvent();
  const clients = useListClient();
  // Open on "Upcoming"; when nothing is upcoming, fall back to "All" so the
  // page never opens empty. A user choice always wins.
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [search, setSearch] = useState("");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const totalCovers = rows.reduce(
    (sum, e) => sum + (Number(e.expectedHeadcount) || 0),
    0,
  );

  // Group into service days. A ledger reads by day, not by row number: the
  // operator asks what is on Thursday, never what is in row 14.
  const groups = useMemo(() => {
    const byDay = new Map<number, typeof rows>();
    const undated: typeof rows = [];
    for (const e of rows) {
      if (e.startsAt == null) {
        undated.push(e);
        continue;
      }
      const key = new Date(e.startsAt).setHours(0, 0, 0, 0);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(e);
      else byDay.set(key, [e]);
    }
    const ordered = [...byDay.entries()].sort((a, b) =>
      dir === "asc" ? a[0] - b[0] : b[0] - a[0],
    );
    const out = ordered.map(([day, list]) => ({
      key: String(day),
      label: dayLabel(day, now),
      list,
    }));
    if (undated.length > 0) {
      out.push({ key: "undated", label: "Date to confirm", list: undated });
    }
    return out;
  }, [rows, dir, now]);

  const filterControls = (
    <>
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
            className={`h-11 cursor-pointer rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors md:h-9 ${
              tab === t
                ? "bg-panel text-ink shadow-[0_1px_2px_rgb(30_40_36/0.15)]"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            {TAB_LABEL[t as keyof typeof TAB_LABEL]}
            <span
              className={`ml-1.5 ${t === "attention" && (counts[t] ?? 0) > 0 ? "font-bold text-warn" : "text-ink-2"}`}
            >
              {counts[t] ?? 0}
            </span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
        Stage
        <select
          className="input h-11 w-44 md:h-9"
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
        className="input h-11 min-w-0 flex-1 basis-56 md:h-9"
        aria-label="Filter events"
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm h-11 md:h-8"
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
    </>
  );

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="display-title text-ink">Events</h1>
          <div className="fact-row mt-3">
            <span className="fact">
              <b>Upcoming:</b>
              {counts.upcoming ?? 0}
            </span>
            <span className="fact">
              <b>Needs action:</b>
              <span
                className={
                  (counts.attention ?? 0) > 0 ? "font-medium text-warn" : ""
                }
              >
                {counts.attention ?? 0}
              </span>
            </span>
            <span className="fact">
              <b>Covers booked:</b>
              {formatCount(totalCovers)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/events/new" className="btn btn-primary">
            <PlusIcon /> New event
          </Link>
          <ActionMenu>
            <Link to="/events/capacity">Capacity calendar</Link>
            <Link to="/events/templates">Templates</Link>
          </ActionMenu>
        </div>
      </div>

      {/* Filters are one composed strip between rules, not a floating card. On
          a phone they collapse behind a single control so the ledger leads. */}
      <div className="mt-6 border-y border-line">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className="flex h-11 w-full cursor-pointer items-center justify-between text-sm font-semibold tracking-[0.09em] text-ink uppercase md:hidden"
        >
          Filters
          <span className="font-normal tracking-normal text-ink-2 normal-case">
            {TAB_LABEL[tab as keyof typeof TAB_LABEL] ??
              STAGE_LABEL[tab as EventStage]}
            {search ? ` · ${search}` : ""}
          </span>
        </button>
        <div
          className={`flex-wrap items-center gap-3 py-3 max-md:pb-4 md:flex ${
            filtersOpen ? "flex" : "hidden"
          }`}
        >
          {filterControls}
        </div>
      </div>

      {events === undefined ? (
        <div className="mt-6">
          <TableSkeleton rows={8} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-10">
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
        </div>
      ) : (
        <div aria-label={listTitle}>
          {groups.map((group) => {
            const covers = group.list.reduce(
              (sum, e) => sum + (Number(e.expectedHeadcount) || 0),
              0,
            );
            return (
              <section key={group.key} className="mt-7">
                <div className="section-rule">
                  <span>{group.label}</span>
                  <i />
                  <em>
                    {group.list.length}{" "}
                    {group.list.length === 1 ? "service" : "services"}
                    {covers > 0 ? ` · ${formatCount(covers)} covers` : ""}
                  </em>
                </div>
                {group.list.map((e) => (
                  <div
                    key={e._id}
                    onClick={() => navigate(`/events/${e._id}`)}
                    className="grid cursor-pointer grid-cols-[104px_minmax(0,1fr)_180px_78px_142px_104px] items-center gap-x-5 border-b border-line py-4 transition-colors hover:bg-inset max-md:grid-cols-1 max-md:gap-y-1.5 max-md:py-3.5"
                  >
                    <div>
                      <div className="font-mono text-base font-semibold text-ink">
                        {timeLabel(e.startsAt)}
                      </div>
                      {needsAction(e, now) ? (
                        <div className="text-sm font-semibold text-warn">
                          Needs action
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <Link
                        to={`/events/${e._id}`}
                        onClick={(click) => click.stopPropagation()}
                        className="font-display block truncate text-xl text-ink hover:underline"
                      >
                        {e.title}
                      </Link>
                      <div className="truncate text-sm text-ink-2">
                        {formatStatusLabel(e.eventType)} ·{" "}
                        {clientDisplayName(e.clientId, clients)}
                      </div>
                      {/* Venue and covers take their own line on a phone.
                          Appended to the line above they truncate away at
                          360px, and covers is the number being looked up. */}
                      <div className="text-sm text-ink-2 md:hidden">
                        {e.venueName ?? "Venue to confirm"} ·{" "}
                        {formatCount(e.expectedHeadcount)} covers
                      </div>
                    </div>
                    <div className="truncate text-base text-ink-2 max-md:hidden">
                      {e.venueName ?? "Venue to confirm"}
                    </div>
                    <div className="text-base text-ink max-md:hidden">
                      {formatCount(e.expectedHeadcount)}
                    </div>
                    <div className="flex items-center gap-3 max-md:mt-1">
                      <StatusChip status={String(e.stage)} />
                      <Link
                        to={`/events/${e._id}`}
                        onClick={(click) => click.stopPropagation()}
                        className="text-base text-brand underline underline-offset-4 md:hidden"
                      >
                        Open brief
                      </Link>
                    </div>
                    <div className="text-right max-md:hidden">
                      <Link
                        to={`/events/${e._id}`}
                        onClick={(click) => click.stopPropagation()}
                        className="text-base text-brand underline underline-offset-4"
                      >
                        Open brief
                      </Link>
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
          <p className="mt-7 text-base text-ink-2">
            {rows.length} {rows.length === 1 ? "event" : "events"} in this view.
            {tab !== "all" ? (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setTab("all")}
                  className="cursor-pointer text-brand underline underline-offset-4"
                >
                  See all {counts.all ?? 0}
                </button>
              </>
            ) : null}
          </p>
        </div>
      )}
    </div>
  );
}
