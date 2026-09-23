/**
 * AC-612: records what the `final` stage means so a later worker does not
 * bolt a completeness gate onto it. `final` is post-service (§4.2): the
 * service is finished while return, cleanup, and reconciliation stay open.
 * "Ops Final" is NOT that stage — it is a readiness projection over the
 * packet domain, so finalize succeeds with no packet and readiness keeps
 * reporting the open gaps. Kept pure (no convex/react).
 */
import { EVENT_STAGES } from "./eventStatus";

export class EventFinalMeaning {
  /** The stage this record is about. */
  stage(): "final" {
    return "final";
  }

  /** §4.2: final means service finished — nothing more. */
  meaning(): "service_finished" {
    return "service_finished";
  }

  /** finalizeEvent only needs executing + eventManageAccess, never a packet. */
  requiresOpsFinalReview(): boolean {
    return false;
  }

  /** Ops Final lives in the readiness projection, not the lifecycle. */
  opsFinalKind(): "readiness" {
    return "readiness";
  }

  opsFinalReadinessDomain(): "packet" {
    return "packet";
  }

  /** Must be false: the machine has no ops_final stage. */
  hasOpsFinalStage(): boolean {
    return (
      (EVENT_STAGES as readonly string[]).includes("ops_final") ||
      (EVENT_STAGES as readonly string[]).includes("opsFinal")
    );
  }
}

export const eventFinalMeaning = new EventFinalMeaning();
