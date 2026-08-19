import { beforeEach, describe, expect, it } from "vitest";
import {
  MyDayIdentityResolver,
  type PersonPickStorage,
} from "../src/features/staff/MyDayIdentityResolver";

const LEGACY_DEVICE_KEY = "capsule.my-day.personId";

class MemoryStorage implements PersonPickStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const bill = { _id: "person-bill", authSubjectId: undefined };
const billNullLink = { _id: "person-bill", authSubjectId: null };
const angriff = { _id: "person-angriff", authSubjectId: "user_angriff" };

describe("MyDayIdentityResolver", () => {
  let storage: MemoryStorage;
  let resolver: MyDayIdentityResolver;

  beforeEach(() => {
    storage = new MemoryStorage();
    resolver = new MyDayIdentityResolver(() => storage);
  });

  // Regression guard for the production bug: a loose
  // `person.authSubjectId === user?.id` comparison matches
  // undefined === undefined and silently renders another teammate's day.
  it("a missing user id never matches an unlinked Person", () => {
    expect(resolver.resolve([bill], undefined, null).person).toBeUndefined();
    expect(
      resolver.resolve([billNullLink], undefined, null).person,
    ).toBeUndefined();
  });

  it("a signed-in user does not match a Person with no linked account", () => {
    const resolution = resolver.resolve([bill], "user_angriff", null);
    expect(resolution.person).toBeUndefined();
    expect(resolution.linkedToSignIn).toBe(false);
  });

  it("the linked Person wins over a stored pick", () => {
    const resolution = resolver.resolve(
      [bill, angriff],
      "user_angriff",
      bill._id,
    );
    expect(resolution.person).toBe(angriff);
    expect(resolution.linkedToSignIn).toBe(true);
  });

  it("an unlinked sign-in falls back to its own explicit pick", () => {
    const resolution = resolver.resolve(
      [bill, angriff],
      "user_someone_else",
      bill._id,
    );
    expect(resolution.person).toBe(bill);
    expect(resolution.linkedToSignIn).toBe(false);
  });

  it("ignores and clears the legacy device-global key", () => {
    storage.setItem(LEGACY_DEVICE_KEY, bill._id);
    expect(resolver.readStoredPersonId("user_angriff")).toBeNull();
    expect(storage.getItem(LEGACY_DEVICE_KEY)).toBeNull();
  });

  it("keys picks by user id so accounts cannot see each other's pick", () => {
    resolver.storePersonId("user_angriff", angriff._id);
    expect(storage.getItem(`${LEGACY_DEVICE_KEY}.user_angriff`)).toBe(
      angriff._id,
    );
    expect(resolver.readStoredPersonId("user_angriff")).toBe(angriff._id);
    expect(resolver.readStoredPersonId("user_bill")).toBeNull();
  });

  it("clears only the signed-in account's pick", () => {
    resolver.storePersonId("user_angriff", angriff._id);
    resolver.storePersonId("user_bill", bill._id);
    resolver.clearStoredPersonId("user_angriff");
    expect(resolver.readStoredPersonId("user_angriff")).toBeNull();
    expect(resolver.readStoredPersonId("user_bill")).toBe(bill._id);
  });
});
