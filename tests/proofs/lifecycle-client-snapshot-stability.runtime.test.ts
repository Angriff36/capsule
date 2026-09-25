/**
 * Runtime proof (AC-398 client-snapshot slice): the Event's clientName is a
 * snapshot of the client's printed name at booking, not a live link. A later
 * catalog edit on the Client row must NOT rewrite the Event's clientName.
 * Client has no reviseDetails command — a raw db.patch simulates the later
 * catalog edit; do not invent a rename command. planEngagement is the only
 * writer of clientName, and captureDraft / updateImportDraft / reassignClient
 * stay unwired for it.
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

/** Client + Event carrying a clientName snapshot. */
async function createEventWithClient(
  proof: Proof,
  tenantId: string,
  title: string,
  companyName: string,
): Promise<{ eventId: string; clientId: string }> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      clientName: companyName,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Snapshot",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return { eventId: event.docId, clientId: client.docId };
}

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{
  stage: string;
  clientId: string | null;
  clientName: string | null;
  quotedPrice: number;
}> {
  return (await actor.run(async (ctx) => ctx.db.get(eventId as never))) as {
    stage: string;
    clientId: string | null;
    clientName: string | null;
    quotedPrice: number;
  };
}

async function readClient(
  actor: Role,
  clientId: string,
): Promise<{ companyName: string | null }> {
  return (await actor.run(async (ctx) => ctx.db.get(clientId as never))) as {
    companyName: string | null;
  };
}

describe("runtime proof: Event client snapshot stays put under catalog edits", () => {
  it("catalog client rename leaves event snapshot", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-client-catalog-edit";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, clientId } = await createEventWithClient(
      proof,
      tenantId,
      "Client snapshot holds under catalog edit",
      "Acme Catering",
    );

    const before = await readEvent(events, eventId);
    expect(before.clientId).toBe(clientId);
    expect(before.clientName).toBe("Acme Catering");
    expect(before.quotedPrice).toBe(4500);
    expect(before.stage).toBe("planning");

    // Client has no rename command — a raw patch simulates a later catalog
    // edit without inventing one.
    await events.run(async (ctx) => {
      await ctx.db.patch(clientId as never, { companyName: "Acme RENAMED" });
    });

    const catalog = await readClient(events, clientId);
    expect(catalog.companyName).toBe("Acme RENAMED");

    const after = await readEvent(events, eventId);
    expect(after.clientId).toBe(clientId);
    expect(after.clientName).toBe("Acme Catering");
    expect(after.quotedPrice).toBe(4500);
    expect(after.stage).toBe("planning");
  });

  it("a second event carries its own client snapshot and a catalog rename leaves it", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-client-second-event";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, clientId } = await createEventWithClient(
      proof,
      tenantId,
      "Second event client snapshot holds",
      "Beacon Hospitality",
    );

    await events.run(async (ctx) => {
      await ctx.db.patch(clientId as never, { companyName: "Beacon RENAMED" });
    });

    const catalog = await readClient(events, clientId);
    expect(catalog.companyName).toBe("Beacon RENAMED");

    const after = await readEvent(events, eventId);
    expect(after.clientId).toBe(clientId);
    expect(after.clientName).toBe("Beacon Hospitality");
  });
});
