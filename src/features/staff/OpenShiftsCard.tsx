import {
  useEventStaffNeedClaim,
  useEventStaffNeedReleaseClaim,
  type useListEvent,
  type useListEventStaffNeed,
} from "../../lib/manifest-convex-react";
import { formatTime } from "../../lib/format";
import { EmptyState, Section, StatusChip } from "../../ui/primitives";

type NeedRow = NonNullable<ReturnType<typeof useListEventStaffNeed>>[number];
type EventRow = NonNullable<ReturnType<typeof useListEvent>>[number];

const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/**
 * Open shifts a crew member can pick up, like a shift board: every posted,
 * unfilled staffing need on an upcoming event. Picking one up asks for it; a
 * manager then confirms it and it moves to My schedule. A pick-up still
 * waiting for a manager can be given back.
 */
export function OpenShiftsCard({
  personId,
  needs,
  events,
  now,
  busy,
  run,
}: {
  readonly personId: string;
  readonly needs: readonly NeedRow[] | undefined;
  readonly events: readonly EventRow[] | undefined;
  readonly now: number;
  readonly busy: string | null;
  readonly run: (key: string, work: () => Promise<void>) => void;
}) {
  const claim = useEventStaffNeedClaim();
  const giveBack = useEventStaffNeedReleaseClaim();
  const eventOf = (id: string) => events?.find((event) => event._id === id);
  const startOf = (need: NeedRow) =>
    need.startsAt ?? eventOf(need.eventId)?.startsAt ?? null;
  const upcoming = (need: NeedRow) => {
    const end = need.endsAt ?? eventOf(need.eventId)?.endsAt ?? startOf(need);
    return end == null || end >= now;
  };
  const live = (needs ?? [])
    .filter(
      (need) =>
        need.deletedAt == null && need.postedAt != null && upcoming(need),
    )
    .sort(
      (a, b) => Number(startOf(a) ?? Infinity) - Number(startOf(b) ?? Infinity),
    );
  const open = live.filter((need) => need.status === "open");
  const mine = live.filter(
    (need) => need.status === "claimed" && need.claimedByPersonId === personId,
  );

  const row = (need: NeedRow, action: "pick" | "give") => {
    const event = eventOf(need.eventId);
    const start = startOf(need);
    const end = need.endsAt ?? event?.endsAt ?? null;
    const key = `open-shift:${need._id}`;
    return (
      <li
        key={need._id}
        className="flex items-center justify-between gap-3 py-2"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink">
            {need.role || "Crew"} · {event?.title ?? "Event"}
          </span>
          <span className="block text-sm text-ink-2">
            {start != null
              ? `${dayLabel(start)} · ${formatTime(start)}${end != null ? ` – ${formatTime(end)}` : ""}`
              : "Time to be set"}
            {event?.venueName ? ` · ${event.venueName}` : ""}
          </span>
          {need.uniform || need.description ? (
            <span className="block text-sm text-ink-3">
              {[need.description, need.uniform && `Wear: ${need.uniform}`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : null}
        </span>
        {action === "pick" ? (
          <button
            type="button"
            className="btn btn-primary btn-sm py-2 max-sm:min-h-11"
            disabled={busy != null}
            onClick={() =>
              run(key, () =>
                claim({ docId: need._id, version: need.version, personId }),
              )
            }
          >
            {busy === key ? "Picking up…" : "Pick up"}
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-2">
            <StatusChip status="pending" label="Waiting for manager" />
            <button
              type="button"
              className="btn btn-ghost btn-sm py-2 max-sm:min-h-11"
              disabled={busy != null}
              onClick={() =>
                run(key, () =>
                  giveBack({ docId: need._id, version: need.version }),
                )
              }
            >
              {busy === key ? "Giving back…" : "Give back"}
            </button>
          </span>
        )}
      </li>
    );
  };

  return (
    <div id="my-day-open-shifts" data-testid="my-open-shifts">
      <Section title="Open shifts" count={open.length}>
        {open.length === 0 && mine.length === 0 ? (
          <EmptyState
            title="No open shifts right now"
            hint="When a manager posts a shift that needs crew, it shows up here to pick up."
          />
        ) : (
          <div className="px-4 pb-4">
            {mine.length > 0 ? (
              <>
                <p className="py-2 text-sm text-ink-2">
                  You asked for these. A manager confirms them, then they move
                  to My schedule.
                </p>
                <ul className="divide-y divide-line-2">
                  {mine.map((need) => row(need, "give"))}
                </ul>
              </>
            ) : null}
            {open.length > 0 ? (
              <ul className="divide-y divide-line-2">
                {open.map((need) => row(need, "pick"))}
              </ul>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  );
}
