// An imported event takes its old-system finished status (see
// oldSystemEventStage.ts) right after it is made. The command key is
// run-scoped, so a resumed run replays the saved result instead of moving
// the event twice.
import type { ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  oldSystemCancelReason,
  oldSystemFinishedStage,
} from "./oldSystemEventStage";

export function importedEventStageKey(
  importRunId: string,
  externalId: string,
): string {
  return `tenant-shared/import:${importRunId}:event:${externalId}:stage`;
}

/** Returns a plain line when the old status could not be copied; never throws. */
export async function applyImportedEventStage(
  ctx: ActionCtx,
  args: {
    importRunId: string;
    externalId: string;
    eventId: string;
    rawStatus: string | null | undefined;
    endsAt: number;
  },
): Promise<string | null> {
  const stage = oldSystemFinishedStage(args.rawStatus, args.endsAt, Date.now());
  if (!stage) return null;
  const docId = args.eventId as Id<"events">;
  const idempotencyKey = importedEventStageKey(
    args.importRunId,
    args.externalId,
  );
  try {
    if (stage === "cancelled") {
      await ctx.runMutation(api.mutations.Event_cancel, {
        docId,
        reason: oldSystemCancelReason(args.rawStatus),
        idempotencyKey,
      });
    } else {
      await ctx.runMutation(api.mutations.Event_recordPastCompletion, {
        docId,
        idempotencyKey,
      });
    }
    return null;
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : "unknown error";
    return `Old status "${args.rawStatus}" was not copied (${why}); the event is in Planning.`;
  }
}
