/**
 * AC-153 offline leg: a device's saved access opens only the same account,
 * and is dropped once the server says that account was switched off, so it
 * cannot reopen the app offline with the old role.
 */
import { describe, expect, it } from "vitest";
import {
  OfflineAuthRestorePolicy,
  OfflineAuthSnapshotStore,
  type StoredAuthStatus,
} from "../src/lib/offlineAuthSnapshot";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function saved(accountId: string): StoredAuthStatus {
  return {
    accountId,
    capturedAt: Date.now(),
    authenticated: true,
    hasRole: true,
    hasTenant: true,
    role: "owner",
    personId: `person-${accountId}`,
    tenantId: "tenant-offline",
    profile: null,
  };
}

describe("offline saved access", () => {
  it("restores only the same account and is gone after the account is switched off", () => {
    const store = new OfflineAuthSnapshotStore(memoryStorage());
    const policy = new OfflineAuthRestorePolicy();
    store.write(saved("account-a"));
    store.write(saved("account-b"));

    const offline = (clerkUserId: string) =>
      policy.canRestore({
        clerkUserId,
        liveAccountId: undefined,
        snapshot: store.read(clerkUserId),
        online: false,
      });
    expect(offline("account-a")).toBe(true);
    expect(
      policy.canRestore({
        clerkUserId: "account-c",
        liveAccountId: undefined,
        snapshot: store.read("account-a"),
        online: false,
      }),
    ).toBe(false);

    store.forget("account-a");
    expect(store.read("account-a")).toBeNull();
    expect(offline("account-a")).toBe(false);
    expect(offline("account-b")).toBe(true);
  });
});
