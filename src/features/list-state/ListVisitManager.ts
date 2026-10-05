import { useMemo } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

type RestoreState = { restoreScrollFromEntryKey?: unknown };
const seen = new Set<string>();

/** Classifies history entries once so omitted defaults never masquerade as fresh visits. */
export class ListVisitManager {
  classify(
    key: string,
    navigationType: ReturnType<typeof useNavigationType>,
    state: unknown,
  ) {
    const explicitReturn =
      typeof (state as RestoreState | null)?.restoreScrollFromEntryKey ===
      "string";
    const restored =
      navigationType === "POP" || explicitReturn || seen.has(key);
    seen.add(key);
    return { restored, allowInitialDefaults: !restored };
  }
}

export function useListVisit(manager: ListVisitManager) {
  const location = useLocation();
  const navigationType = useNavigationType();
  return useMemo(
    () => manager.classify(location.key, navigationType, location.state),
    [location.key, location.state, manager, navigationType],
  );
}
