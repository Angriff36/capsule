import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useWorkingEventScope,
  type WorkingEventScope,
} from "../events/WorkingEventScope";

type PurchasingScopeViewModel = {
  eventScope: WorkingEventScope;
  linkedEventId: string | null;
  scopedEventId: string | null;
  showAllEvents: () => void;
};

/** Keeps a cascade link and the page-local working-event filter in agreement. */
export function usePurchasingScopeViewModel(): PurchasingScopeViewModel {
  const [searchParams, setSearchParams] = useSearchParams();
  const eventScope = useWorkingEventScope("purchasing");
  const linkedEventId = searchParams.get("event")?.trim() || null;
  const scopedEventId = linkedEventId ?? eventScope.scopeId;

  const showAllEvents = useCallback(() => {
    eventScope.setShowAll(true);
    const next = new URLSearchParams(searchParams);
    next.delete("event");
    setSearchParams(next, { replace: true });
  }, [eventScope, searchParams, setSearchParams]);

  return { eventScope, linkedEventId, scopedEventId, showAllEvents };
}
