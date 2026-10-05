/**
 * Runtime proof (AC-227, decided 2026-09-28 in issue #397): lockForSales
 * refuses an event with no name, venue or service style (client, dates and
 * headcount were already required), with a plain message and zero writes.
 * A saved venue / service style or a typed name both count. Later steps do
 * not re-check: a venue cleared at sales_lock still lets service start.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 10, 12, 17, 0),
  endsAt: Date.UTC(2026, 10, 12, 22, 0),
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
type EventRow = {
  stage: string;
  version: number;
  salesLockedAt?: number | null;
};

function rolesFor(proof: Proof, tenantId: string) {
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

/** Plans an event with the given venue/style fields and walks it to
 * approved (version 3). */
async function approvedEvent(
  proof: Proof,
  tenantId: string,
  extra: Record<string, unknown>,
): Promise<string> {
  const { sales, events } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    { clientType: "company", companyName: `Lock client ${tenantId}` },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Harvest dinner",
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Lock",
      budgetAmount: 3000,
      quotedPrice: 4500,
      ...extra,
    } as never,
  )) as { docId: string };
  await proof.executeCommand(events, M.Event_submitForApproval, {
    docId: event.docId,
    version: 1,
  });
  await proof.executeCommand(events, M.Event_approve, {
    docId: event.docId,
    version: 2,
  });
  return event.docId;
}

const read = async (actor: Role, id: string) =>
  (await actor.run(async (ctx) => ctx.db.get(id as never))) as EventRow;

async function expectRefused(
  proof: Proof,
  tenantId: string,
  eventId: string,
  message: RegExp,
) {
  const { sales } = rolesFor(proof, tenantId);
  await expect(
    proof.executeCommand(sales, M.Event_lockForSales, {
      docId: eventId,
      version: 3,
    }),
  ).rejects.toThrow(message);
  const row = await read(sales, eventId);
  expect(row.stage).toBe("approved");
  expect(row.version).toBe(3);
  expect(row.salesLockedAt ?? null).toBeNull();
}

describe("runtime proof: sales lock needs a name, venue and service style (AC-227)", () => {
  it("refuses an event with no venue, with zero writes", async () => {
    const proof = harness();
    const tenantId = "tenant-ac227-no-venue";
    const eventId = await approvedEvent(proof, tenantId, {
      serviceStyleName: "Plated",
    });
    await expectRefused(
      proof,
      tenantId,
      eventId,
      /Pick a venue before you lock this event for sales\./,
    );
  });

  it("refuses a blank venue name and a missing service style", async () => {
    const proof = harness();
    const blankVenue = "tenant-ac227-blank-venue";
    const blankId = await approvedEvent(proof, blankVenue, {
      venueName: "   ",
      serviceStyleName: "Plated",
    });
    await expectRefused(proof, blankVenue, blankId, /Pick a venue/);

    const noStyle = "tenant-ac227-no-style";
    const noStyleId = await approvedEvent(proof, noStyle, {
      venueName: "Old Mill Barn",
    });
    await expectRefused(
      proof,
      noStyle,
      noStyleId,
      /Pick a service style before you lock this event for sales\./,
    );
  });

  it("refuses an event whose name was blanked (for example an import)", async () => {
    const proof = harness();
    const tenantId = "tenant-ac227-no-title";
    const { sales } = rolesFor(proof, tenantId);
    const eventId = await approvedEvent(proof, tenantId, {
      venueName: "Old Mill Barn",
      serviceStyleName: "Plated",
    });
    // planEngagement already refuses a blank title; an imported row can
    // still arrive without one.
    await sales.run(async (ctx) =>
      ctx.db.patch(eventId as never, { title: "  " } as never),
    );
    await expectRefused(
      proof,
      tenantId,
      eventId,
      /Give this event a name before you lock it for sales\./,
    );
  });

  it("a saved venue and style lock; a typed venue and style lock too", async () => {
    const proof = harness();
    const saved = "tenant-ac227-saved";
    const { events, sales } = rolesFor(proof, saved);
    const venue = (await proof.executeCommand(
      events,
      M.Venue_createViaRegister,
      { name: "Old Mill Barn", venueType: "other", capacity: 90 },
    )) as { docId: string };
    const style = (await proof.executeCommand(
      events,
      M.ServiceStyle_createViaRegister,
      { name: "Plated", code: "PLATED_ac227", sortOrder: 10 },
    )) as { docId: string };
    const savedId = await approvedEvent(proof, saved, {
      venueId: venue.docId,
      serviceStyleId: style.docId,
    });
    await proof.executeCommand(sales, M.Event_lockForSales, {
      docId: savedId,
      version: 3,
    });
    expect((await read(sales, savedId)).stage).toBe("sales_lock");

    const typed = "tenant-ac227-typed";
    const typedSales = rolesFor(proof, typed).sales;
    const typedId = await approvedEvent(proof, typed, {
      venueName: "Old Mill Barn",
      serviceStyleName: "Family style",
    });
    await proof.executeCommand(typedSales, M.Event_lockForSales, {
      docId: typedId,
      version: 3,
    });
    expect((await read(typedSales, typedId)).stage).toBe("sales_lock");
  });

  it("later steps do not re-check: a venue cleared at sales_lock still starts service", async () => {
    const proof = harness();
    const tenantId = "tenant-ac227-later";
    const { events, sales } = rolesFor(proof, tenantId);
    const eventId = await approvedEvent(proof, tenantId, {
      venueName: "Old Mill Barn",
      serviceStyleName: "Plated",
    });
    await proof.executeCommand(sales, M.Event_lockForSales, {
      docId: eventId,
      version: 3,
    });
    // The venue fell through after the lock.
    await proof.executeCommand(events, M.Event_changeVenue, {
      docId: eventId,
      version: 4,
    });
    await proof.executeCommand(events, M.Event_beginExecution, {
      docId: eventId,
      version: 5,
    });
    expect((await read(events, eventId)).stage).toBe("executing");
  });
});
