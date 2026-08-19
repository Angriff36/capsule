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
const billLinked = { _id: "person-bill", authSubjectId: "user_bill" };
const angriff = { _id: "person-angriff", authSubjectId: "user_angriff" };
const guest = { _id: "person-guest", authSubjectId: undefined };

describe("MyDayIdentityResolver", () => {
  let storage: MemoryStorage;
  let resolver: MyDayIdentityResolver;

  beforeEach(() => {
    storage = new MemoryStorage();
    resolver = new MyDayIdentityResolver(() => storage);
  });

  // Production leftover after PR 162: /my header showed "bill colacurcio"
  // while the shell showed Angriff. The linked-match hole (undefined ===
  // undefined) was closed, but a leftover pick still bound while the Clerk
  // subject was missing/loading, and a pick of a Person linked to someone
  // else still won when Angriff's row was not yet matched.
  it("does not bind to bill when user id is undefined", () => {
    expect(resolver.resolve([bill], undefined, null).person).toBeUndefined();
    expect(
      resolver.resolve([billNullLink], undefined, null).person,
    ).toBeUndefined();
    expect(
      resolver.resolve([bill, angriff], undefined, bill._id).person,
    ).toBeUndefined();
    expect(
      resolver.resolve([bill, angriff], "", bill._id).person,
    ).toBeUndefined();
  });

  it("does not bind to bill when the signed-in subject is Angriff", () => {
    const leftoverBill = bill._id;

    const linked = resolver.resolve(
      [bill, angriff],
      "user_angriff",
      leftoverBill,
    );
    expect(linked.person).toBe(angriff);
    expect(linked.linkedToSignIn).toBe(true);
    expect(linked.person?._id).not.toBe("person-bill");

    const billOwnedByBill = resolver.resolve(
      [billLinked, angriff],
      "user_angriff",
      billLinked._id,
    );
    expect(billOwnedByBill.person).toBe(angriff);
    expect(billOwnedByBill.person?._id).not.toBe("person-bill");

    const onlyBillLinkedToSomeoneElse = resolver.resolve(
      [billLinked],
      "user_angriff",
      billLinked._id,
    );
    expect(onlyBillLinkedToSomeoneElse.person).toBeUndefined();
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
      [bill, angriff, guest],
      "user_guest",
      guest._id,
    );
    expect(resolution.person).toBe(guest);
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

  it("page bind sequence never surfaces bill for Angriff", () => {
    storage.setItem(LEGACY_DEVICE_KEY, bill._id);
    storage.setItem(`${LEGACY_DEVICE_KEY}.user_angriff`, bill._id);

    const loadingPick = resolver.readStoredPersonId(undefined);
    const loading = resolver.resolve(
      [billLinked, angriff],
      undefined,
      loadingPick ?? bill._id,
    );
    expect(loading.person).toBeUndefined();
    expect(storage.getItem(LEGACY_DEVICE_KEY)).toBeNull();

    const readyPick = resolver.readStoredPersonId("user_angriff");
    const ready = resolver.resolve(
      [billLinked, angriff],
      "user_angriff",
      readyPick,
    );
    expect(ready.person).toBe(angriff);
    expect(ready.person?._id).not.toBe("person-bill");
  });
});
