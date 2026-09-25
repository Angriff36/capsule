/**
 * Runtime proof (AC-398 style-snapshot slice): the Event's service-style
 * fields are a snapshot of the catalog ServiceStyle, not a live link.
 * Revising the catalog ServiceStyle later (rename) must NOT rewrite the
 * Event's serviceStyleName, while an explicit Event_changeServiceStyle still
 * writes a new snapshot — refusal-to-cascade is a snapshot, not a freeze.
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

/** Client + Event carrying a "Full Service" service-style snapshot. */
async function createEventWithStyle(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; styleId: string }> {
  const { sales, events } = rolesFor(proof, tenantId);
  const style = (await proof.executeCommand(
    events,
    M.ServiceStyle_createViaRegister,
    {
      name: "Full Service",
      code: `FULL_SERVICE_${tenantId}`,
      sortOrder: 10,
    },
  )) as { docId: string };
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Style snapshot client ${tenantId}`,
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
      serviceStyleId: style.docId,
      serviceStyleName: "Full Service",
    },
  )) as { docId: string };
  return { eventId: event.docId, styleId: style.docId };
}

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{
  stage: string;
  version: number;
  serviceStyleId: string | null;
  serviceStyleName: string | null;
  quotedPrice: number;
}> {
  return (await actor.run(async (ctx) => ctx.db.get(eventId as never))) as {
    stage: string;
    version: number;
    serviceStyleId: string | null;
    serviceStyleName: string | null;
    quotedPrice: number;
  };
}

async function readStyle(
  actor: Role,
  styleId: string,
): Promise<{ name: string }> {
  return (await actor.run(async (ctx) => ctx.db.get(styleId as never))) as {
    name: string;
  };
}

describe("runtime proof: Event service-style snapshot stays put under catalog edits", () => {
  it("catalog service-style rename leaves event snapshot", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-style-catalog-revise";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, styleId } = await createEventWithStyle(
      proof,
      tenantId,
      "Style snapshot holds under catalog revise",
    );

    const before = await readEvent(events, eventId);
    expect(before.serviceStyleId).toBe(styleId);
    expect(before.serviceStyleName).toBe("Full Service");
    expect(before.quotedPrice).toBe(4500);
    expect(before.stage).toBe("planning");

    await proof.executeCommand(events, M.ServiceStyle_reviseDetails, {
      docId: styleId,
      name: "Full Service RENAMED",
    });

    const catalog = await readStyle(events, styleId);
    expect(catalog.name).toBe("Full Service RENAMED");

    const after = await readEvent(events, eventId);
    expect(after.serviceStyleId).toBe(styleId);
    expect(after.serviceStyleName).toBe("Full Service");
    expect(after.quotedPrice).toBe(4500);
    expect(after.stage).toBe("planning");
  });

  it("explicit Event_changeServiceStyle writes a new snapshot and a later catalog rename leaves it", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-style-explicit-change";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await createEventWithStyle(
      proof,
      tenantId,
      "Explicit change service style writes snapshot",
    );

    const dropOff = (await proof.executeCommand(
      events,
      M.ServiceStyle_createViaRegister,
      {
        name: "Drop Off",
        code: `DROP_OFF_${tenantId}`,
        sortOrder: 20,
      },
    )) as { docId: string };

    await proof.executeCommand(events, M.Event_changeServiceStyle, {
      docId: eventId,
      serviceStyleId: dropOff.docId,
      serviceStyleName: "Drop Off",
    });

    const changed = await readEvent(events, eventId);
    expect(changed.serviceStyleId).toBe(dropOff.docId);
    expect(changed.serviceStyleName).toBe("Drop Off");
    expect(changed.quotedPrice).toBe(4500);

    await proof.executeCommand(events, M.ServiceStyle_reviseDetails, {
      docId: dropOff.docId,
      name: "Drop Off RENAMED",
    });

    const catalog = await readStyle(events, dropOff.docId);
    expect(catalog.name).toBe("Drop Off RENAMED");

    const after = await readEvent(events, eventId);
    expect(after.serviceStyleId).toBe(dropOff.docId);
    expect(after.serviceStyleName).toBe("Drop Off");
  });
});
