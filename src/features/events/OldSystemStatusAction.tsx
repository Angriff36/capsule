import { useState } from "react";
import type { Id } from "../../lib/api";
import {
  useEventCancel,
  useEventRecordPastCompletion,
} from "../../lib/manifest-convex-react";
import {
  oldSystemCancelReason,
  oldSystemFinishedStage,
} from "../../../convex/lib/oldSystemEventStage";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

/**
 * An event read in before imports copied the old status sits in Planning.
 * When the old system says it is over (Complete / Final / Closed Out),
 * Cancelled or a lost quote,
 * one tap gives it that status here, with no approval work drafted.
 */
export function OldSystemStatusAction({
  eventId,
  stage,
  endsAt,
  oldStatus,
}: {
  readonly eventId: Id<"events">;
  readonly stage: string;
  readonly endsAt: number | null | undefined;
  readonly oldStatus: string;
}) {
  const recordPastCompletion = useEventRecordPastCompletion();
  const cancel = useEventCancel();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const finished = oldSystemFinishedStage(oldStatus, endsAt, Date.now());
  if (stage !== "planning" || !finished) return null;

  const apply = async () => {
    setBusy(true);
    setFailure(null);
    try {
      if (finished === "completed") {
        await recordPastCompletion({ docId: eventId });
      } else {
        await cancel({
          docId: eventId,
          reason: oldSystemCancelReason(oldStatus),
        });
      }
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="old-system-status-action" className="mt-3 space-y-2">
      <p className="text-ink-2">
        {finished === "completed"
          ? `The old system says this event is ${oldStatus} and it is over. Mark it finished here: no approval, invoice, staff or pack list work is made for it.`
          : `The old system says this event was ${oldStatus}. Mark it cancelled here too.`}
      </p>
      {failure ? (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      ) : null}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void apply()}
      >
        {finished === "completed" ? "Mark finished" : "Mark cancelled"}
      </button>
    </div>
  );
}
