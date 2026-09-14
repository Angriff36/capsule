/** Last live workspace membership, keyed by Clerk account id. */

const STORAGE_KEY = "capsule.offline-auth.v1";
export const OFFLINE_AUTH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredAuthProfile {
  _id: string;
  tenantId: string;
  authSubjectId?: string | null;
  givenName: string;
  familyName: string;
  status: string;
  deletedAt: number | null;
}

export interface StoredAuthStatus {
  accountId: string;
  capturedAt: number;
  authenticated: boolean;
  hasRole: boolean;
  hasTenant: boolean;
  role: string;
  roleSource?: string;
  personId: string;
  tenantId: string;
  profile: StoredAuthProfile | null;
  disabledCapabilities?: string[];
}

interface SnapshotFile {
  version: 1;
  byAccount: Record<string, StoredAuthStatus>;
}

export function isUsableOfflineSnapshot(
  row: StoredAuthStatus | null,
  accountId: string,
  now = Date.now(),
): row is StoredAuthStatus {
  return (
    row !== null &&
    row.accountId === accountId &&
    row.hasRole &&
    row.hasTenant &&
    row.personId.length > 0 &&
    now - row.capturedAt <= OFFLINE_AUTH_MAX_AGE_MS
  );
}

export class OfflineAuthSnapshotStore {
  constructor(
    private readonly storage: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem"
    > | null = typeof localStorage === "undefined" ? null : localStorage,
  ) {}

  read(accountId: string): StoredAuthStatus | null {
    const file = this.load();
    return file.byAccount[accountId] ?? null;
  }

  write(status: StoredAuthStatus): void {
    const file = this.load();
    file.byAccount[status.accountId] = status;
    this.save(file);
  }

  hasAny(now = Date.now()): boolean {
    const file = this.load();
    return Object.values(file.byAccount).some((row) =>
      isUsableOfflineSnapshot(row, row.accountId, now),
    );
  }

  clearAll(): void {
    this.storage?.removeItem(STORAGE_KEY);
  }

  private load(): SnapshotFile {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return { version: 1, byAccount: {} };
      const parsed: unknown = JSON.parse(raw);
      if (!isSnapshotFile(parsed)) return { version: 1, byAccount: {} };
      return parsed;
    } catch {
      return { version: 1, byAccount: {} };
    }
  }

  private save(file: SnapshotFile): void {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(file));
  }
}

export const offlineAuthSnapshotStore = new OfflineAuthSnapshotStore();

export class OfflineAuthRestorePolicy {
  canRestore(input: {
    clerkUserId: string | undefined;
    liveAccountId: string | null | undefined;
    snapshot: StoredAuthStatus | null;
    online: boolean;
  }): boolean {
    if (input.online || !input.clerkUserId) return false;
    if (input.liveAccountId === input.clerkUserId) return false;
    return isUsableOfflineSnapshot(input.snapshot, input.clerkUserId);
  }
}

export const offlineAuthRestorePolicy = new OfflineAuthRestorePolicy();

function isSnapshotFile(value: unknown): value is SnapshotFile {
  if (typeof value !== "object" || value === null) return false;
  const row = value as { version?: unknown; byAccount?: unknown };
  return row.version === 1 && typeof row.byAccount === "object";
}
