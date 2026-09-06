export function reconcileRecoveredMenuRequest(
  requestedDishIds: readonly string[],
  appliedDishIds: readonly string[],
) {
  const applied = new Set(appliedDishIds);
  return {
    appliedDishIds: requestedDishIds.filter((id) => applied.has(id)),
    outstandingDishIds: requestedDishIds.filter((id) => !applied.has(id)),
  };
}
