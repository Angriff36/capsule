/**
 * Resolves which staff profile the My Day page belongs to.
 *
 * Resolution order:
 * 1. The Person whose `authSubjectId` matches the signed-in account. The match
 *    requires a real subject id on BOTH sides — an unlinked Person has
 *    `authSubjectId` undefined, and a loose `=== user?.id` comparison would
 *    match it against a not-yet-loaded user (undefined === undefined),
 *    silently rendering someone else's day (production: Angriff saw
 *    "bill colacurcio").
 * 2. A profile this account explicitly picked earlier on this device — only
 *    after the signed-in subject is known, and never a Person already linked
 *    to a different account.
 *
 * While the Clerk user id is missing/loading, resolution returns no person
 * (picker / empty own day). A leftover pick must not fill that gap.
 *
 * The remembered pick is stored PER signed-in account. The original
 * device-global key let a pick made under one sign-in leak into every other
 * account's My Day on the same browser. The legacy key is ignored and
 * cleared on read so stale picks cannot resurface.
 */

export interface MyDayPersonCandidate {
  _id: string;
  authSubjectId?: string | null;
}

export interface MyDayIdentityResolution<T extends MyDayPersonCandidate> {
  person: T | undefined;
  /** True when the shown person is bound to the signed-in account. */
  linkedToSignIn: boolean;
}

const LEGACY_DEVICE_KEY = "capsule.my-day.personId";

/** Minimal storage surface so tests can inject an in-memory double. */
export type PersonPickStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

const browserStorage = (): PersonPickStorage | null =>
  typeof localStorage === "undefined" ? null : localStorage;

export const isUsableAuthSubjectId = (
  value: string | null | undefined,
): value is string => typeof value === "string" && value.length > 0;

export class MyDayIdentityResolver {
  constructor(
    private readonly storageProvider: () => PersonPickStorage | null = browserStorage,
  ) {}

  private get storage(): PersonPickStorage | null {
    return this.storageProvider();
  }

  private storageKeyFor(userId: string): string {
    return `${LEGACY_DEVICE_KEY}.${userId}`;
  }

  /** Read this account's remembered pick; drops the legacy device-global key. */
  readStoredPersonId(userId: string | undefined): string | null {
    const storage = this.storage;
    if (!storage) return null;
    storage.removeItem(LEGACY_DEVICE_KEY);
    if (!isUsableAuthSubjectId(userId)) return null;
    return storage.getItem(this.storageKeyFor(userId));
  }

  storePersonId(userId: string | undefined, personId: string): void {
    if (!isUsableAuthSubjectId(userId)) return;
    this.storage?.setItem(this.storageKeyFor(userId), personId);
  }

  clearStoredPersonId(userId: string | undefined): void {
    if (!isUsableAuthSubjectId(userId)) return;
    this.storage?.removeItem(this.storageKeyFor(userId));
  }

  resolve<T extends MyDayPersonCandidate>(
    people: readonly T[],
    userId: string | undefined,
    storedPersonId: string | null,
  ): MyDayIdentityResolution<T> {
    // Missing/loading subject: never bind — leftover picks and empty
    // authSubjectId must not fill the gap (undefined === undefined).
    if (!isUsableAuthSubjectId(userId)) {
      return { person: undefined, linkedToSignIn: false };
    }

    const linked = people.find(
      (person) =>
        isUsableAuthSubjectId(person.authSubjectId) &&
        person.authSubjectId === userId,
    );
    if (linked) return { person: linked, linkedToSignIn: true };

    const picked = storedPersonId
      ? people.find((person) => person._id === storedPersonId)
      : undefined;
    if (!picked) return { person: undefined, linkedToSignIn: false };

    // A Person already linked to someone else is never a silent fallback.
    if (
      isUsableAuthSubjectId(picked.authSubjectId) &&
      picked.authSubjectId !== userId
    ) {
      return { person: undefined, linkedToSignIn: false };
    }

    return { person: picked, linkedToSignIn: false };
  }
}

export const myDayIdentityResolver = new MyDayIdentityResolver();
