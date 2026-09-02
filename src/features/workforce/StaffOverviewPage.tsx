import { Link } from "react-router-dom";
import {
  useListEvent,
  useListEventAssignment,
  useListPerson,
  useListShift,
  useListShiftSwapRequest,
  useListTimeOffRequest,
} from "../../lib/manifest-convex-react";
import {
  EmptyState,
  PageHeader,
  Section,
  Skeleton,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { formatDate } from "../../lib/format";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTENTION_ROWS = 8;

interface AttentionRow {
  key: string;
  title: string;
  detail: string;
  status: string;
  to: string;
  at: number;
}

export function StaffOverviewPage() {
  const people = useListPerson();
  const shifts = useListShift();
  const assignments = useListEventAssignment();
  const swapRequests = useListShiftSwapRequest();
  const timeOffRequests = useListTimeOffRequest();
  const events = useListEvent();

  const loading =
    people === undefined ||
    shifts === undefined ||
    assignments === undefined ||
    swapRequests === undefined ||
    timeOffRequests === undefined ||
    events === undefined;

  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );
  const personName = (id: string) => {
    const person = people?.find((row) => String(row._id) === String(id));
    return person ? `${person.givenName} ${person.familyName}` : "Unknown";
  };
  const eventTitle = (id: string | undefined) =>
    events?.find((event) => String(event._id) === String(id))?.title ?? "—";

  const now = Date.now();
  const upcomingShifts = (shifts ?? []).filter(
    (shift) =>
      shift.deletedAt == null &&
      shift.status === "scheduled" &&
      shift.startsAt != null &&
      shift.startsAt >= now &&
      shift.startsAt < now + WEEK_MS,
  );
  const pendingTimeOff = (timeOffRequests ?? []).filter(
    (request) => request.deletedAt == null && request.status === "pending",
  );
  const pendingSwaps = (swapRequests ?? []).filter(
    (request) =>
      request.deletedAt == null && request.status === "awaiting_manager",
  );
  const unconfirmedAssignments = (assignments ?? []).filter(
    (assignment) =>
      assignment.deletedAt == null && assignment.status === "assigned",
  );

  const attentionRows: AttentionRow[] = [
    ...pendingTimeOff.map((request) => ({
      key: `time-off:${request._id}`,
      title: personName(request.personId),
      detail: `Time off · ${formatDate(request.startsAt)} → ${formatDate(
        request.endsAt,
      )}`,
      status: String(request.status),
      to: "/staff/time-off",
      at: request.createdAt ?? 0,
    })),
    ...pendingSwaps.map((request) => ({
      key: `swap:${request._id}`,
      title: personName(request.requesterPersonId),
      detail: `Shift swap with ${personName(request.recipientPersonId)}`,
      status: String(request.status),
      to: "/staff/swaps",
      at: request.createdAt ?? 0,
    })),
    ...unconfirmedAssignments.map((assignment) => ({
      key: `assignment:${assignment._id}`,
      title: personName(assignment.personId),
      detail: `Awaiting confirmation · ${eventTitle(assignment.eventId)}`,
      status: String(assignment.status),
      to: "/staff/roster",
      at: assignment.createdAt ?? 0,
    })),
  ]
    .sort((left, right) => left.at - right.at)
    .slice(0, MAX_ATTENTION_ROWS);

  const openRequestCount = pendingTimeOff.length + pendingSwaps.length;

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Staff"
        lead="What needs your attention about staffing today."
      />
      <WorkforceWorkspaceNav />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line lg:grid-cols-4">
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Active staff</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? <Skeleton className="h-7 w-12" /> : activePeople.length}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Shifts next 7 days</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              upcomingShifts.length
            )}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Open requests</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? <Skeleton className="h-7 w-12" /> : openRequestCount}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Unconfirmed assignments</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              unconfirmedAssignments.length
            )}
          </dd>
        </div>
      </dl>

      <Section
        title="Needs attention"
        count={loading ? undefined : attentionRows.length}
      >
        {loading ? (
          <TableSkeleton rows={4} columns={3} />
        ) : attentionRows.length === 0 ? (
          <EmptyState
            title="Nothing needs your attention."
            hint="Pending time off, swap requests, and unconfirmed assignments show up here."
            action={
              <Link to="/staff/roster" className="btn btn-ghost btn-sm">
                Open the roster
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {attentionRows.map((row) => (
              <li key={row.key}>
                <Link
                  to={row.to}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-inset"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {row.title}
                    </span>
                    <span className="block truncate text-sm text-ink-2">
                      {row.detail}
                    </span>
                  </span>
                  <StatusChip status={row.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
