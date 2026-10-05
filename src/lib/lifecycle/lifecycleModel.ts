export type LifecycleAction = {
  key: string;
  label: string;
  to: string;
  needsInput?: boolean;
  /** Set when the move is legal from here but a record check blocks it. */
  disabledReason?: string;
};

export type LifecycleDefinition = {
  label: string;
  path: readonly string[];
  sideStates: readonly string[];
  actions: readonly LifecycleAction[];
};

export type LifecycleNode = {
  state: string;
  kind: "completed" | "current" | "next" | "future" | "unknown";
  actions: readonly LifecycleAction[];
};

export function buildLifecycleModel(
  definition: LifecycleDefinition,
  currentStatus: string,
) {
  const currentIndex = definition.path.indexOf(currentStatus);
  const isSideState = definition.sideStates.includes(currentStatus);
  const isUnknown = currentIndex < 0 && !isSideState;
  const nextActions = definition.actions.filter((action) => {
    const targetIndex = definition.path.indexOf(action.to);
    return currentIndex >= 0 && targetIndex > currentIndex;
  });
  // Moves that do not go forward on the main path (cancel, void, return to
  // planning) stay reachable as buttons beside the path.
  const otherActions = definition.actions.filter(
    (action) => !nextActions.includes(action),
  );

  return {
    label: definition.label,
    currentStatus,
    isSideState,
    isUnknown,
    otherActions,
    nodes: definition.path.map((state, index): LifecycleNode => ({
      state,
      kind: isUnknown
        ? index === 0
          ? "unknown"
          : "future"
        : index < currentIndex
          ? "completed"
          : index === currentIndex
            ? "current"
            : nextActions.some((action) => action.to === state)
              ? "next"
              : "future",
      actions: nextActions.filter((action) => action.to === state),
    })),
  };
}
