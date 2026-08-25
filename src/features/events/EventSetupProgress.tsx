import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import { CheckIcon, ChevronRightIcon } from "../../ui/icons";

type SetupItem = {
  key: string;
  label: string;
  /** true = satisfied, false = gap, undefined = still loading */
  ready: boolean | undefined;
  fixTo: string;
  fixLabel: string;
};

type EventSetupFlags = {
  hasAssignedClient?: boolean;
  hasExpectedHeadcount?: boolean;
  hasMenuDishes?: boolean;
  hasStaffAssigned?: boolean;
};

/**
 * Lists the setup gaps that stop an event from deriving prep lists, demand,
 * and staffing. Flags come from Event Manifest computeds (isSetupReady family).
 */
export function EventSetupProgress({
  eventId,
  event,
}: {
  readonly eventId: Id<"events">;
  readonly event: EventSetupFlags | undefined | null;
}) {
  const items: SetupItem[] = [
    {
      key: "client",
      label: "Client assigned",
      ready: event == null ? undefined : Boolean(event.hasAssignedClient),
      fixTo: "/clients",
      fixLabel: "Assign client",
    },
    {
      key: "headcount",
      label: "Expected headcount set",
      ready: event == null ? undefined : Boolean(event.hasExpectedHeadcount),
      fixTo: `/events/${eventId}?tab=overview#event-setup-basics`,
      fixLabel: "Set headcount",
    },
    {
      key: "dishes",
      label: "Menu dishes selected",
      ready: event == null ? undefined : Boolean(event.hasMenuDishes),
      fixTo: `/events/${eventId}?tab=menu`,
      fixLabel: "Add dishes",
    },
    {
      key: "staff",
      label: "Staff assigned",
      ready: event == null ? undefined : Boolean(event.hasStaffAssigned),
      fixTo: `/events/${eventId}?tab=staffing`,
      fixLabel: "Assign staff",
    },
  ];

  const gaps = items.filter((item) => item.ready === false).length;
  const done = items.filter((item) => item.ready === true).length;
  const gapWord = gaps === 1 ? "gap" : "gaps";
  const description =
    gaps > 0
      ? `${gaps} ${gapWord} block prep, demand, and staffing automation. Resolve each to let the event derive downstream work.`
      : "Client, headcount, menu, and staff are set. Downstream work can derive from this event.";

  const percent = Math.round((done / items.length) * 100);
  return (
    <section className="card p-5" data-testid="event-setup-progress">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Setup readiness</h2>
          <p className="mt-0.5 text-sm text-ink-2">{description}</p>
        </div>
        <p className="text-2xl font-bold text-ink">
          {done}
          <span className="text-base font-medium text-ink-2">
            {" "}
            of {items.length} ready
          </span>
        </p>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-inset"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-label="Setup readiness"
      >
        <div
          className={`h-full rounded-full ${gaps === 0 ? "bg-ok" : "bg-warn"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <SetupProgressRow key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

function SetupReadyIcon({ ready }: { readonly ready: boolean | undefined }) {
  if (ready === true) {
    return <CheckIcon className="text-ok" width={16} height={16} />;
  }
  if (ready === false) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-warn"
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full bg-line-2"
      aria-hidden="true"
    />
  );
}

function SetupProgressRow({ item }: { readonly item: SetupItem }) {
  let action;
  if (item.ready === false) {
    const linkClass =
      "inline-flex items-center gap-0.5 text-sm font-medium text-link";
    action = item.fixTo.startsWith("#") ? (
      <a href={item.fixTo} className={linkClass}>
        {item.fixLabel}
        <ChevronRightIcon width={13} height={13} />
      </a>
    ) : (
      <Link to={item.fixTo} className={linkClass}>
        {item.fixLabel}
        <ChevronRightIcon width={13} height={13} />
      </Link>
    );
  } else {
    action = (
      <span className="text-sm text-ink-3">
        {item.ready === true ? "Ready" : "Checking…"}
      </span>
    );
  }

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-sm border px-3 py-2.5 text-base ${
        item.ready === false
          ? "border-warn/40 bg-warn-soft"
          : "border-line bg-inset"
      }`}
    >
      <span className="flex items-center gap-2">
        <SetupReadyIcon ready={item.ready} />
        <span className="font-medium text-ink">{item.label}</span>
      </span>
      {action}
    </li>
  );
}
