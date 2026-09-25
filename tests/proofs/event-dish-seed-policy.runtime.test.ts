/**
 * Runtime proof: EventDishComponentSeed commands carry a staff execute policy
 * (manifest scan finding, 2026-09-25). Adding a dish as event staff still
 * seeds its components through the reaction; an identity outside the role
 * hierarchy calling a seed command directly is refused.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;
type Created = { docId: string };

const TENANT = "tenant-seed-policy";

function run(
  proof: Proof,
  actor: Actor,
  fn: unknown,
  args: Record<string, unknown>,
): Promise<Created> {
  return proof.executeCommand(
    actor,
    fn as never,
    args as never,
  ) as Promise<Created>;
}

describe("runtime proof: EventDishComponentSeed staff policy", () => {
  it("seeds through staff reactions and refuses callers outside the role hierarchy", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-seed-policy",
      role: "owner",
      tenantId: TENANT,
    });
    await run(proof, owner, api.mutations.Organization_createViaRegister, {
      name: "Seed policy kitchen",
    });
    const component = await run(
      proof,
      owner,
      api.mutations.Component_createViaDraft,
      {
        name: "Seed policy base",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    );
    const dish = await run(
      proof,
      owner,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Seed policy dish",
        portionSize: 1,
        portionUnit: "portion",
        category: "bread",
      },
    );
    await run(proof, owner, api.mutations.DishComponent_createViaAttach, {
      dishId: dish.docId,
      componentId: component.docId,
      yieldQuantity: 1,
      batchMultiplier: 1,
    });
    const client = await run(
      proof,
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Seed policy client" },
    );
    const event = await run(
      proof,
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Seed policy dinner",
        eventType: "catering",
        startsAt: Date.UTC(2026, 11, 3, 18, 0),
        endsAt: Date.UTC(2026, 11, 3, 22, 0),
        expectedHeadcount: 40,
        primaryContactName: "Sky Seed",
        budgetAmount: 1000,
        quotedPrice: 1500,
      },
    );
    await run(proof, owner, api.mutations.EventDish_createViaAddToEvent, {
      eventId: event.docId,
      dishId: dish.docId,
      quantityServings: 40,
    });

    const seeds = (await owner.run(async (ctx) =>
      ctx.db.query("eventDishComponentSeeds").collect(),
    )) as Array<{ _id: string; deletedAt?: number | null }>;
    expect(seeds).toHaveLength(1);

    const outsider = proof.asRole({
      subject: "outsider-seed-policy",
      role: "guest",
      tenantId: TENANT,
    });
    await expect(
      run(proof, outsider, api.mutations.EventDishComponentSeed_retire, {
        docId: seeds[0]!._id,
      }),
    ).rejects.toThrow("Staff actions keep dish recipe seeds in step");
    const after = (await owner.run(async (ctx) =>
      ctx.db.get(seeds[0]!._id as never),
    )) as { deletedAt?: number | null };
    expect(after.deletedAt ?? null).toBeNull();
  });
});
