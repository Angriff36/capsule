import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import { CheckIcon, ChevronRightIcon } from "../../ui/icons";
import { EventTabPanel } from "./EventTabPanel";

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

  return (
    <EventTabPanel
      eyebrow="Setup readiness"
      title={`${done} of ${items.length} ready`}
      description={description}
      testId="event-setup-progress"
    >
      <ul className="divide-y divide-line-2 rounded-sm border border-line-2 bg-panel">
        {items.map((item) => (
          <SetupProgressRow key={item.key} item={item} />
        ))}
      </ul>
    </EventTabPanel>
  );
}

function SetupReadyIcon({ ready }: { readonly ready: boolean | undefined }) {
  if (ready === true) {
    return <CheckIcon className="text-ok" width={14} height={14} />;
  }
  if (ready === false) {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-warn"
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-line-2"
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
    <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-base">
      <span className="flex items-center gap-2">
        <SetupReadyIcon ready={item.ready} />
        <span className={item.ready === false ? "text-ink" : "text-ink-2"}>
          {item.label}
        </span>
      </span>
      {action}
    </li>
  );
}
