/**
 * Runtime proof: reference fields marked `readonly` (2026-09-25).
 *
 * EventDish.eventId and ProposalLineItem.proposalId are set once when the row
 * is added. Re-running the add command on an existing row with a different
 * parent is refused and leaves the row where it was; ordinary edits of the
 * same row keep working (moving a dish is remove + addToEvent on a new row).
 * The generated E_READONLY check itself is proven in Manifest
 * (readonly-emit.test.ts); here the add commands' own guards refuse first.
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
type Created = { docId: string; version?: number };

async function run(
  proof: Proof,
  actor: Actor,
  fn: unknown,
  args: Record<string, unknown>,
): Promise<Created> {
  return (await proof.executeCommand(
    actor,
    fn as never,
    args as never,
  )) as Created;
}

async function row(actor: Actor, id: string) {
  return (await actor.run(async (ctx) => ctx.db.get(id as never))) as Record<
    string,
    unknown
  >;
}

describe("runtime proof: readonly parent references", () => {
  it("keeps an event dish on its event and a proposal line on its proposal", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-readonly-refs",
      role: "owner",
      tenantId: "tenant-readonly-refs",
    });
    await run(proof, owner, api.mutations.Organization_createViaRegister, {
      name: "Readonly kitchen",
    });
    const client = await run(
      proof,
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Readonly client" },
    );
    const event = (title: string) =>
      run(proof, owner, api.mutations.Event_createViaPlanEngagement, {
        clientId: client.docId,
        title,
        eventType: "catering",
        startsAt: Date.UTC(2026, 11, 12, 18, 0),
        endsAt: Date.UTC(2026, 11, 12, 22, 0),
        expectedHeadcount: 50,
        primaryContactName: "Pat Readonly",
        budgetAmount: 2000,
        quotedPrice: 3000,
      });
    const first = await event("Readonly first");
    const second = await event("Readonly second");
    const dish = await run(
      proof,
      owner,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Readonly bread",
        portionSize: 1,
        portionUnit: "portion",
        category: "bread",
      },
    );

    const added = await run(
      proof,
      owner,
      api.mutations.EventDish_createViaAddToEvent,
      { eventId: first.docId, dishId: dish.docId, quantityServings: 50 },
    );
    await expect(
      run(proof, owner, api.mutations.EventDish_addToEvent, {
        docId: added.docId,
        eventId: second.docId,
        dishId: dish.docId,
        quantityServings: 50,
      }),
    ).rejects.toThrow();
    expect((await row(owner, added.docId)).eventId).toBe(first.docId);
    await run(proof, owner, api.mutations.EventDish_adjustServings, {
      docId: added.docId,
      quantityServings: 0,
    });
    expect((await row(owner, added.docId)).quantityServings).toBe(0);

    const proposal = (title: string) =>
      run(proof, owner, api.mutations.Proposal_createViaDraft, {
        clientId: client.docId,
        title,
        subtotal: 100,
        taxAmount: 0,
        discountAmount: 0,
        total: 100,
      });
    const proposalA = await proposal("Readonly proposal A");
    const proposalB = await proposal("Readonly proposal B");
    const line = await run(
      proof,
      owner,
      api.mutations.ProposalLineItem_createViaAddLine,
      {
        proposalId: proposalA.docId,
        description: "Bread service",
        pricingBasis: "flat",
        unitPrice: 100,
        amount: 100,
      },
    );
    await expect(
      run(proof, owner, api.mutations.ProposalLineItem_addLine, {
        docId: line.docId,
        proposalId: proposalB.docId,
        description: "Bread service",
        pricingBasis: "flat",
        unitPrice: 100,
        amount: 100,
      }),
    ).rejects.toThrow();
    expect((await row(owner, line.docId)).proposalId).toBe(proposalA.docId);
  });
});
