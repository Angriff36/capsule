import { useConvex } from "convex/react";
import { saveEventFromBeo } from "../features/assistant/eventImportWorkflow";
import type { Id } from "./api";
import type { EventImportDraft } from "./eventImportDraft";

/** Reuses the assistant import workflow and its governed native commands. */
export function useEventImportRetry(eventId: Id<"events">) {
  const convex = useConvex();
  return (draft: EventImportDraft) =>
    saveEventFromBeo(convex, draft.facts, {
      sources: draft.sources,
      sourceText: draft.sourceText ?? "",
      existingEventId: eventId,
    });
}
