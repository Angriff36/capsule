/**
 * Runtime proof (PL-AUTH, AC-151): a saved step answer replays only for the
 * same workspace and the same step.
 *
 * Every generated mutation saves its answer under the caller's idempotency
 * key so a retry gets the first answer back. The key alone was the lookup, so
 * workspace B (or a signed-out caller) sending workspace A's record id and a
 * known key got A's saved answer - here A's whole ingredient record - before
 * the step checked the record. Synthetic workspaces only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const kitchen = (tenantId: string) => ({
  subject: `replay-kitchen-${tenantId}`,
  tokenIdentifier: `replay|kitchen-${tenantId}`,
  role: "kitchen_manager",
  tenantId,
});

describe("saved step answers replay only in their own workspace (PL-AUTH)", () => {
  it("refuses a known key with another workspace's or a missing record, and still replays for its own", async () => {
    const t = convexTest(schema, modules);
    const a = t.withIdentity(kitchen("tenant-replay-a"));
    const b = t.withIdentity(kitchen("tenant-replay-b"));

    const introduce = (as: typeof a, name: string) =>
      as.mutation(api.mutations.Ingredient_createViaIntroduce, {
        name,
        unit: "kilogram",
        costPerUnit: 3,
        allergens: [],
        category: "pantry",
      }) as Promise<{ docId: Id<"ingredients"> }>;
    const discontinue = (
      as: typeof a | typeof t,
      docId: Id<"ingredients">,
      idempotencyKey: string,
    ) =>
      as.mutation(api.mutations.Ingredient_discontinue, {
        docId,
        reason: "Out of season",
        idempotencyKey,
      });

    // Workspace A discontinues its saffron; the answer is its whole record.
    const saffron = await introduce(a, "Secret saffron A");
    const first = (await discontinue(a, saffron.docId, "replay-key")) as {
      name?: string;
    };
    expect(first.name).toBe("Secret saffron A");

    // Workspace A's own retry gets the same answer back.
    expect(await discontinue(a, saffron.docId, "replay-key")).toEqual(first);

    // Workspace B and a signed-out caller with A's record and A's key.
    await expect(discontinue(b, saffron.docId, "replay-key")).rejects.toThrow(
      "Ingredient not found",
    );
    await expect(discontinue(t, saffron.docId, "replay-key")).rejects.toThrow();

    // A missing record with a known key gets the same refusal.
    const gone = await introduce(a, "Gone truffle A");
    await discontinue(a, gone.docId, "gone-key");
    await t.run((ctx) => ctx.db.delete(gone.docId));
    await expect(discontinue(b, gone.docId, "gone-key")).rejects.toThrow(
      "Ingredient not found",
    );

    // Workspace B's own record with A's key runs as a new step, not A's answer.
    const bOwn = await introduce(b, "Plain salt B");
    const bAnswer = (await discontinue(b, bOwn.docId, "replay-key")) as {
      name?: string;
    };
    expect(bAnswer.name).toBe("Plain salt B");
  });

  it("refuses a known key from a same-workspace caller without the role, and from a removed person", async () => {
    const t = convexTest(schema, modules);
    const tenantId = "tenant-replay-role";
    const cook = t.withIdentity(kitchen(tenantId));
    const sales = t.withIdentity({
      subject: "replay-sales",
      tokenIdentifier: "replay|sales",
      role: "sales_staff",
      tenantId,
    });
    const saffron = (await cook.mutation(
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Secret saffron", unit: "kilogram", costPerUnit: 3 },
    )) as { docId: Id<"ingredients"> };
    const discontinue = (as: typeof cook) =>
      as.mutation(api.mutations.Ingredient_discontinue, {
        docId: saffron.docId,
        reason: "Out of season",
        idempotencyKey: "kitchen-key",
      });
    const first = (await discontinue(cook)) as { name?: string };
    expect(first.name).toBe("Secret saffron");
    expect(await discontinue(cook)).toEqual(first);
    // Sales may not see ingredients: the kitchen's saved answer is not theirs.
    await expect(discontinue(sales)).rejects.toThrow(
      "Kitchen, inventory and managers may see ingredients",
    );

    // A staff profile linked to a sign-in that still carries the company's
    // workspace and owner role claims (as a Clerk organization member does);
    // after it is removed, the same sign-in gets no saved answer and cannot
    // run the step fresh either: the claims do not outlive the removal.
    const [ownerId, keeperId] = await t.run(async (ctx) => {
      const person = {
        tenantId,
        givenName: "Pat",
        familyName: "Owner",
        email: "pat@example.test",
        role: "owner",
        status: "active",
        employmentType: "full_time",
        version: 1,
      };
      return [
        await ctx.db.insert("people", {
          ...person,
          authSubjectId: "replay-owner",
        } as never),
        await ctx.db.insert("people", {
          ...person,
          givenName: "Kim",
          authSubjectId: "replay-keeper",
        } as never),
      ];
    });
    const owner = t.withIdentity({
      subject: "replay-owner",
      tokenIdentifier: "replay|owner",
      role: "org:owner",
      tenantId,
    });
    const vanilla = (await cook.mutation(
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Secret vanilla", unit: "kilogram", costPerUnit: 9 },
    )) as { docId: Id<"ingredients"> };
    const retire = (as: typeof owner, idempotencyKey = "owner-key") =>
      as.mutation(api.mutations.Ingredient_discontinue, {
        docId: vanilla.docId,
        idempotencyKey,
      });
    expect(((await retire(owner)) as { name?: string }).name).toBe(
      "Secret vanilla",
    );
    await t.run((ctx) =>
      ctx.db.patch(ownerId as Id<"people">, { status: "inactive" } as never),
    );
    await expect(retire(owner)).rejects.toThrow();
    await expect(retire(owner, "fresh-owner-key")).rejects.toThrow();
    await expect(retire(t as never)).rejects.toThrow();
    // A deleted profile is removed the same way.
    await t.run((ctx) =>
      ctx.db.patch(
        ownerId as Id<"people">,
        { status: "active", deletedAt: Date.now() } as never,
      ),
    );
    await expect(retire(owner, "deleted-owner-key")).rejects.toThrow();

    // A sign-in never linked to a staff profile still starts from its claims,
    // so a new company owner can set up before their profile exists.
    const newcomer = t.withIdentity({
      subject: "replay-newcomer",
      tokenIdentifier: "replay|newcomer",
      role: "org:owner",
      tenantId,
    });
    const cardamom = (await cook.mutation(
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Green cardamom", unit: "kilogram", costPerUnit: 7 },
    )) as { docId: Id<"ingredients"> };
    const newcomerAnswer = (await newcomer.mutation(
      api.mutations.Ingredient_discontinue,
      { docId: cardamom.docId, idempotencyKey: "newcomer-key" },
    )) as { name?: string };
    expect(newcomerAnswer.name).toBe("Green cardamom");

    // A person who removes their own profile: the answer (their own record) is
    // saved under the access they had when they asked, so neither their
    // now-removed sign-in nor a signed-out caller replays it.
    const keeper = t.withIdentity({
      subject: "replay-keeper",
      tokenIdentifier: "replay|keeper",
      role: "org:owner",
      tenantId,
    });
    const selfRemove = (as: typeof keeper) =>
      as.mutation(api.mutations.Person_deactivate, {
        docId: keeperId as Id<"people">,
        idempotencyKey: "self-key",
      });
    expect(((await selfRemove(keeper)) as { email?: string }).email).toBe(
      "pat@example.test",
    );
    await expect(selfRemove(keeper)).rejects.toThrow();
    await expect(selfRemove(t as never)).rejects.toThrow();
  });

  it("checks only the inputs the Manifest declares as links", async () => {
    const t = convexTest(schema, modules);
    const a = t.withIdentity(kitchen("tenant-links-a"));
    const b = t.withIdentity(kitchen("tenant-links-b"));
    const aOwn = (await a.mutation(
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Saffron A", unit: "kilogram", costPerUnit: 3 },
    )) as { docId: string };
    // A text input that happens to hold another workspace's record id is
    // ordinary text: accepted.
    const named = (await b.mutation(
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: aOwn.docId,
        category: aOwn.docId,
        unit: "kilogram",
        costPerUnit: 1,
      },
    )) as { docId: string };
    expect(named.docId).toBeTruthy();
    // The same id in a declared link input is refused.
    await expect(
      b.mutation(api.mutations.Ingredient_createViaIntroduce, {
        name: "Salt B",
        unit: "kilogram",
        costPerUnit: 1,
        preferredVendorId: aOwn.docId,
      }),
    ).rejects.toThrow("A linked record was not found");
  });

  it("refuses a pre-upgrade receipt instead of replaying or re-running it", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      subject: "replay-legacy-owner",
      tokenIdentifier: "replay|legacy-owner",
      role: "org:owner",
      tenantId: "tenant-replay-legacy",
    });
    const saffron = (await owner.mutation(
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Legacy saffron", unit: "kilogram", costPerUnit: 3 },
    )) as { docId: Id<"ingredients"> };
    // A receipt saved by the version that keyed the cache on the raw caller
    // key alone: nobody can prove whose it is, so it must not come back and
    // the step must not run again under it.
    await t.run((ctx) =>
      ctx.db.insert("commandIdempotencyKeys", {
        key: "pre-upgrade-key",
        command: "Ingredient_discontinue",
        result: { forged: true },
        createdAt: Date.now(),
      } as never),
    );
    await expect(
      owner.mutation(api.mutations.Ingredient_discontinue, {
        docId: saffron.docId,
        reason: "Out of season",
        idempotencyKey: "pre-upgrade-key",
      }),
    ).rejects.toThrow(/earlier version of the app/);
    // Nothing re-ran: the ingredient is still on the books.
    const row = (await t.run((ctx) => ctx.db.get(saffron.docId))) as {
      status?: string;
    } | null;
    expect(row?.status).toBe("active");
    // A caller of another workspace with the same pre-upgrade key is refused
    // the same way, never handed the saved answer.
    const other = t.withIdentity(kitchen("tenant-replay-legacy-b"));
    const bSaffron = (await other.mutation(
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Legacy saffron B", unit: "kilogram", costPerUnit: 3 },
    )) as { docId: Id<"ingredients"> };
    await expect(
      other.mutation(api.mutations.Ingredient_discontinue, {
        docId: bSaffron.docId,
        reason: "Out of season",
        idempotencyKey: "pre-upgrade-key",
      }),
    ).rejects.toThrow(/earlier version of the app/);
  });

  it("replays a saved answer before the link check, and rejects malformed and wrong-table links alike", async () => {
    const t = convexTest(schema, modules);
    const tenantId = "tenant-replay-links";
    const owner = t.withIdentity({
      subject: "replay-links-owner",
      tokenIdentifier: "replay|links-owner",
      role: "org:owner",
      tenantId,
    });
    const ids = await t.run(async (ctx) => {
      const announcementId = await ctx.db.insert("announcements", {
        tenantId,
        title: "Menu changes",
        body: "The spring menu starts Monday.",
        category: "general",
        expiresAt: Date.now() + 86_400_000,
        version: 1,
      } as never);
      const dismissalId = await ctx.db.insert("announcementDismissals", {
        tenantId,
        announcementId,
        authSubjectId: "replay-links-owner",
        version: 1,
      } as never);
      return { announcementId, dismissalId };
    });
    const dismiss = (idempotencyKey: string, announcementId?: string) =>
      owner.mutation(api.mutations.AnnouncementDismissal_dismiss, {
        docId: ids.dismissalId as unknown as Id<"announcementDismissals">,
        announcementId: announcementId ?? (ids.announcementId as string),
        idempotencyKey,
      });
    const first = (await dismiss("dismiss-key")) as {
      authSubjectId?: string;
    };
    expect(first.authSubjectId).toBe("replay-links-owner");

    // The linked announcement is deleted; the retry still gets the saved
    // answer back - the link check belongs to fresh runs only.
    await t.run((ctx) => ctx.db.delete(ids.announcementId as never));
    expect(await dismiss("dismiss-key")).toEqual(first);

    // Fresh runs: a malformed link, a link of the wrong table and a missing
    // link all get the same refusal.
    await expect(dismiss("malformed-key", "not-a-record-id")).rejects.toThrow(
      "A linked record was not found",
    );
    const ingredient = (await owner.mutation(
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Wrong-table saffron", unit: "kilogram", costPerUnit: 3 },
    )) as { docId: string };
    await expect(dismiss("wrong-table-key", ingredient.docId)).rejects.toThrow(
      "A linked record was not found",
    );
    await t.run((ctx) => ctx.db.delete(ingredient.docId as never));
    await expect(dismiss("missing-link-key")).rejects.toThrow(
      "A linked record was not found",
    );
  });
});
