/**
 * Runtime proof (AC-236): the Event's venue fields are a snapshot of the
 * catalog Venue, not a live link. Revising the catalog Venue later (rename,
 * address, capacity) must NOT rewrite the Event's venueName / venueAddress /
 * venueCapacity, while an explicit Event_changeVenue still updates them —
 * refusal-to-cascade is a snapshot, not a freeze.
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

/** Venue Garden Hall + client + Event carrying the venue snapshot fields. */
async function createEventWithVenue(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; venueId: string; version: number }> {
  const { sales, events } = rolesFor(proof, tenantId);
  const venue = (await proof.executeCommand(events, M.Venue_createViaRegister, {
    name: "Garden Hall",
    venueType: "other",
    capacity: 80,
    addressLine1: "100 Oak St",
  })) as { docId: string };
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Snapshot client ${tenantId}`,
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
      venueId: venue.docId,
      venueName: "Garden Hall",
      venueAddress: "100 Oak St",
      venueCapacity: 80,
    },
  )) as { docId: string };
  return { eventId: event.docId, venueId: venue.docId, version: 1 };
}

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{
  stage: string;
  version: number;
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueCapacity: number | null;
  quotedPrice: number;
  budgetAmount: number;
}> {
  return (await actor.run(async (ctx) => ctx.db.get(eventId as never))) as {
    stage: string;
    version: number;
    venueId: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venueCapacity: number | null;
    quotedPrice: number;
    budgetAmount: number;
  };
}

async function readVenue(
  actor: Role,
  venueId: string,
): Promise<{ name: string; capacity: number }> {
  return (await actor.run(async (ctx) => ctx.db.get(venueId as never))) as {
    name: string;
    capacity: number;
  };
}

describe("runtime proof: Event venue snapshot stays put under catalog edits", () => {
  it("catalog venue rename and capacity change leave event snapshot", async () => {
    const proof = harness();
    const tenantId = "tenant-ac236-catalog-revise";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, venueId } = await createEventWithVenue(
      proof,
      tenantId,
      "Snapshot holds under catalog revise",
    );

    const before = await readEvent(events, eventId);
    expect(before.venueId).toBe(venueId);
    expect(before.venueName).toBe("Garden Hall");
    expect(before.venueAddress).toBe("100 Oak St");
    expect(before.venueCapacity).toBe(80);
    expect(before.stage).toBe("planning");
    expect(before.quotedPrice).toBe(4500);

    await proof.executeCommand(events, M.Venue_updateDetails, {
      docId: venueId,
      name: "Garden Hall RENAMED",
      venueType: "other",
      addressLine1: "999 Pine Ave",
    });
    await proof.executeCommand(events, M.Venue_changeCapacity, {
      docId: venueId,
      capacity: 200,
    });

    const catalog = await readVenue(events, venueId);
    expect(catalog.name).toBe("Garden Hall RENAMED");
    expect(catalog.capacity).toBe(200);

    const after = await readEvent(events, eventId);
    expect(after.venueId).toBe(venueId);
    expect(after.venueName).toBe("Garden Hall");
    expect(after.venueAddress).toBe("100 Oak St");
    expect(after.venueCapacity).toBe(80);
    expect(after.quotedPrice).toBe(4500);
    expect(after.budgetAmount).toBe(3000);
    expect(after.stage).toBe("planning");
    expect(after.version).toBe(before.version);
  });

  it("explicit Event_changeVenue still updates the snapshot", async () => {
    const proof = harness();
    const tenantId = "tenant-ac236-explicit-change";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, venueId } = await createEventWithVenue(
      proof,
      tenantId,
      "Explicit change venue writes snapshot",
    );

    await proof.executeCommand(events, M.Event_changeVenue, {
      docId: eventId,
      venueId,
      venueName: "Lakeside Pavilion",
      venueAddress: "12 Water Rd",
      venueCapacity: 120,
    });

    const changed = await readEvent(events, eventId);
    expect(changed.venueName).toBe("Lakeside Pavilion");
    expect(changed.venueAddress).toBe("12 Water Rd");
    expect(changed.venueCapacity).toBe(120);

    await proof.executeCommand(events, M.Venue_updateDetails, {
      docId: venueId,
      name: "IGNORED CATALOG NAME",
      venueType: "other",
    });
    await proof.executeCommand(events, M.Venue_changeCapacity, {
      docId: venueId,
      capacity: 999,
    });

    const catalog = await readVenue(events, venueId);
    expect(catalog.name).toBe("IGNORED CATALOG NAME");
    expect(catalog.capacity).toBe(999);

    const after = await readEvent(events, eventId);
    expect(after.venueId).toBe(venueId);
    expect(after.venueName).toBe("Lakeside Pavilion");
    expect(after.venueAddress).toBe("12 Water Rd");
    expect(after.venueCapacity).toBe(120);
  });
});
