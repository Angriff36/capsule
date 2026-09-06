export function pendingOperationKey(scope: string): string {
  const storageKey = `capsule:pending-operation:${scope}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const created = `${scope}:${crypto.randomUUID()}`;
  window.localStorage.setItem(storageKey, created);
  return created;
}

export function confirmPendingOperation(scope: string): void {
  window.localStorage.removeItem(`capsule:pending-operation:${scope}`);
}
