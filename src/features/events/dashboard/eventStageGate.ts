import type { EventDetailTab } from "../eventRoutes";
import { STAGE_LABEL, type EventStage } from "../eventStatus";
import { DASH_TRACK } from "./eventDashFacts";
import type { DashSheetId } from "./eventDashTypes";

/**
 * What stands between an event and its next stage, from facts the app already
 * has. Two kinds of check, never invented:
 *
 * - required: a data guard on the command that makes the move
 *   (src/operations/event.manifest — submitForApproval needs a finished plan;
 *   lockForSales needs client, plan, dates, and headcount).
 * - readiness: the Event computeds and live readiness the app already shows
 *   (isSetupReady before approval, isReadyForExecution before the event
 *   starts, isFinalLockReady before Final). They never stop the move
 *   (docs/architecture/domain-gating-restraint.md).
 *
 * A stage with no known checks gets an empty list, not a made-up one.
 */

/** Where a person fixes a check: a section, a sheet, a page panel, or a page. */
export type StageGateFix =
  | { kind: "tab"; tab: EventDetailTab }
  | { kind: "sheet"; sheet: DashSheetId }
  | { kind: "anchor"; id: string }
  | { kind: "route"; to: string };

export type StageGateCheck = {
  key: string;
  label: string;
  done: boolean;
  required: boolean;
  detail?: string;
  fix?: { label: string; to: StageGateFix };
};

export type StageGate = {
  next: EventStage;
  nextLabel: string;
  /** undefined while live facts load. */
  checks: StageGateCheck[] | undefined;
};

/** Open work from the live readiness view (execution domain). */
export type StageGateExecution = {
  prepTaskIds: readonly string[];
  packListIds: readonly string[];
  deliveryIds: readonly string[];
};

export type StageGateFacts = {
  stage: string;
  plannedAt?: number | null;
  clientId?: string | null;
  hasAssignedClient?: boolean;
  startsAt?: number | null;
  endsAt?: number | null;
  expectedHeadcount?: number | null;
  hasMenuDishes?: boolean;
  hasStaffAssigned?: boolean;
  hasServiceStyle?: boolean;
  hasFinalLockTiming?: boolean;
  /** Only read before Executing; undefined while it loads. */
  execution?: StageGateExecution;
};

/** The anchor of CompleteDraftPlanningPanel, shown while a plan is unfinished. */
export const PLAN_PANEL_ID = "complete-draft-planning";

const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many} open`;

function planFix(facts: StageGateFacts): StageGateCheck["fix"] {
  // The panel only renders in planning while the plan is unfinished.
  return facts.stage === "planning" && facts.plannedAt == null
    ? { label: "Finish plan", to: { kind: "anchor", id: PLAN_PANEL_ID } }
    : undefined;
}

/** Before the plan is finished, basics are set in the planning panel. */
function basicsFix(
  facts: StageGateFacts,
  label: string,
): StageGateCheck["fix"] {
  return planFix(facts) ?? { label, to: { kind: "sheet", sheet: "edit" } };
}

function planCheck(facts: StageGateFacts): StageGateCheck {
  return {
    key: "plan",
    label: "Event plan finished",
    done: facts.plannedAt != null,
    required: true,
    fix: planFix(facts),
  };
}

/** Event.isSetupReady — the "Before approval" list (EventSetupProgress). */
function setupChecks(facts: StageGateFacts): StageGateCheck[] {
  return [
    {
      key: "client",
      label: "Client assigned",
      done: Boolean(facts.hasAssignedClient),
      required: false,
      fix: planFix(facts) ?? {
        label: "Open client",
        to: { kind: "tab", tab: "client" },
      },
    },
    {
      key: "headcount",
      label: "Headcount set",
      done: Boolean(facts.expectedHeadcount && facts.expectedHeadcount > 0),
      required: false,
      fix: basicsFix(facts, "Set headcount"),
    },
    {
      key: "dishes",
      label: "Menu dishes added",
      done: Boolean(facts.hasMenuDishes),
      required: false,
      fix: { label: "Add dishes", to: { kind: "tab", tab: "menu" } },
    },
    {
      key: "staff",
      label: "Staff assigned",
      done: Boolean(facts.hasStaffAssigned),
      required: false,
      fix: { label: "Assign staff", to: { kind: "tab", tab: "staffing" } },
    },
  ];
}

/** Event.lockForSales data guards. */
function salesLockChecks(facts: StageGateFacts): StageGateCheck[] {
  return [
    {
      key: "client",
      label: "Client on the event",
      done: facts.clientId != null,
      required: true,
      fix: planFix(facts) ?? {
        label: "Open client",
        to: { kind: "tab", tab: "client" },
      },
    },
    planCheck(facts),
    {
      key: "dates",
      label: "Start and end times set",
      done: facts.startsAt != null && facts.endsAt != null,
      required: true,
      fix: basicsFix(facts, "Set times"),
    },
    {
      key: "headcount",
      label: "Headcount set",
      done: Boolean(facts.expectedHeadcount && facts.expectedHeadcount > 0),
      required: true,
      fix: basicsFix(facts, "Set headcount"),
    },
  ];
}

/** Event.isReadyForExecution, from the live readiness execution domain. */
function executionChecks(
  execution: StageGateExecution | undefined,
): StageGateCheck[] | undefined {
  if (!execution) return undefined;
  const { prepTaskIds, packListIds, deliveryIds } = execution;
  return [
    {
      key: "prep",
      label: "Prep finished",
      done: prepTaskIds.length === 0,
      required: false,
      detail: prepTaskIds.length
        ? count(prepTaskIds.length, "task")
        : undefined,
      fix: { label: "Open prep", to: { kind: "tab", tab: "prep" } },
    },
    {
      key: "pack",
      label: "Pack lists packed",
      done: packListIds.length === 0,
      required: false,
      detail: packListIds.length
        ? count(packListIds.length, "list")
        : undefined,
      fix: {
        label: packListIds.length === 1 ? "Open pack list" : "Open pack lists",
        to: {
          kind: "route",
          to:
            packListIds.length === 1
              ? `/logistics/packs/${packListIds[0]}`
              : "/logistics/packs",
        },
      },
    },
    {
      key: "deliveries",
      label: "Deliveries arrived",
      done: deliveryIds.length === 0,
      required: false,
      detail: deliveryIds.length
        ? count(deliveryIds.length, "delivery", "deliveries")
        : undefined,
      fix: {
        label: "Open deliveries",
        to: { kind: "route", to: "/logistics/deliveries" },
      },
    },
  ];
}

/** Event.isFinalLockReady — Ops Final Lock readiness. */
function finalLockChecks(facts: StageGateFacts): StageGateCheck[] {
  return [
    {
      key: "style",
      label: "Service style picked",
      done: Boolean(facts.hasServiceStyle),
      required: false,
      fix: { label: "Pick style", to: { kind: "sheet", sheet: "edit" } },
    },
    {
      key: "headcount",
      label: "Headcount set",
      done: Boolean(facts.expectedHeadcount && facts.expectedHeadcount > 0),
      required: false,
      fix: { label: "Set headcount", to: { kind: "sheet", sheet: "edit" } },
    },
    {
      key: "dishes",
      label: "Menu dishes added",
      done: Boolean(facts.hasMenuDishes),
      required: false,
      fix: { label: "Add dishes", to: { kind: "tab", tab: "menu" } },
    },
    {
      key: "timing",
      label: "Staff, load, and travel timing planned",
      done: Boolean(facts.hasFinalLockTiming),
      required: false,
      fix: { label: "Plan timing", to: { kind: "tab", tab: "timeline" } },
    },
  ];
}

function checksFor(facts: StageGateFacts): StageGateCheck[] | undefined {
  switch (facts.stage) {
    case "planning":
      return [planCheck(facts), ...setupChecks(facts)];
    case "pending_approval":
      return setupChecks(facts);
    case "approved":
      return salesLockChecks(facts);
    case "sales_lock":
      return executionChecks(facts.execution);
    case "executing":
      return finalLockChecks(facts);
    default:
      // quote, final, completed: the next move has no data checks.
      return [];
  }
}

/** The gate before the next stage on the track; null at the end or off it. */
export function eventStageGate(facts: StageGateFacts): StageGate | null {
  const index = DASH_TRACK.indexOf(facts.stage as EventStage);
  const next = index < 0 ? undefined : DASH_TRACK[index + 1];
  if (!next) return null;
  return { next, nextLabel: STAGE_LABEL[next], checks: checksFor(facts) };
}
