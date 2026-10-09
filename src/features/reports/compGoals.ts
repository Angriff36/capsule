import {
  isBookedAhead,
  isOpen,
  isWon,
  totals,
  winLoss,
  within,
  yearPeriod,
  ytdPeriod,
  type SalesEvent,
} from "./mangia/salesFigures";
import { aevGrowthTracker } from "./aevGrowthTracker";
import {
  SCORECARD_AREAS,
  SCORECARD_MEASURES,
  liveTargets,
  type ScorecardTargetRow,
} from "./scorecardMeasures";
import {
  liveItems,
  liveMeetings,
  weekStartOf,
  type LeadershipItemRow,
  type LeadershipMeetingRow,
} from "./leadershipHistory";

/**
 * The owner's "Comp Master Status" sheet (Comp_Master_Status.html): the sales
 * lead's 16% performance comp in three goals - Sales System & Reporting (3%
 * of base), Average Event Value Growth (5%) and Company Scorecard & EOS (8%) -
 * each a checklist. Here each check is counted from Capsule's records where
 * Capsule has them; the rest are judged by hand and do not move the status.
 * A goal is on track when every counted check is met, in progress when some
 * are, and not started when none are. No pay is worked out here.
 */

export type CheckState = "met" | "not_yet" | "by_hand";
export type GoalStatus = "on_track" | "in_progress" | "not_started";

export interface GoalCheck {
  readonly label: string;
  readonly state: CheckState;
  readonly detail: string;
}

export interface CompGoal {
  readonly key: "sales" | "aev" | "eos";
  readonly title: string;
  /** Share of base pay, in percent, as on the sheet. */
  readonly share: number;
  readonly checks: readonly GoalCheck[];
  readonly status: GoalStatus;
}

export interface CompGoals {
  readonly goals: readonly CompGoal[];
  /** Points (percent of base) per status; 16 in all. */
  readonly points: Record<GoalStatus, number>;
  readonly total: number;
}

/** Weeks of meetings a "weekly" check looks back over. */
export const MEETING_WEEKS = 4;
/** Share of deals not held yet that must carry an add-on tag. */
export const TAGGED_SHARE = 0.8;
/** The sheet's areas with KPIs per department (the extra Capsule area is left out). */
const DEPARTMENTS = SCORECARD_AREAS.filter(
  (a) => a !== "Other Capsule numbers",
);

const check = (label: string, met: boolean, detail: string): GoalCheck => ({
  label,
  state: met ? "met" : "not_yet",
  detail,
});
const byHand = (label: string, detail: string): GoalCheck => ({
  label,
  state: "by_hand",
  detail,
});

function goal(
  key: CompGoal["key"],
  title: string,
  share: number,
  checks: GoalCheck[],
): CompGoal {
  const counted = checks.filter((c) => c.state !== "by_hand");
  const met = counted.filter((c) => c.state === "met").length;
  return {
    key,
    title,
    share,
    checks,
    status:
      counted.length > 0 && met === counted.length
        ? "on_track"
        : met > 0
          ? "in_progress"
          : "not_started",
  };
}

/** How many of the last full weeks (not this one) had a meeting written down. */
export function weeksWithMeeting(
  meetings: readonly LeadershipMeetingRow[],
  now: Date,
  weeks = MEETING_WEEKS,
): number {
  const thisWeek = weekStartOf(now);
  const held = liveMeetings(meetings);
  let count = 0;
  for (let i = 1; i <= weeks; i++) {
    const from = new Date(thisWeek);
    from.setDate(thisWeek.getDate() - 7 * i);
    const to = new Date(from);
    to.setDate(from.getDate() + 7);
    if (
      held.some((m) => m.heldAt! >= from.getTime() && m.heldAt! < to.getTime())
    )
      count++;
  }
  return count;
}

export function compGoals(input: {
  readonly events: readonly (SalesEvent & {
    readonly upsellPotential?: string | null;
  })[];
  readonly targets: readonly ScorecardTargetRow[];
  readonly items: readonly LeadershipItemRow[];
  readonly meetings: readonly LeadershipMeetingRow[];
  readonly now: Date;
}): CompGoals {
  const { events, now } = input;
  const year = now.getFullYear();
  const meetingWeeks = weeksWithMeeting(input.meetings, now);
  const meetingsMet = meetingWeeks === MEETING_WEEKS;
  const meetingsText = `Meetings written down in ${meetingWeeks} of the last ${MEETING_WEEKS} weeks.`;

  // Sales System & Reporting
  const ahead = events.filter((e) => isOpen(e) || isBookedAhead(e));
  const priced = ahead.filter((e) => (e.quotedPrice ?? 0) > 0).length;
  const sales = goal("sales", "Sales System & Reporting", 3, [
    check(
      "Every open deal has a value",
      ahead.length > 0 && priced === ahead.length,
      `${priced} of ${ahead.length} deals not held yet have a price.`,
    ),
    check(
      "Pipeline, booked revenue and forecast are live",
      true,
      "Tim's KPIs and the Mangia report count them from Capsule's events.",
    ),
    check(
      "Sales numbers reviewed in the weekly meeting",
      meetingsMet,
      meetingsText,
    ),
  ]);

  // Average Event Value Growth
  const tracker = aevGrowthTracker(events, now);
  const wonYtd = totals(within(events, ytdPeriod(now, year), isWon));
  const closeRate = winLoss(within(events, yearPeriod(year))).winRate;
  const tagged = ahead.filter((e) => e.upsellPotential != null).length;
  const aev = goal("aev", "Average Event Value Growth", 5, [
    check(
      "Average event value 10% above last year",
      tracker.goal != null && wonYtd.aev != null && wonYtd.aev >= tracker.goal,
      tracker.goal == null
        ? `No delivered events in ${year - 1} to grow from.`
        : `This year's won average ${money(wonYtd.aev)} against the ${money(tracker.goal)} goal.`,
    ),
    check(
      "Close rate not below last year",
      closeRate != null &&
        tracker.baselineCloseRate != null &&
        closeRate >= tracker.baselineCloseRate,
      `This year ${pct(closeRate)} against ${pct(tracker.baselineCloseRate)} last year.`,
    ),
    check(
      "Add-on plan in use",
      ahead.length > 0 && tagged >= ahead.length * TAGGED_SHARE,
      `${tagged} of ${ahead.length} deals not held yet carry an add-on potential tag (aim: ${TAGGED_SHARE * 100}%).`,
    ),
    byHand(
      "Value-based selling in every client talk",
      "Judged by listening to sales calls.",
    ),
  ]);

  // Company Scorecard & EOS
  const live = [...liveTargets(input.targets).values()];
  const areaOf = new Map(SCORECARD_MEASURES.map((m) => [m.key, m.area]));
  const areasWithTarget = new Set(
    live.map((t) => areaOf.get(t.metricKey)).filter((a) => a != null),
  );
  const departmentsCovered = DEPARTMENTS.filter((a) => areasWithTarget.has(a));
  const owned = live.filter((t) => t.ownerPersonId != null).length;
  const weekStart = weekStartOf(now).getTime();
  const rocks = liveItems(input.items).filter(
    (r) => r.kind === "rock" && r.status === "open",
  );
  const markedThisWeek = rocks.filter(
    (r) => r.track != null && (r.trackSetAt ?? 0) >= weekStart,
  ).length;
  const eos = goal("eos", "Company Scorecard & EOS", 8, [
    check(
      "Scorecard has numbers for every department",
      departmentsCovered.length === DEPARTMENTS.length,
      `Targets set in ${departmentsCovered.length} of ${DEPARTMENTS.length} areas (${DEPARTMENTS.join(", ")}).`,
    ),
    check(
      "Each scorecard number has an owner",
      live.length > 0 && owned === live.length,
      `${owned} of ${live.length} numbers with a target have an owner.`,
    ),
    check("Weekly leadership meetings held", meetingsMet, meetingsText),
    check(
      "Quarterly priorities set and marked each week",
      rocks.length >= 3 && rocks.length <= 7 && markedThisWeek === rocks.length,
      `${rocks.length} open priorities (aim: 3 to 7), ${markedThisWeek} marked this week.`,
    ),
    byHand("Traction read and EOS ideas in use", "Judged by the owner."),
  ]);

  const goals = [sales, aev, eos];
  const points: Record<GoalStatus, number> = {
    on_track: 0,
    in_progress: 0,
    not_started: 0,
  };
  for (const g of goals) points[g.status] += g.share;
  return { goals, points, total: 16 };
}

function money(value: number | null): string {
  return value == null ? "—" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}
