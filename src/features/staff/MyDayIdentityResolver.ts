/**
 * Resolves which staff profile the My Day page belongs to.
 *
 * Resolution order:
 * 1. While the Clerk user id is missing/loading, return no person. A leftover
 *    pick must not fill that gap, and an unlinked Person (`authSubjectId`
 *    undefined) must never match `undefined === undefined`.
 * 2. If more than one active Person is linked to this subject, stay unbound
 *    (picker). First-match would lock Angriff to whoever was listed first
 *    (production: bill).
 * 3. The unique Person whose `authSubjectId` matches the signed-in account,
 *    only when that row is actually this human. If the unique link is a
 *    teammate (name/email does not match Clerk) AND an unlinked Person
 *    matches the signed-in human — or a remembered pick that is not the
 *    mismatched link exists — do not bind the teammate. Prefer an explicit
 *    pick of the matching Person; otherwise stay unbound (picker). Never
 *    lock a differently-named unique link when Angriff is a candidate.
 * 4. A profile this account explicitly picked earlier — only after the
 *    signed-in subject is known, never a Person already linked to a
 *    different account, and never a leftover pick whose name/email does
 *    not match Clerk when the signed-in human is known (leftover bill
 *    must not bind for Angriff).
 *
 * The remembered pick is stored PER signed-in account. The original
 * device-global key (`capsule.my-day.personId`) is copied onto
 * `capsule.my-day.personId.${userId}` for a known subject, then cleared.
 * First paint with a missing userId must leave the legacy key intact so
 * the pick that showed Angriff is still there when Clerk becomes ready.
 *
 * Chip / PageHeader identity is NOT this resolver's person: it always
 * comes from Clerk (`fullName` / email) via `clerkSignedInLabel`, plus
 * the uniquely-linked Person name when `linkedToSignIn` is true. Never
 * from localStorage. Never from an unlinked leftover Person.
 */

export interface MyDayPersonCandidate {
  _id: string;
  authSubjectId?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  email?: string | null;
}

export interface MyDayClerkName {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
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

const normalizeName = (value: string | null | undefined): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const nameTokens = (...values: Array<string | null | undefined>): string[] => {
  const tokens = new Set<string>();
  for (const value of values) {
    const normalized = normalizeName(value);
    if (normalized) tokens.add(normalized);
    for (const part of normalized.split(/\s+/)) {
      if (part) tokens.add(part);
    }
  }
  return [...tokens];
};

const personNameTokens = (person: MyDayPersonCandidate): string[] =>
  nameTokens(
    person.givenName,
    person.familyName,
    [person.givenName, person.familyName].filter(Boolean).join(" "),
  );

const clerkNameTokens = (clerk?: MyDayClerkName | null): string[] => {
  if (!clerk) return [];
  return nameTokens(
    clerk.firstName,
    clerk.lastName,
    clerk.fullName,
    [clerk.firstName, clerk.lastName].filter(Boolean).join(" "),
  );
};

const emailsMatch = (
  left: string | null | undefined,
  right: string | null | undefined,
): boolean => {
  const a = normalizeName(left);
  const b = normalizeName(right);
  return a.length > 0 && a === b;
};

const clerkHasIdentity = (clerk?: MyDayClerkName | null): boolean =>
  clerkNameTokens(clerk).length > 0 || normalizeName(clerk?.email).length > 0;

/**
 * Clerk chip / header label: fullName, then first+last, then email.
 * Never a Person name and never a localStorage pick.
 */
export const clerkSignedInLabel = (clerk?: MyDayClerkName | null): string => {
  const full = typeof clerk?.fullName === "string" ? clerk.fullName.trim() : "";
  if (full) return full;
  const parts = [clerk?.firstName, clerk?.lastName]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
  if (parts) return parts;
  return typeof clerk?.email === "string" ? clerk.email.trim() : "";
};

/** True when there is no Clerk identity to compare, or name/email overlaps. */
export const personMatchesClerkName = (
  person: MyDayPersonCandidate,
  clerk?: MyDayClerkName | null,
): boolean => {
  if (emailsMatch(person.email, clerk?.email)) return true;
  const clerkTokens = clerkNameTokens(clerk);
  if (clerkTokens.length === 0 && normalizeName(clerk?.email).length === 0) {
    return true;
  }
  const personTokens = personNameTokens(person);
  if (personTokens.length === 0) return false;
  return clerkTokens.some((token) => personTokens.includes(token));
};

const linkedToOtherSubject = (
  person: MyDayPersonCandidate,
  userId: string,
): boolean =>
  isUsableAuthSubjectId(person.authSubjectId) &&
  person.authSubjectId !== userId;

const unbound = <
  T extends MyDayPersonCandidate,
>(): MyDayIdentityResolution<T> => ({
  person: undefined,
  linkedToSignIn: false,
});

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

  /**
   * Read this account's remembered pick. The legacy device-global key is
   * copied onto the per-account key only when the signed-in subject is
   * known; a first paint with a missing userId leaves it intact.
   */
  readStoredPersonId(userId: string | undefined): string | null {
    const storage = this.storage;
    if (!storage) return null;
    if (!isUsableAuthSubjectId(userId)) return null;

    const accountKey = this.storageKeyFor(userId);
    const existing = storage.getItem(accountKey);
    const legacy = storage.getItem(LEGACY_DEVICE_KEY);
    if (!existing && legacy) {
      storage.setItem(accountKey, legacy);
      storage.removeItem(LEGACY_DEVICE_KEY);
      return legacy;
    }
    if (existing && legacy) {
      storage.removeItem(LEGACY_DEVICE_KEY);
    }
    return existing;
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
    clerkName?: MyDayClerkName | null,
  ): MyDayIdentityResolution<T> {
    // Missing/loading subject: never bind — leftover picks and empty
    // authSubjectId must not fill the gap (undefined === undefined).
    if (!isUsableAuthSubjectId(userId)) {
      return unbound<T>();
    }

    const linkedPeople = people.filter(
      (person) =>
        isUsableAuthSubjectId(person.authSubjectId) &&
        person.authSubjectId === userId,
    );
    if (linkedPeople.length > 1) {
      return unbound<T>();
    }

    const stored = storedPersonId
      ? people.find((person) => person._id === storedPersonId)
      : undefined;
    const usableStored =
      stored && !linkedToOtherSubject(stored, userId) ? stored : undefined;

    if (linkedPeople.length === 1) {
      const linked = linkedPeople[0];
      if (personMatchesClerkName(linked, clerkName)) {
        return { person: linked, linkedToSignIn: true };
      }

      // Unique link is a differently-named teammate (production: bill
      // has authSubjectId === Angriff's Clerk id). If Angriff is still
      // a candidate — unlinked Person matching Clerk name/email, or a
      // remembered pick that is not bill — do not bind bill.
      const nameMatches = people.filter(
        (person) =>
          person._id !== linked._id &&
          !linkedToOtherSubject(person, userId) &&
          personMatchesClerkName(person, clerkName),
      );
      const storedAlt =
        usableStored && usableStored._id !== linked._id
          ? usableStored
          : undefined;
      if (nameMatches.length === 0 && !storedAlt) {
        return { person: linked, linkedToSignIn: true };
      }

      // Explicit pick of the Clerk-matching Person survives (Switch).
      // Do not auto-bind an unlinked name match — stay unbound + picker.
      if (
        storedAlt &&
        (nameMatches.length === 0 ||
          nameMatches.some((person) => person._id === storedAlt._id))
      ) {
        return { person: storedAlt, linkedToSignIn: false };
      }
      return unbound<T>();
    }

    if (!usableStored) return unbound<T>();

    // Leftover pick of bill must not bind when the signed-in human is
    // Angriff (Clerk name/email known and the pick does not match).
    if (
      clerkHasIdentity(clerkName) &&
      !personMatchesClerkName(usableStored, clerkName)
    ) {
      return unbound<T>();
    }

    return { person: usableStored, linkedToSignIn: false };
  }
}

export const myDayIdentityResolver = new MyDayIdentityResolver();
