/**
 * Automatic event stage moves (site comment #421): an event moves on by
 * itself when what its next stage asks for is true, unless the company keeps
 * that stage as a hand-only step. Pure; the server step
 * (convex/eventAutoStage.ts) runs the move through the event's own command,
 * and the setup page shows the same list.
 *
 * Each condition is one the app already shows on the stage rail
 * (eventStageGate.ts) or the event's own planned times:
 * - Pending approval: the plan is finished and the setup list is done
 *   (client, headcount, dishes, staff = Event.isSetupReady).
 * - Approved: the setup list is still done.
 * - Sales lock: everything Event.lockForSales checks.
 * - Executing: the crew's start time (staff on, from the timing plan), or
 *   the event start when there is no timing plan.
 * - Final: the event's end time.
 * - Completed: the crew is back (staff off), or the event end when there is
 *   no timing plan.
 */

export type AutoStage =
  | "pending_approval"
  | "approved"
  | "sales_lock"
  | "executing"
  | "final"
  | "completed";

export type AutoStageCommand =
  | "submitForApproval"
  | "approve"
  | "lockForSales"
  | "beginExecution"
  | "finalizeEvent"
  | "complete";

export const AUTO_STAGE_MOVES: ReadonlyArray<{
  from: string;
  to: AutoStage;
  command: AutoStageCommand;
  label: string;
  when: string;
}> = [
  {
    from: "planning",
    to: "pending_approval",
    command: "submitForApproval",
    label: "Pending approval",
    when: "The plan is finished and the event has a client, a headcount, menu dishes and staff.",
  },
  {
    from: "pending_approval",
    to: "approved",
    command: "approve",
    label: "Approved",
    when: "The event still has a client, a headcount, menu dishes and staff.",
  },
  {
    from: "approved",
    to: "sales_lock",
    command: "lockForSales",
    label: "Sales lock",
    when: "The event has a name, client, finished plan, start and end times, headcount, venue and service style.",
  },
  {
    from: "sales_lock",
    to: "executing",
    command: "beginExecution",
    label: "Executing",
    when: "The crew's start time comes (or the event start, when the event has no timing plan).",
  },
  {
    from: "executing",
    to: "final",
    command: "finalizeEvent",
    label: "Final",
    when: "The event's end time passes.",
  },
  {
    from: "final",
    to: "completed",
    command: "complete",
    label: "Completed",
    when: "The crew is back at the kitchen (or the event end, when the event has no timing plan).",
  },
];

/** Ryan's example of a step a person takes: the sales lock. */
export const DEFAULT_BY_HAND: readonly AutoStage[] = ["sales_lock"];

const AUTO_STAGES = new Set<string>(AUTO_STAGE_MOVES.map((move) => move.to));

/** The stages a person moves an event into; unset = the default. */
export function parseByHand(json: string | null | undefined): Set<AutoStage> {
  if (json == null || json.trim() === "") return new Set(DEFAULT_BY_HAND);
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return new Set(DEFAULT_BY_HAND);
    return new Set(
      value.filter(
        (stage): stage is AutoStage =>
          typeof stage === "string" && AUTO_STAGES.has(stage),
      ),
    );
  } catch {
    return new Set(DEFAULT_BY_HAND);
  }
}

export function byHandJson(stages: Iterable<AutoStage>): string {
  const chosen = new Set(stages);
  return JSON.stringify(
    AUTO_STAGE_MOVES.map((move) => move.to).filter((stage) =>
      chosen.has(stage),
    ),
  );
}

export type AutoStageFacts = {
  stage: string;
  deletedAt?: number | null;
  archivedAt?: number | null;
  title?: string | null;
  clientId?: string | null;
  hasAssignedClient: boolean;
  plannedAt?: number | null;
  startsAt?: number | null;
  endsAt?: number | null;
  expectedHeadcount?: number | null;
  hasMenuDishes: boolean;
  hasStaffAssigned: boolean;
  venueId?: string | null;
  venueName?: string | null;
  serviceStyleId?: string | null;
  serviceStyleName?: string | null;
  /** Event.timingStaffOnAt / timingStaffOffAt, when the timing plan has them. */
  staffOnAt?: number | null;
  staffOffAt?: number | null;
};

export type AutoStageStep =
  | { kind: "move"; to: AutoStage; command: AutoStageCommand }
  /** Nothing to do now; look again at this time. */
  | { kind: "wait"; until: number }
  | { kind: "none" };

const filled = (text: string | null | undefined) =>
  text != null && text.trim().length > 0;

function setupReady(facts: AutoStageFacts): boolean {
  return (
    facts.hasAssignedClient &&
    (facts.expectedHeadcount ?? 0) > 0 &&
    facts.hasMenuDishes &&
    facts.hasStaffAssigned
  );
}

function salesLockReady(facts: AutoStageFacts): boolean {
  return (
    filled(facts.title) &&
    facts.clientId != null &&
    facts.plannedAt != null &&
    facts.startsAt != null &&
    facts.endsAt != null &&
    (facts.expectedHeadcount ?? 0) > 0 &&
    (facts.venueId != null || filled(facts.venueName)) &&
    (facts.serviceStyleId != null || filled(facts.serviceStyleName))
  );
}

/** When the move into `to` may happen; null = never on its own. */
function readyAt(facts: AutoStageFacts, to: AutoStage): number | null {
  switch (to) {
    case "pending_approval":
      return facts.plannedAt != null && setupReady(facts) ? 0 : null;
    case "approved":
      return setupReady(facts) ? 0 : null;
    case "sales_lock":
      return salesLockReady(facts) ? 0 : null;
    case "executing":
      return facts.staffOnAt ?? facts.startsAt ?? null;
    case "final":
      return facts.endsAt ?? null;
    case "completed":
      return facts.staffOffAt ?? facts.endsAt ?? null;
  }
}

/** The one next step for an event right now. */
export function nextAutoStageStep(
  facts: AutoStageFacts,
  byHand: ReadonlySet<AutoStage>,
  now: number,
): AutoStageStep {
  if (facts.deletedAt != null || facts.archivedAt != null)
    return { kind: "none" };
  const move = AUTO_STAGE_MOVES.find((entry) => entry.from === facts.stage);
  if (!move || byHand.has(move.to)) return { kind: "none" };
  const at = readyAt(facts, move.to);
  if (at == null) return { kind: "none" };
  if (at > now) return { kind: "wait", until: at };
  return { kind: "move", to: move.to, command: move.command };
}

/** Event.timingStaffOnAt, from the stored timing plan. */
export function staffOnAt(event: {
  serviceStartsAt?: number | null;
  timingSetupMinutes?: number | null;
  timingOutboundTravelMinutes?: number | null;
  timingSafetyBufferMinutes?: number | null;
  timingLoadMinutes?: number | null;
  timingBriefingMinutes?: number | null;
}): number | null {
  const {
    serviceStartsAt,
    timingSetupMinutes,
    timingOutboundTravelMinutes,
    timingLoadMinutes,
  } = event;
  if (
    serviceStartsAt == null ||
    timingSetupMinutes == null ||
    timingOutboundTravelMinutes == null ||
    timingLoadMinutes == null
  )
    return null;
  const minutes =
    timingSetupMinutes +
    timingOutboundTravelMinutes +
    (event.timingSafetyBufferMinutes ?? 0) +
    timingLoadMinutes +
    (event.timingBriefingMinutes ?? 0);
  return serviceStartsAt - minutes * 60_000;
}

/** Event.timingStaffOffAt, from the stored timing plan. */
export function staffOffAt(event: {
  endsAt?: number | null;
  timingCleanupMinutes?: number | null;
  timingReturnTravelMinutes?: number | null;
  timingUnloadMinutes?: number | null;
}): number | null {
  const {
    endsAt,
    timingCleanupMinutes,
    timingReturnTravelMinutes,
    timingUnloadMinutes,
  } = event;
  if (
    endsAt == null ||
    timingCleanupMinutes == null ||
    timingReturnTravelMinutes == null ||
    timingUnloadMinutes == null
  )
    return null;
  return (
    endsAt +
    (timingCleanupMinutes + timingReturnTravelMinutes + timingUnloadMinutes) *
      60_000
  );
}
