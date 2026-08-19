import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clerkSignedInLabel,
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

const billNamed = {
  _id: "person-bill",
  authSubjectId: "user_angriff",
  givenName: "bill",
  familyName: "colacurcio",
  email: "bill@example.com",
};
const angriffNamed = {
  _id: "person-angriff",
  authSubjectId: undefined as string | undefined,
  givenName: "Angriff",
  familyName: "Operator",
  email: "angriff@example.com",
};
const clerkAngriff = {
  firstName: "Angriff",
  lastName: null,
  fullName: "Angriff",
  email: "angriff@example.com",
};

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
    expect(
      resolver.resolve([billNamed, angriffNamed], undefined, null, clerkAngriff)
        .person,
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

  it("does not delete the legacy key when the subject is still unknown", () => {
    storage.setItem(LEGACY_DEVICE_KEY, angriff._id);
    expect(resolver.readStoredPersonId(undefined)).toBeNull();
    expect(resolver.readStoredPersonId("")).toBeNull();
    expect(storage.getItem(LEGACY_DEVICE_KEY)).toBe(angriff._id);
  });

  it("migrates a legacy Angriff pick onto the per-account key", () => {
    storage.setItem(LEGACY_DEVICE_KEY, angriff._id);
    expect(resolver.readStoredPersonId("user_angriff")).toBe(angriff._id);
    expect(storage.getItem(`${LEGACY_DEVICE_KEY}.user_angriff`)).toBe(
      angriff._id,
    );
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

  it("two people sharing this authSubjectId stay unbound", () => {
    const billSameLink = {
      ...billNamed,
      authSubjectId: "user_angriff",
    };
    const angriffSameLink = {
      ...angriffNamed,
      authSubjectId: "user_angriff",
    };
    const resolution = resolver.resolve(
      [billSameLink, angriffSameLink],
      "user_angriff",
      null,
      clerkAngriff,
    );
    expect(resolution.person).toBeUndefined();
    expect(resolution.linkedToSignIn).toBe(false);
    expect(resolution.person?._id).not.toBe("person-bill");
  });

  // Production QA 203 shape: Angriff Person is present but unlinked,
  // bill.authSubjectId === the signed-in Clerk id. First-match unique
  // link would return bill + linkedToSignIn and hide Switch.
  it("does not bind bill when Angriff is unlinked and bill.authSubjectId is this Clerk id", () => {
    const angriffUnlinked = {
      ...angriffNamed,
      authSubjectId: undefined,
    };
    const resolution = resolver.resolve(
      [billNamed, angriffUnlinked],
      "user_angriff",
      null,
      clerkAngriff,
    );
    expect(resolution.person).toBeUndefined();
    expect(resolution.linkedToSignIn).toBe(false);
    expect(resolution.person?._id).not.toBe("person-bill");

    const angriffNullLink = { ...angriffNamed, authSubjectId: null };
    const viaNull = resolver.resolve(
      [billNamed, angriffNullLink],
      "user_angriff",
      null,
      clerkAngriff,
    );
    expect(viaNull.person).toBeUndefined();
    expect(viaNull.person?._id).not.toBe("person-bill");

    const viaEmail = resolver.resolve(
      [billNamed, angriffUnlinked],
      "user_angriff",
      null,
      {
        firstName: null,
        lastName: null,
        fullName: null,
        email: "angriff@example.com",
      },
    );
    expect(viaEmail.person).toBeUndefined();
    expect(viaEmail.person?._id).not.toBe("person-bill");
  });

  it("does not lock the unique linked bill when Clerk is Angriff and no Angriff Person exists", () => {
    const resolution = resolver.resolve(
      [billNamed],
      "user_angriff",
      null,
      clerkAngriff,
    );
    expect(resolution.person).toBeUndefined();
    expect(resolution.linkedToSignIn).toBe(false);
    expect(resolution.person?._id).not.toBe("person-bill");
  });

  it("binds the unique linked Person when the name matches Clerk", () => {
    const angriffLinked = {
      ...angriffNamed,
      authSubjectId: "user_angriff",
    };
    const resolution = resolver.resolve(
      [angriffLinked],
      "user_angriff",
      null,
      clerkAngriff,
    );
    expect(resolution.person).toBe(angriffLinked);
    expect(resolution.linkedToSignIn).toBe(true);
  });

  it("does not lock a differently-named unique link when Angriff is a candidate", () => {
    const namedMismatch = resolver.resolve(
      [billNamed, angriffNamed],
      "user_angriff",
      null,
      clerkAngriff,
    );
    expect(namedMismatch.person).toBeUndefined();
    expect(namedMismatch.person?._id).not.toBe("person-bill");
    expect(namedMismatch.linkedToSignIn).toBe(false);

    const rememberedAngriff = resolver.resolve(
      [billNamed, angriffNamed],
      "user_angriff",
      angriffNamed._id,
      clerkAngriff,
    );
    expect(rememberedAngriff.person).toBe(angriffNamed);
    expect(rememberedAngriff.person?._id).not.toBe("person-bill");
    expect(rememberedAngriff.linkedToSignIn).toBe(false);
  });

  it("leftover pick of bill does not bind when subject is missing or Angriff", () => {
    expect(
      resolver.resolve(
        [billNamed, angriffNamed],
        undefined,
        billNamed._id,
        clerkAngriff,
      ).person,
    ).toBeUndefined();

    const ready = resolver.resolve(
      [{ ...billNamed, authSubjectId: undefined }, angriffNamed],
      "user_angriff",
      billNamed._id,
      clerkAngriff,
    );
    expect(ready.person?._id).not.toBe("person-bill");
    expect(ready.linkedToSignIn).toBe(false);
  });

  it("keeps an explicit Angriff pick after reload instead of snapping to bill", () => {
    resolver.storePersonId("user_angriff", angriffNamed._id);
    const stored = resolver.readStoredPersonId("user_angriff");
    const resolution = resolver.resolve(
      [billNamed, angriffNamed],
      "user_angriff",
      stored,
      clerkAngriff,
    );
    expect(resolution.person).toBe(angriffNamed);
    expect(resolution.person?._id).not.toBe("person-bill");
  });

  it("a Person linked to someone else is never a silent fallback", () => {
    const resolution = resolver.resolve(
      [billLinked],
      "user_angriff",
      billLinked._id,
    );
    expect(resolution.person).toBeUndefined();
  });

  it("page bind sequence never surfaces bill for Angriff", () => {
    storage.setItem(LEGACY_DEVICE_KEY, angriffNamed._id);

    const loadingPick = resolver.readStoredPersonId(undefined);
    const loading = resolver.resolve(
      [billNamed, angriffNamed],
      undefined,
      loadingPick,
      clerkAngriff,
    );
    expect(loading.person).toBeUndefined();
    expect(storage.getItem(LEGACY_DEVICE_KEY)).toBe(angriffNamed._id);

    const readyPick = resolver.readStoredPersonId("user_angriff");
    expect(readyPick).toBe(angriffNamed._id);
    expect(storage.getItem(`${LEGACY_DEVICE_KEY}.user_angriff`)).toBe(
      angriffNamed._id,
    );
    expect(storage.getItem(LEGACY_DEVICE_KEY)).toBeNull();

    const ready = resolver.resolve(
      [billNamed, angriffNamed],
      "user_angriff",
      readyPick,
      clerkAngriff,
    );
    expect(ready.person).toBe(angriffNamed);
    expect(ready.person?._id).not.toBe("person-bill");
  });
});

describe("My Day signed-in identity paint", () => {
  const pageSource = readFileSync("src/features/staff/MyDayPage.tsx", "utf8");
  const frameSource = readFileSync("src/features/staff/MyDayFrame.tsx", "utf8");

  it("clerkSignedInLabel uses Clerk fullName / email, never a Person leftover", () => {
    expect(
      clerkSignedInLabel({
        firstName: "Angriff",
        lastName: null,
        fullName: "Angriff",
        email: "angriff@example.com",
      }),
    ).toBe("Angriff");
    expect(
      clerkSignedInLabel({
        firstName: null,
        lastName: null,
        fullName: null,
        email: "angriff@example.com",
      }),
    ).toBe("angriff@example.com");
    expect(clerkSignedInLabel(null)).toBe("");
  });

  it("chip and PageHeader cannot omit the signed-in Clerk name", () => {
    expect(pageSource).toMatch(/signedInName=\{clerkDisplayName/);
    expect(pageSource).toMatch(/clerkDisplayName = clerkSignedInLabel/);
    expect(pageSource).toMatch(
      /<MyDayFrame\s+signedInName=\{clerkDisplayName \|\| undefined\}/,
    );
    expect(frameSource).toMatch(/signedInName\?: string/);
    expect(frameSource).toMatch(/signedInName &&/);
    expect(frameSource).toMatch(/signedInName \?\? "My Day"/);
    expect(frameSource).toMatch(/identityLead = signedInName/);
    expect(frameSource).toMatch(/lead=\{identityLead\}/);
    expect(pageSource).not.toMatch(
      /subtitle=\{`\$\{me\.givenName\} \$\{me\.familyName\}`\}/,
    );
  });

  it("bound view uses Switch only for an unlinked explicit pick", () => {
    expect(pageSource).toMatch(
      /onSwitchPerson=\{linkedToSignIn \? undefined : switchPerson\}/,
    );
    expect(pageSource).toMatch(/linkedPersonName=\{linkedPersonName\}/);
    expect(pageSource).toMatch(
      /linkedToSignIn && me \? `\${me\.givenName} \${me\.familyName}`/,
    );
    expect(pageSource).toMatch(/md:grid-cols-2/);
  });

  it("does not auto-store a person id on load", () => {
    expect(pageSource.match(/storePersonId/g)?.length).toBe(1);
    expect(pageSource).toMatch(
      /const choosePerson = \(id: string\) => \{\s*myDayIdentityResolver\.storePersonId/,
    );
  });

  it("wide two-column layout stays on the bound frame", () => {
    expect(pageSource).toMatch(/<MyDayFrame\s+wide\s+signedInName=/);
    expect(frameSource).toMatch(/wide \? "max-w-md md:max-w-5xl"/);
  });
});
