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
});
