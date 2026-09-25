/**
 * Maps the nine named booking-handoff outcomes (PR06-06 / AC-099) onto the
 * EXISTING ten-stage Event machine. AC-223: sales lock is a real, distinct
 * stage and there is NO confirmed stage — "confirmed" is rejected, not
 * aliased onto executing. Archive/reopen are visibility flags on the same
 * row, never a stage move. Kept pure (no convex/react).
 */
import { EVENT_STAGES, type EventStage } from "./eventStatus";

export type LifecycleOutcomeName =
  | "quote"
  | "sales_lock"
  | "confirmed"
  | "execution"
  | "final"
  | "completion"
  | "cancellation"
  | "archive"
  | "reopen";

export type LifecycleOutcomeMapping =
  | { kind: "stage"; canonical: EventStage; reason: string }
  | { kind: "flag"; field: "archivedAt"; reason: string }
  | { kind: "rejected"; reason: string };

const STAGE_OUTCOMES: Record<
  Exclude<LifecycleOutcomeName, "confirmed" | "archive" | "reopen">,
  EventStage
> = {
  quote: "quote",
  sales_lock: "sales_lock",
  execution: "executing",
  final: "final",
  completion: "completed",
  cancellation: "cancelled",
};

const FLAG_REASON =
  "Archive is a visibility flag on archivedAt, not a stage; the stage stays put.";

export class EventLifecycleOutcomeMap {
  map(outcome: LifecycleOutcomeName): LifecycleOutcomeMapping {
    switch (outcome) {
      case "confirmed":
        return {
          kind: "rejected",
          reason:
            "No EventStage named confirmed exists and it is not an alias for executing; the sales lock is the commercial confirmation.",
        };
      case "archive":
        return { kind: "flag", field: "archivedAt", reason: FLAG_REASON };
      case "reopen":
        return {
          kind: "flag",
          field: "archivedAt",
          reason:
            "Reopen clears archivedAt via Event.reactivate; it never moves the stage.",
        };
      default:
        return {
          kind: "stage",
          canonical: STAGE_OUTCOMES[outcome],
          reason: `Named outcome "${outcome}" is the existing ${STAGE_OUTCOMES[outcome]} stage.`,
        };
    }
  }

  /** AC-223: the machine has no confirmed stage distinct from executing. */
  hasConfirmedStage(): boolean {
    return (EVENT_STAGES as readonly string[]).includes("confirmed");
  }
}

export const eventLifecycleOutcomeMap = new EventLifecycleOutcomeMap();
