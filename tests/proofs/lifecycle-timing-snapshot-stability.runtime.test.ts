/**
 * Runtime proof (AC-398 timing-input slice): the Event's timing inputs are
 * the stored minutes and service start the operator recorded via
 * Event.configureTiming. A later catalog ServiceStyle rename must NOT
 * rewrite them, even though the live suggestion
 * timingSuggestedSetupMinutes changes with the style name — refusal-to-
 * cascade is a snapshot, not a freeze: a second explicit configureTiming
 * still writes a new snapshot.
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
      companyName: `Timing snapshot client ${tenantId}`,
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
      primaryContactName: "Casey Timing",
      budgetAmount: 3000,
      quotedPrice: 4500,
      serviceStyleId: style.docId,
      serviceStyleName: "Full Service",
    },
  )) as { docId: string };
  return { eventId: event.docId, styleId: style.docId };
}

type TimingSnapshot = {
  stage: string;
  version: number;
  serviceStyleId: string | null;
  quotedPrice: number;
  serviceStartsAt: number | null;
  timingSetupMinutes: number | null;
  timingLoadMinutes: number | null;
  timingOutboundTravelMinutes: number | null;
  timingCleanupMinutes: number | null;
  timingReturnTravelMinutes: number | null;
  timingUnloadMinutes: number | null;
  timingConfiguredAt: number | null;
};

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<TimingSnapshot> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as TimingSnapshot;
}

async function readStyle(
  actor: Role,
  styleId: string,
): Promise<{ name: string }> {
  return (await actor.run(async (ctx) => ctx.db.get(styleId as never))) as {
    name: string;
  };
}

/** The full configureTiming form — omitted values deliberately clear minutes. */
async function configureTiming(
  proof: Proof,
  events: Role,
  eventId: string,
  version: number,
  setupMinutes: number,
): Promise<void> {
  await proof.executeCommand(events, M.Event_configureTiming, {
    docId: eventId,
    version,
    serviceStartsAt: S.startsAt,
    setupMinutes,
    loadMinutes: 60,
    outboundTravelMinutes: 45,
    cleanupMinutes: 60,
    returnTravelMinutes: 40,
    unloadMinutes: 30,
  });
}

function expectTiming(event: TimingSnapshot, setupMinutes: number): void {
  expect(event.stage).toBe("planning");
  expect(event.quotedPrice).toBe(4500);
  expect(event.serviceStartsAt).toBe(S.startsAt);
  expect(event.timingSetupMinutes).toBe(setupMinutes);
  expect(event.timingLoadMinutes).toBe(60);
  expect(event.timingOutboundTravelMinutes).toBe(45);
  expect(event.timingCleanupMinutes).toBe(60);
  expect(event.timingReturnTravelMinutes).toBe(40);
  expect(event.timingUnloadMinutes).toBe(30);
}

describe("runtime proof: Event timing inputs stay put under catalog edits", () => {
  it("catalog service-style rename leaves the stored timing inputs", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-timing-catalog-revise";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, styleId } = await createEventWithStyle(
      proof,
      tenantId,
      "Timing inputs hold under catalog revise",
    );

    await configureTiming(proof, events, eventId, 1, 180);

    const before = await readEvent(events, eventId);
    expectTiming(before, 180);
    expect(before.serviceStyleId).toBe(styleId);
    expect(typeof before.timingConfiguredAt).toBe("number");

    await proof.executeCommand(events, M.ServiceStyle_reviseDetails, {
      docId: styleId,
      name: "Full Service RENAMED",
    });

    const catalog = await readStyle(events, styleId);
    expect(catalog.name).toBe("Full Service RENAMED");

    const after = await readEvent(events, eventId);
    expect(after.serviceStyleId).toBe(styleId);
    expectTiming(after, 180);
  });

  it("an explicit configureTiming writes a new snapshot and a later catalog rename leaves it", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-timing-reconfigure";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, styleId } = await createEventWithStyle(
      proof,
      tenantId,
      "Explicit configure timing writes a snapshot",
    );

    await configureTiming(proof, events, eventId, 1, 180);
    const seeded = await readEvent(events, eventId);
    expect(seeded.timingSetupMinutes).toBe(180);

    await configureTiming(proof, events, eventId, seeded.version, 90);

    const changed = await readEvent(events, eventId);
    expectTiming(changed, 90);
    expect(typeof changed.timingConfiguredAt).toBe("number");

    await proof.executeCommand(events, M.ServiceStyle_reviseDetails, {
      docId: styleId,
      name: "Full Service RENAMED 2",
    });

    const catalog = await readStyle(events, styleId);
    expect(catalog.name).toBe("Full Service RENAMED 2");

    const after = await readEvent(events, eventId);
    expect(after.serviceStyleId).toBe(styleId);
    expectTiming(after, 90);
  });
});
