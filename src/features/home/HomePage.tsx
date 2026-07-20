import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import { formatDate, relativeDays } from "../../lib/format";
import {
  useListEvent,
  useListEventCloseout,
  useListInvoice,
  useListPackList,
  useListPrepTask,
} from "../../lib/manifest-convex-react";
import { EmptyState, PageHeader, StatusChip } from "../../ui/primitives";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { HomeAttentionPolicy } from "./HomeAttentionPolicy";

const policy = new HomeAttentionPolicy();

/** Role-shaped attention ledger over queryable operational facts. */
export function HomePage() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const events = useListEvent();
  const invoices = useListInvoice();
  const prepTasks = useListPrepTask();
  const packLists = useListPackList();
  const closeouts = useListEventCloseout();

  const loading =
    authStatus === undefined ||
    events === undefined ||
    invoices === undefined ||
    prepTasks === undefined ||
    packLists === undefined ||
    closeouts === undefined;
  const { loadingTooLong } = useSlowQuery(loading ? undefined : true);

  const desk = useMemo(() => {
    if (loading || authStatus == null) return null;
    return policy.build({
      role: authStatus.role || "staff",
      events,
      invoices,
      prepTasks,
      packLists,
      closeouts,
    });
  }, [loading, authStatus, events, invoices, prepTasks, packLists, closeouts]);

  if (loading || desk == null) {
    return (
      <QueryLoadState
        loadingTooLong={loadingTooLong}
        title="Still loading the service desk"
        detail="Waiting on workspace membership and operational lists."
      />
    );
  }

  const roleLabel = desk.role.replaceAll("_", " ");

  return (
    <div className="operations-stage space-y-6">
      <header className="supply-masthead">
        <div>
          <h1 className="display-title">Service desk</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Attention and upcoming services from records you can already query.
            Signed in as {roleLabel}.
          </p>
        </div>
        <Link to="/events/new" className="btn btn-primary h-10 px-4">
          New event
        </Link>
      </header>

      <section className="space-y-3">
        <PageHeader
          title="Needs attention"
          lead="Counts only appear when the list returns work for your role."
        />
        {desk.attention.length === 0 ? (
          <EmptyState
            title="Nothing queued"
            hint="No open invoices, prep, packs, or draft closeouts in the lists you can read."
          />
        ) : (
          <ul className="border border-line">
            {desk.attention.map((item) => (
              <li
                key={item.id}
                className="border-t border-line first:border-t-0"
              >
                <Link
                  to={item.href}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-inset"
                >
                  <div>
                    <p className="font-medium text-ink">{item.label}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {item.detail}
                    </p>
                  </div>
                  <span className="font-mono text-[14px] text-ink">
                    {item.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <PageHeader
          title="Upcoming services"
          lead="Next live bookings by start time, with verified readiness notes."
        />
        {desk.upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming services"
            hint="Active events with a future or unset start will show here."
          />
        ) : (
          <ul className="border border-line">
            {desk.upcoming.map((service) => (
              <li
                key={service.id}
                className="border-t border-line first:border-t-0"
              >
                <Link
                  to={service.href}
                  className="flex flex-col gap-2 px-4 py-3 hover:bg-inset sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-ink">{service.title}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {service.startsAt == null
                        ? "Start not set"
                        : `${formatDate(service.startsAt)} · ${relativeDays(service.startsAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={service.stage} />
                    {service.readiness.map((note) => (
                      <span key={note} className="text-[11px] text-ink-3">
                        {note}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
