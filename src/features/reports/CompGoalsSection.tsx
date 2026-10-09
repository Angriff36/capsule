import { useMemo } from "react";
import {
  useListLeadershipItem,
  useListLeadershipMeeting,
  useListScorecardTarget,
} from "@/lib/manifest-convex-react";
import { useEventRowsInRange } from "@/lib/financeScopedQueries";
import { Section, StatusChip } from "@/ui/primitives";
import { CHIP_TONE_CLASS } from "@/lib/statusLabels";
import { compGoals, type CheckState, type GoalStatus } from "./compGoals";
import type { ScorecardTargetRow } from "./scorecardMeasures";
import type {
  LeadershipItemRow,
  LeadershipMeetingRow,
} from "./leadershipHistory";

const STATUS: Record<GoalStatus, { label: string; tone: string }> = {
  on_track: { label: "On track", tone: CHIP_TONE_CLASS.ok },
  in_progress: { label: "In progress", tone: CHIP_TONE_CLASS.warn },
  not_started: { label: "Not started", tone: CHIP_TONE_CLASS.mute },
};

const MARK: Record<CheckState, { sign: string; className: string }> = {
  met: { sign: "✓", className: "text-ok" },
  not_yet: { sign: "○", className: "text-warn" },
  by_hand: { sign: "–", className: "text-ink-3" },
};

/**
 * The owner's Comp Master Status sheet on live records (compGoals.ts): the
 * three performance goals, their checks, and points on track out of 16.
 */
export function CompGoalsSection() {
  const now = useMemo(() => new Date(), []);
  // Last year (the baselines) through bookings a few years ahead.
  const range = useMemo(
    () => ({
      from: new Date(now.getFullYear() - 1, 0, 1).getTime(),
      to: new Date(now.getFullYear() + 3, 0, 1).getTime(),
    }),
    [now],
  );
  const events = useEventRowsInRange(range);
  const targets = useListScorecardTarget();
  const items = useListLeadershipItem();
  const meetings = useListLeadershipMeeting();
  const result = useMemo(
    () =>
      events && targets && items && meetings
        ? compGoals({
            events,
            targets: targets as ScorecardTargetRow[],
            items: items as LeadershipItemRow[],
            meetings: meetings as LeadershipMeetingRow[],
            now,
          })
        : null,
    [events, targets, items, meetings, now],
  );

  return (
    <div className="mb-6" data-testid="comp-goals">
      <Section title="Performance goals (16% of base)">
        {result == null ? (
          <p className="p-4 text-xs text-ink-2">Counting…</p>
        ) : (
          <div className="p-4">
            <p className="mb-3 text-sm text-ink">
              <strong>
                {result.points.on_track} of {result.total} points on track
              </strong>
              <span className="text-ink-2">
                {" "}
                · {result.points.in_progress} in progress ·{" "}
                {result.points.not_started} not started
              </span>
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {result.goals.map((g) => (
                <div
                  key={g.key}
                  className="rounded-sm border border-line bg-panel p-3"
                  data-testid={`comp-goal-${g.key}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-ink">
                      {g.title}
                    </h4>
                    <span className="shrink-0 text-xs text-ink-2">
                      {g.share}% of base
                    </span>
                  </div>
                  <div className="mt-1">
                    <StatusChip
                      status={STATUS[g.status].label}
                      color={STATUS[g.status].tone}
                    />
                  </div>
                  <ul className="mt-3 space-y-2">
                    {g.checks.map((c) => (
                      <li key={c.label} className="flex gap-2 text-xs">
                        <span
                          className={`w-3 shrink-0 font-semibold ${MARK[c.state].className}`}
                          aria-hidden
                        >
                          {MARK[c.state].sign}
                        </span>
                        <span>
                          <span className="text-ink">{c.label}</span>
                          {c.state === "by_hand" ? (
                            <span className="text-ink-3"> (check by hand)</span>
                          ) : null}
                          <span className="block text-ink-2">{c.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-2">
              From the owner's Comp Master Status sheet. A goal is on track when
              every counted check is met. Checks marked "check by hand" are
              judged in person and do not change the status. No pay is worked
              out here.
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}
