/**
 * Runtime proof (AC-398 occasion-snapshot slice): the Event's occasion fields
 * are a snapshot of the catalog Occasion, not a live link. Revising the
 * catalog Occasion later (rename) must NOT rewrite the Event's occasionName.
 * There is no Event.changeOccasion command — planEngagement is the only
 * writer, and captureDraft / updateImportDraft stay unwired for it.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;
const M = api.mutations;

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
type Role = ReturnType<Proof["asRole"]>;

function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role } {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
    events: proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    }),
  };
}

/** Client + Event carrying an occasion snapshot. */
async function createEventWithOccasion(
  proof: Proof,
  tenantId: string,
  title: string,
  occasion: { name: string; code: string; sortOrder: number },
): Promise<{ eventId: string; occasionId: string }> {
  const { sales, events } = rolesFor(proof, tenantId);
  const occasionDoc = (await proof.executeCommand(
    events,
    M.Occasion_createViaRegister,
    occasion,
  )) as { docId: string };
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Occasion snapshot client ${tenantId}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Snapshot",
      budgetAmount: 3000,
      quotedPrice: 4500,
      occasionId: occasionDoc.docId,
      occasionName: occasion.name,
    },
  )) as { docId: string };
  return { eventId: event.docId, occasionId: occasionDoc.docId };
}

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{
  stage: string;
  occasionId: string | null;
  occasionName: string | null;
  quotedPrice: number;
}> {
  return (await actor.run(async (ctx) => ctx.db.get(eventId as never))) as {
    stage: string;
    occasionId: string | null;
    occasionName: string | null;
    quotedPrice: number;
  };
}

async function readOccasion(
  actor: Role,
  occasionId: string,
): Promise<{ name: string }> {
  return (await actor.run(async (ctx) => ctx.db.get(occasionId as never))) as {
    name: string;
  };
}

describe("runtime proof: Event occasion snapshot stays put under catalog edits", () => {
  it("catalog occasion rename leaves event snapshot", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-occasion-catalog-revise";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, occasionId } = await createEventWithOccasion(
      proof,
      tenantId,
      "Occasion snapshot holds under catalog revise",
      { name: "Wedding", code: `WEDDING_${tenantId}`, sortOrder: 10 },
    );

    const before = await readEvent(events, eventId);
    expect(before.occasionId).toBe(occasionId);
    expect(before.occasionName).toBe("Wedding");
    expect(before.quotedPrice).toBe(4500);
    expect(before.stage).toBe("planning");

    await proof.executeCommand(events, M.Occasion_reviseDetails, {
      docId: occasionId,
      name: "Wedding RENAMED",
    });

    const catalog = await readOccasion(events, occasionId);
    expect(catalog.name).toBe("Wedding RENAMED");

    const after = await readEvent(events, eventId);
    expect(after.occasionId).toBe(occasionId);
    expect(after.occasionName).toBe("Wedding");
    expect(after.quotedPrice).toBe(4500);
    expect(after.stage).toBe("planning");
  });

  it("a second event carries its own occasion snapshot and a catalog rename leaves it", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-occasion-second-event";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, occasionId } = await createEventWithOccasion(
      proof,
      tenantId,
      "Second event occasion snapshot holds",
      { name: "Corporate Gala", code: `GALA_${tenantId}`, sortOrder: 20 },
    );

    await proof.executeCommand(events, M.Occasion_reviseDetails, {
      docId: occasionId,
      name: "Corporate Gala RENAMED",
    });

    const catalog = await readOccasion(events, occasionId);
    expect(catalog.name).toBe("Corporate Gala RENAMED");

    const after = await readEvent(events, eventId);
    expect(after.occasionId).toBe(occasionId);
    expect(after.occasionName).toBe("Corporate Gala");
  });
});
