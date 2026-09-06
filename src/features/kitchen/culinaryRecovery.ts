export function menuCloneOutcome(result: {
  menuId: string;
  menuName: string;
  lineCount: number;
  recovered: boolean;
}) {
  return result.recovered
    ? {
        navigateToId: null,
        recoveredId: result.menuId,
        notice: `Recovered the previously saved menu “${result.menuName}” with ${result.lineCount} ${result.lineCount === 1 ? "dish" : "dishes"}. No new menu was created; choose the action again to create another.`,
      }
    : { navigateToId: result.menuId, recoveredId: null, notice: null };
}

export function componentImportOutcome(result: {
  componentId: string;
  lineIds: string[];
  recovered: boolean;
}) {
  const count = result.lineIds.length;
  return result.recovered
    ? {
        navigateToId: null,
        recoveredId: result.componentId,
        notice: `Recovered a previously saved component import with ${count} ingredient ${count === 1 ? "line" : "lines"}. The current review is still here; open the saved component or choose Save component again to import this review.`,
      }
    : { navigateToId: result.componentId, recoveredId: null, notice: null };
}

export function componentRestoreOutcome(result: {
  componentId: string;
  snapshotId: string;
  lineCount: number;
  recovered: boolean;
}) {
  return result.recovered
    ? {
        completed: false,
        notice: `Recovered the previous restore from snapshot ${result.snapshotId} with ${result.lineCount} ingredient ${result.lineCount === 1 ? "line" : "lines"}. The newly selected snapshot was not applied; choose Restore again to apply it.`,
      }
    : { completed: true, notice: null };
}
