import { Link } from "react-router-dom";
import type { Doc, Id } from "../../lib/api";
import { Section } from "../../ui/primitives";
import { CheckIcon, ChevronRightIcon } from "../../ui/icons";

type SetupItem = {
  key: string;
  label: string;
  /** true = satisfied, false = gap, undefined = still loading */
  ready: boolean | undefined;
  fixTo: string;
  fixLabel: string;
};

/**
 * Lists the setup gaps that stop an event from deriving prep lists, demand,
 * and staffing. Each gap links to where it gets fixed. Answers the common
 * "why didn't the automation fire" question before it becomes a support ticket.
 */
export function EventSetupProgress({
  eventId,
  clientId,
  clients,
  expectedHeadcount,
  eventDishes,
  eventAssignments,
}: {
  eventId: Id<"events">;
  clientId: Id<"clients">;
  clients: Doc<"clients">[] | undefined;
  expectedHeadcount: number;
  eventDishes: Doc<"eventDishes">[] | undefined;
  eventAssignments: Doc<"eventAssignments">[] | undefined;
}) {
  const dishCount = eventDishes?.filter(
    (row) =>
      row.eventId === eventId && row.deletedAt == null && row.removedAt == null,
  ).length;
  const staffCount = eventAssignments?.filter(
    (row) =>
      row.eventId === eventId &&
      row.deletedAt == null &&
      row.status !== "unassigned",
  ).length;

  const items: SetupItem[] = [
    {
      key: "client",
      label: "Client assigned",
      ready:
        clients === undefined
          ? undefined
          : clients.some((c) => c._id === clientId && c.deletedAt == null),
      fixTo: "/clients",
      fixLabel: "Assign client",
    },
    {
      key: "headcount",
      label: "Expected headcount set",
      ready: expectedHeadcount > 0,
      fixTo: "#event-setup-basics",
      fixLabel: "Set headcount",
    },
    {
      key: "dishes",
      label: "Menu dishes selected",
      ready: dishCount === undefined ? undefined : dishCount > 0,
      fixTo: `/kitchen/event-menu?eventId=${eventId}`,
      fixLabel: "Add dishes",
    },
    {
      key: "staff",
      label: "Staff assigned",
      ready: staffCount === undefined ? undefined : staffCount > 0,
      fixTo: "/staff/roster",
      fixLabel: "Assign staff",
    },
  ];

  const gaps = items.filter((item) => item.ready === false).length;
  const done = items.filter((item) => item.ready === true).length;

  return (
    <Section title="Setup readiness" count={done}>
      {gaps > 0 ? (
        <p className="border-b border-line bg-warn-soft/40 px-3 py-2 text-[12px] text-warn">
          {gaps} {gaps === 1 ? "gap" : "gaps"} block prep, demand, and staffing
          automation. Resolve each to let the event derive downstream work.
        </p>
      ) : null}
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex items-center justify-between px-3 py-2 text-[13px]"
          >
            <span className="flex items-center gap-2">
              {item.ready === true ? (
                <CheckIcon className="text-ok" width={14} height={14} />
              ) : item.ready === false ? (
                <span
                  className="inline-block h-2 w-2 rounded-full bg-warn"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="inline-block h-2 w-2 rounded-full bg-line-2"
                  aria-hidden="true"
                />
              )}
              <span
                className={item.ready === false ? "text-ink" : "text-ink-2"}
              >
                {item.label}
              </span>
            </span>
            {item.ready === false ? (
              item.fixTo.startsWith("#") ? (
                <a
                  href={item.fixTo}
                  className="inline-flex items-center gap-0.5 text-[12px] font-medium text-link"
                >
                  {item.fixLabel}
                  <ChevronRightIcon width={13} height={13} />
                </a>
              ) : (
                <Link
                  to={item.fixTo}
                  className="inline-flex items-center gap-0.5 text-[12px] font-medium text-link"
                >
                  {item.fixLabel}
                  <ChevronRightIcon width={13} height={13} />
                </Link>
              )
            ) : (
              <span className="text-[12px] text-ink-3">
                {item.ready === true ? "Ready" : "Checking…"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
