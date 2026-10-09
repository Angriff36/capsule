import {
  COMPLETED_STAGES,
  foodCostPercent,
  isBookedEvent,
  isConvertedLead,
  percentOf,
  profitMarginPercent,
} from "./dashboardRecordSets";
import { inWindow, type PeriodWindow } from "./scorecardPeriods";

/**
 * How each scorecard number is counted from live rows for one period.
 * A number whose rows are not loaded (or not readable) is null: "Not known
 * yet", never a made-up zero.
 */

export interface ScorecardEvent {
  readonly _id?: string;
  readonly startsAt?: number | null;
  readonly stage?: string | null;
  readonly quotedPrice?: number | null;
  readonly expectedHeadcount?: number | null;
}

export interface ScorecardCloseout {
  readonly finalizedAt?: number | null;
  readonly capturedAt?: number | null;
  readonly createdAt?: number | null;
  readonly grossProfit?: number | null;
  readonly actualIngredientCost?: number | null;
  readonly budgetedCost?: number | null;
}

export interface ScorecardLead {
  readonly createdAt?: number | null;
  readonly stage?: string | null;
  readonly proposalId?: string | null;
}

export interface ScorecardIncident {
  readonly eventId?: string | null;
  readonly status?: string | null;
  readonly deletedAt?: number | null;
}

export interface ScorecardShift {
  readonly startsAt?: number | null;
  readonly status?: string | null;
  readonly deletedAt?: number | null;
}

export interface ScorecardPrepTask {
  readonly dueAt?: number | null;
  readonly completedAt?: number | null;
  readonly status?: string | null;
  readonly deletedAt?: number | null;
}

export interface ScorecardWaste {
  readonly recordedAt?: number | null;
  readonly createdAt?: number | null;
  readonly quantity?: number | null;
  readonly unitCost?: number | null;
  readonly status?: string | null;
  readonly deletedAt?: number | null;
}

export interface ScorecardPerson {
  readonly status?: string | null;
  readonly employmentType?: string | null;
  readonly hireDate?: number | null;
  readonly terminationDate?: number | null;
  readonly createdAt?: number | null;
  readonly deletedAt?: number | null;
}

export interface ScorecardMaintenance {
  readonly nextDueAt?: number | null;
  readonly deletedAt?: number | null;
}

/** One event's client score and menu lines (convex/scorecardEventScores.ts). */
export interface ScorecardEventScore {
  readonly startsAt?: number | null;
  readonly stage?: string | null;
  readonly clientRating?: number | null;
  readonly menuLines?: number | null;
  readonly signatureLines?: number | null;
}

export interface ScorecardSources {
  readonly events: readonly ScorecardEvent[];
  readonly closeouts: readonly ScorecardCloseout[];
  readonly leads: readonly ScorecardLead[];
  /** Proposals the client accepted; a lead on one became business. */
  readonly acceptedProposalIds?: ReadonlySet<string>;
  readonly incidents?: readonly ScorecardIncident[];
  readonly shifts?: readonly ScorecardShift[];
  readonly prepTasks?: readonly ScorecardPrepTask[];
  readonly waste?: readonly ScorecardWaste[];
  readonly people?: readonly ScorecardPerson[];
  readonly maintenance?: readonly ScorecardMaintenance[];
  /** Undefined while loading or when this role may not read them. */
  readonly eventScores?: readonly ScorecardEventScore[];
}

const live = <T extends { deletedAt?: number | null }>(
  rows: readonly T[] | undefined,
) => rows?.filter((row) => row.deletedAt == null);

const OPEN_STAGES = ["quote", "planning", "pending_approval"];
/** Shifts a person turned up for. */
const WORKED_SHIFTS = ["started", "completed"];
/** Everyone but contractors is on the payroll (a W-2 employee). */
const NOT_W2 = ["contractor"];

const sumPrices = (events: readonly ScorecardEvent[]) =>
  events.reduce((sum, e) => sum + (e.quotedPrice ?? 0), 0);

/** The number for `key` over `window`; `now` decides what is overdue. */
export function measureValue(
  key: string,
  sources: ScorecardSources,
  window: PeriodWindow,
  now: Date,
): number | null {
  const events = sources.events.filter((e) => inWindow(e.startsAt, window));
  const booked = events.filter(isBookedEvent);
  const closeouts = sources.closeouts.filter((c) =>
    inWindow(c.finalizedAt ?? c.capturedAt ?? c.createdAt, window),
  );
  switch (key) {
    case "pipeline_value":
      return sumPrices(
        sources.events.filter((e) => OPEN_STAGES.includes(e.stage ?? "")),
      );
    case "booked_revenue_week":
    case "monthly_revenue":
      return sumPrices(booked);
    case "close_rate": {
      const lost = events.filter((e) => e.stage === "cancelled").length;
      return percentOf(booked.length, booked.length + lost);
    }
    case "avg_event_value":
      return booked.length > 0 ? sumPrices(booked) / booked.length : null;
    case "new_leads_week":
      return sources.leads.filter((l) => inWindow(l.createdAt, window)).length;
    case "lead_conversion": {
      const leads = sources.leads.filter((l) => inWindow(l.createdAt, window));
      return percentOf(
        leads.filter((lead) =>
          isConvertedLead(lead, sources.acceptedProposalIds ?? new Set()),
        ).length,
        leads.length,
      );
    }
    case "client_satisfaction": {
      const scores = sources.eventScores
        ?.filter(
          (e) =>
            inWindow(e.startsAt, window) &&
            e.stage !== "cancelled" &&
            e.clientRating != null,
        )
        .map((e) => Number(e.clientRating));
      if (!scores?.length) return null;
      return scores.reduce((sum, s) => sum + s, 0) / scores.length;
    }
    case "menu_adoption": {
      const scored = sources.eventScores?.filter(
        (e) =>
          inWindow(e.startsAt, window) &&
          e.stage !== "cancelled" &&
          e.menuLines != null,
      );
      if (!scored) return null;
      return percentOf(
        scored.reduce((sum, e) => sum + (e.signatureLines ?? 0), 0),
        scored.reduce((sum, e) => sum + (e.menuLines ?? 0), 0),
      );
    }
    case "events_completed":
      return events.filter((e) => COMPLETED_STAGES.includes(e.stage ?? ""))
        .length;
    case "guests":
      return booked.reduce((sum, e) => sum + (e.expectedHeadcount ?? 0), 0);
    case "food_cost_percent":
      return foodCostPercent(closeouts);
    case "profit_margin":
      return profitMarginPercent(closeouts);
    case "event_issue_rate": {
      const incidents = live(sources.incidents);
      if (!incidents) return null;
      const held = events.filter((e) => e.stage !== "cancelled");
      const withIssue = new Set(
        incidents
          .filter((i) => i.status !== "dismissed")
          .map((i) => String(i.eventId)),
      );
      return percentOf(
        held.filter((e) => withIssue.has(String(e._id))).length,
        held.length,
      );
    }
    case "staff_utilization": {
      const shifts = live(sources.shifts)?.filter(
        (s) =>
          inWindow(s.startsAt, window) &&
          s.status !== "cancelled" &&
          (s.startsAt ?? 0) <= now.getTime(),
      );
      if (!shifts) return null;
      return percentOf(
        shifts.filter((s) => WORKED_SHIFTS.includes(s.status ?? "")).length,
        shifts.length,
      );
    }
    case "prep_on_time": {
      // Tasks due in the period whose time has come, done by the due time.
      const due = live(sources.prepTasks)?.filter(
        (t) =>
          inWindow(t.dueAt, window) &&
          t.status !== "cancelled" &&
          (t.dueAt ?? 0) <= now.getTime(),
      );
      if (!due) return null;
      return percentOf(
        due.filter(
          (t) =>
            t.status === "completed" &&
            t.completedAt != null &&
            t.completedAt <= (t.dueAt ?? 0),
        ).length,
        due.length,
      );
    }
    case "waste_percent": {
      const waste = live(sources.waste)?.filter(
        (w) =>
          w.status !== "voided" &&
          inWindow(w.recordedAt ?? w.createdAt, window),
      );
      if (!waste) return null;
      const foodCost = closeouts.reduce(
        (sum, c) => sum + (c.actualIngredientCost ?? 0),
        0,
      );
      return percentOf(
        waste.reduce(
          (sum, w) => sum + (w.quantity ?? 0) * (w.unitCost ?? 0),
          0,
        ),
        foodCost,
      );
    }
    case "team_retention": {
      // On the team when the quarter began, and still on it at its end (or
      // today, for this quarter).
      const people = live(sources.people);
      if (!people) return null;
      const end = Math.min(window.to, now.getTime());
      const atStart = people.filter(
        (p) =>
          (p.hireDate ?? p.createdAt ?? 0) < window.from &&
          (p.terminationDate == null || p.terminationDate >= window.from),
      );
      return percentOf(
        atStart.filter(
          (p) => p.terminationDate == null || p.terminationDate >= end,
        ).length,
        atStart.length,
      );
    }
    case "equipment_current": {
      const scheduled = live(sources.maintenance)?.filter(
        (m) => m.nextDueAt != null,
      );
      if (!scheduled) return null;
      return percentOf(
        scheduled.filter((m) => (m.nextDueAt ?? 0) >= now.getTime()).length,
        scheduled.length,
      );
    }
    case "staff_w2_count": {
      const people = live(sources.people);
      if (!people) return null;
      return people.filter(
        (p) =>
          p.status === "active" && !NOT_W2.includes(p.employmentType ?? ""),
      ).length;
    }
    default:
      return null;
  }
}
