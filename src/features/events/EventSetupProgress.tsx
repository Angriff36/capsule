import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import { CheckIcon } from "../../ui/icons";
import { MinusIcon } from "./eventDetailIcons";
import { EventOverviewCard } from "./EventOverviewCard";

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
      fixLabel: "Assign",
    },
    {
      key: "headcount",
      label: "Headcount set",
      ready: event == null ? undefined : Boolean(event.hasExpectedHeadcount),
      fixTo: `/events/${eventId}?tab=overview#event-setup-basics`,
      fixLabel: "Set",
    },
    {
      key: "dishes",
      label: "Menu dishes added",
      ready: event == null ? undefined : Boolean(event.hasMenuDishes),
      fixTo: `/events/${eventId}?tab=menu`,
      fixLabel: "Add",
    },
    {
      key: "staff",
      label: "Staff assigned",
      ready: event == null ? undefined : Boolean(event.hasStaffAssigned),
      fixTo: `/events/${eventId}?tab=staffing`,
      fixLabel: "Assign",
    },
  ];

  const done = items.filter((item) => item.ready === true).length;
  const percent = Math.round((done / items.length) * 100);

  return (
    <EventOverviewCard
      title="Setup readiness"
      testId="event-setup-progress"
      aside={
        <span className="text-base font-semibold text-ink-2">
          {done}/{items.length}
        </span>
      }
    >
      <div
        className="h-1.5 overflow-hidden rounded-full bg-inset"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-label="Setup readiness"
      >
        <div
          className={`h-full rounded-full ${done === items.length ? "bg-ok" : "bg-accent"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="mt-4 grid gap-2.5">
        {items.map((item) => (
          <SetupProgressRow key={item.key} item={item} />
        ))}
      </ul>
    </EventOverviewCard>
  );
}

function SetupReadyIcon({ ready }: { readonly ready: boolean | undefined }) {
  if (ready === true) {
    return (
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
        <CheckIcon width={11} height={11} />
      </span>
    );
  }
  return (
    <span
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-ink-3 ${
        ready === false ? "bg-warn-soft" : "bg-inset"
      }`}
    >
      <MinusIcon width={11} height={11} />
    </span>
  );
}

function SetupProgressRow({ item }: { readonly item: SetupItem }) {
  const linkClass = "text-sm font-medium text-link";
  let action = null;
  if (item.ready === false) {
    action = item.fixTo.startsWith("#") ? (
      <a href={item.fixTo} className={linkClass}>
        {item.fixLabel}
      </a>
    ) : (
      <Link to={item.fixTo} className={linkClass}>
        {item.fixLabel}
      </Link>
    );
  }

  return (
    <li className="event-rail-row">
      <span className="event-rail-label">
        <SetupReadyIcon ready={item.ready} />
        <span className={item.ready === true ? "text-ink" : "text-ink-2"}>
          {item.label}
        </span>
      </span>
      {action}
    </li>
  );
}
