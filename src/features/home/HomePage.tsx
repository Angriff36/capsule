import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import {
  useListEvent,
  useListEventCloseout,
  useListInvoice,
  useListPackList,
  useListPrepTask,
} from "../../lib/manifest-convex-react";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { eventsIndexPath } from "../events/eventRoutes";
import {
  HomeAttentionPolicy,
  type HomeAttentionItem,
  type HomeUpcomingService,
} from "./HomeAttentionPolicy";

const policy = new HomeAttentionPolicy();
const DAY_MS = 86_400_000;

/** The lanes that mean somebody has to decide something today. */
const DECISION_LANES = new Set(["open_prep", "open_packs", "open_invoices"]);

function severityOf(item: HomeAttentionItem): "danger" | "warn" {
  return item.id === "open_prep" || item.id === "open_packs"
    ? "danger"
    : "warn";
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function timeOf(startsAt: number | null): string {
  if (startsAt == null) return "Unscheduled";
  return new Date(startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayOf(startsAt: number | null): string {
  if (startsAt == null) return "TBC";
  return new Date(startsAt).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });
}

/** `SECTION ————————— trailing context` — DESIGN.md section-rule. */
function SectionRule({
  label,
  trailing,
}: {
  label: string;
  trailing?: string;
}) {
  return (
    <div className="section-rule">
      <span>{label}</span>
      <i />
      {trailing ? <em>{trailing}</em> : null}
    </div>
  );
}

/** `LABEL: value` — DESIGN.md fact-pair. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="fact">
      <b>{label}:</b>
      {value}
    </span>
  );
}

function ServiceRow({
  service,
  next,
}: {
  service: HomeUpcomingService;
  next: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-x-6 border-t border-line py-4 max-md:grid-cols-1 max-md:gap-y-2">
      <div>
        <div className="font-mono text-base font-semibold text-ink">
          {timeOf(service.startsAt)}
        </div>
        {next ? (
          <div className="text-accent-deep text-sm font-semibold tracking-[0.06em] uppercase">
            Next
          </div>
        ) : null}
      </div>
      <div>
        <Link
          to={service.href}
          className="font-display text-xl text-ink hover:underline"
        >
          {service.title}
        </Link>
        {service.readiness.length > 0 ? (
          <div className="fact-row mt-1">
            <Fact label="Readiness" value={service.readiness.join(" · ")} />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="chip-meta capitalize">
          {service.stage.replace(/_/g, " ")}
        </span>
        <Link to={service.href} className="btn btn-ghost btn-sm">
          Open brief
        </Link>
      </div>
    </div>
  );
}

function Decision({ item }: { item: HomeAttentionItem }) {
  const severity = severityOf(item);
  return (
    <div>
      <span
        className={`chip-state ${
          severity === "danger" ? "chip-state-danger" : "chip-state-warn"
        }`}
      >
        {severity === "danger" ? "Blocking" : "Open"}
      </span>
      <div className="font-display mt-3 text-2xl leading-tight text-ink">
        {item.count} {item.label.toLowerCase()}
      </div>
      <p className="mt-1 text-base text-ink-2">{item.detail}</p>
      <Link to={item.href} className="btn btn-primary mt-4">
        Open
      </Link>
    </div>
  );
}

/**
 * Today's service — the operator's home. It answers, in order: what needs a
 * decision now, what is running today, and what is coming next. Every number
 * comes from HomeAttentionPolicy, so it is a queryable fact rather than a
 * dashboard estimate.
 */
export function HomePage() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const events = useListEvent();
  const invoices = useListInvoice();
  const prepTasks = useListPrepTask();
  const packLists = useListPackList();
  const closeouts = useListEventCloseout();

  const loading = [
    authStatus,
    events,
    invoices,
    prepTasks,
    packLists,
    closeouts,
  ].some((value) => value === undefined);
  const { loadingTooLong } = useSlowQuery(loading ? undefined : true);

  if (loading) {
    return (
      <QueryLoadState
        loadingTooLong={loadingTooLong}
        title="Still loading today’s service"
      />
    );
  }

  const snapshot = policy.build({
    role: authStatus?.role ?? "staff",
    events,
    invoices,
    prepTasks,
    packLists,
    closeouts,
  });

  const now = Date.now();
  const startOfToday = startOfDay(now);
  const endOfToday = startOfToday + DAY_MS;
  const today = snapshot.upcoming.filter(
    (s) =>
      s.startsAt != null &&
      s.startsAt >= startOfToday &&
      s.startsAt < endOfToday,
  );
  const later = snapshot.upcoming.filter(
    (s) => s.startsAt == null || s.startsAt >= endOfToday,
  );
  const decisions = snapshot.attention.filter(
    (item) => DECISION_LANES.has(item.id) && item.count > 0,
  );
  const thisWeek = snapshot.attention.find(
    (item) => item.id === "services_this_week",
  );

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="font-display text-accent-deep text-lg italic underline underline-offset-4">
            {new Date(now).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <h1 className="font-display mt-1 text-4xl leading-none tracking-tight text-ink">
            Today’s service
          </h1>
          <div className="fact-row mt-3">
            <Fact label="Today" value={`${today.length} services`} />
            <Fact label="This week" value={String(thisWeek?.count ?? 0)} />
            {today[0] ? (
              <Fact
                label="Next"
                value={`${timeOf(today[0].startsAt)} · ${today[0].title}`}
              />
            ) : null}
          </div>
        </div>
        <Link to={eventsIndexPath()} className="btn btn-primary">
          All events
        </Link>
      </div>

      <div className="attention-band mt-7 -mx-8 px-8 py-5 max-md:-mx-4 max-md:px-4">
        <SectionRule
          label="Needs a decision"
          trailing={
            decisions.length > 0 ? `${decisions.length} open` : undefined
          }
        />
        {decisions.length === 0 ? (
          <p className="mt-3 text-base text-ink-2">
            Nothing is asking for you.
          </p>
        ) : (
          <div className="mt-4 grid gap-x-11 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
            {decisions.map((item) => (
              <Decision key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-7">
        <SectionRule
          label="Today’s services"
          trailing={today.length === 0 ? "none scheduled" : undefined}
        />
        {today.length === 0 ? (
          <p className="mt-3 text-base text-ink-2">
            No service is scheduled for today.{" "}
            <Link to={eventsIndexPath()} className="text-brand underline">
              Open the events book
            </Link>
            .
          </p>
        ) : (
          <div className="mt-1">
            {today.map((service, i) => (
              <ServiceRow key={service.id} service={service} next={i === 0} />
            ))}
          </div>
        )}
      </div>

      {later.length > 0 ? (
        <div className="mt-7">
          <SectionRule
            label="Week ahead"
            trailing={`${later.length} services`}
          />
          <div className="fact-row mt-3 gap-x-8">
            {later.slice(0, 5).map((service) => (
              <Link
                key={service.id}
                to={service.href}
                className="fact hover:underline"
              >
                <b>{dayOf(service.startsAt)}</b>
                {service.title}
              </Link>
            ))}
            <Link
              to={eventsIndexPath()}
              className="text-brand ml-auto text-base underline underline-offset-4"
            >
              Open the week
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
