/**
 * Resolves which staff profile the My Day page belongs to.
 *
 * Resolution order:
 * 1. The Person whose `authSubjectId` matches the signed-in account. The match
 *    requires a real subject id on BOTH sides — an unlinked Person has
 *    `authSubjectId` undefined, and a loose `=== user?.id` comparison would
 *    match it against a not-yet-loaded user (undefined === undefined),
 *    silently rendering someone else's day.
 * 2. A profile this account explicitly picked earlier on this device.
 *
 * The remembered pick is stored PER signed-in account. The original
 * device-global key let a pick made under one sign-in leak into every other
 * account's My Day on the same browser (production bug: signed in as Angriff,
 * the page showed teammate "bill colacurcio"). The legacy key is ignored and
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
    if (!userId) return null;
    return storage.getItem(this.storageKeyFor(userId));
  }

  storePersonId(userId: string | undefined, personId: string): void {
    if (!userId) return;
    this.storage?.setItem(this.storageKeyFor(userId), personId);
  }

  clearStoredPersonId(userId: string | undefined): void {
    if (!userId) return;
    this.storage?.removeItem(this.storageKeyFor(userId));
  }

  resolve<T extends MyDayPersonCandidate>(
    people: readonly T[],
    userId: string | undefined,
    storedPersonId: string | null,
  ): MyDayIdentityResolution<T> {
    const linked = userId
      ? people.find(
          (person) =>
            typeof person.authSubjectId === "string" &&
            person.authSubjectId.length > 0 &&
            person.authSubjectId === userId,
        )
      : undefined;
    if (linked) return { person: linked, linkedToSignIn: true };
    const picked = storedPersonId
      ? people.find((person) => person._id === storedPersonId)
      : undefined;
    return { person: picked, linkedToSignIn: false };
  }
}

export const myDayIdentityResolver = new MyDayIdentityResolver();
