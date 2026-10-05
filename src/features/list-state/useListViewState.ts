import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ListStateManager, type ListSchema } from "./ListStateManager";

export type { ListField } from "./ListStateManager";

/** Query-backed list controls. Defaults are omitted, unrelated query fields survive. */
export function useListViewState<T extends Record<string, unknown>>(
  manager: ListStateManager<T> | ListSchema<T>,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const stateManager = useMemo(
    () =>
      manager instanceof ListStateManager
        ? manager
        : new ListStateManager(manager),
    [manager],
  );
  const state = useMemo(
    () => stateManager.read(searchParams),
    [stateManager, searchParams],
  );

  const setState = useCallback(
    (patch: Partial<T>) => {
      setSearchParams((current) => stateManager.patch(current, patch), {
        replace: true,
      });
    },
    [setSearchParams, stateManager],
  );

  return [
    state,
    setState,
    stateManager.hasExplicitState(searchParams),
  ] as const;
}
