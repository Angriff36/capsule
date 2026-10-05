import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "../api";
import type { FinalLockReport } from "./finalLock/evaluate";

export interface FinalLockOverrideInput {
  questionKey: string;
  /** The answer the manager looked at; a changed answer refuses the decision. */
  basedOn: string;
  answer: string;
  reason: string;
  /** Who pays only: the price, kept apart from the payer. */
  price?: number;
}

/** The event's Final Lock answers and a manager's decision on one of them. */
export function useFinalLock(eventId: Id<"events">) {
  const finalLock = api.lib.eventPacket.finalLock;
  const report = useQuery(finalLock.getFinalLock, { eventId }) as
    FinalLockReport | undefined;
  const override = useMutation(finalLock.overrideFinalLockAnswer);
  return {
    report,
    override: (input: FinalLockOverrideInput) =>
      override({ eventId, ...input }),
  };
}
