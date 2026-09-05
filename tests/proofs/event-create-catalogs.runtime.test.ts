/**
 * Runtime proof: event create survives empty reference catalogs and persists
 * populated ones (plan B3 / AC-016).
 *
 * The event spine must never dead-end on an empty dropdown (spec
 * dropdown-lists-and-their-admin-screen.md): with zero ServiceStyle/Occasion
 * rows the operator still books the event (planEngagement takes optional ids,
 * so null is accepted), and once an admin registers catalog rows the ids
 * persist on the event and resolve back to those rows — the exact data the
 * create-page selectors and the event detail nameOf lookup read.
 *
 * One tenant walks both states in order: empty first, then populated after
 * ServiceStyle_createViaRegister / Occasion_createViaRegister — the same
 * generated commands the /admin/catalogs page (B1) wires.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-event-create-catalogs-b3",
  startsAt: Date.UTC(2026, 8, 30, 16, 0),
  endsAt: Date.UTC(2026, 8, 30, 23, 0),
} as const;

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

async function liveRows(
  ctx: {
    db: { query: (table: string) => { collect: () => Promise<unknown[]> } };
  },
  table: string,
) {
  return (await ctx.db.query(table).collect()).filter(
    (row) => (row as { deletedAt?: number | null }).deletedAt == null,
  );
}

describe("runtime proof: event create with empty and populated catalogs (AC-016)", () => {
  it("create with empty and populated catalogs", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-event-create-catalogs-b3",
      role: "owner",
      tenantId: S.tenantId,
    });

    // --- (a) Empty catalogs: zero rows, null ids accepted -----------------
    expect(
      await owner.run(async (ctx) => liveRows(ctx, "serviceStyles")),
    ).toHaveLength(0);
    expect(
      await owner.run(async (ctx) => liveRows(ctx, "occasions")),
    ).toHaveLength(0);

    const bareClient = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Empty-catalog client",
      },
    )) as { docId: string };

    // planEngagement with no serviceStyleId/occasionId — the exact command
    // the create page runs when both selectors show their empty state (B2).
    const bareEvent = (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: bareClient.docId,
        title: "Barn dinner before catalogs exist",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 60,
        primaryContactName: "Pat Planner",
        budgetAmount: 3000,
        quotedPrice: 3600,
      },
    )) as { docId: string };
    expect(bareEvent.docId).toBeTruthy();

    const bare = (await owner.run(async (ctx) =>
      ctx.db.get(bareEvent.docId),
    )) as {
      serviceStyleId: string | null;
      occasionId: string | null;
      deletedAt: number | null;
      plannedAt: number | null;
    };
    // The event exists, is planned, and carries null catalog ids — no throw,
    // no silent blank, no crash.
    expect(bare.deletedAt ?? null).toBeNull();
    expect(bare.plannedAt).toEqual(expect.any(Number));
    expect(bare.serviceStyleId ?? null).toBeNull();
    expect(bare.occasionId ?? null).toBeNull();

    // --- (b) Populated catalogs: ids persist and resolve ------------------
    const style = (await proof.executeCommand(
      owner,
      api.mutations.ServiceStyle_createViaRegister,
      {
        name: "Full Service",
        code: "FULL_SERVICE",
        sortOrder: 10,
        description: "Staffed buffet and plated service",
      },
    )) as { docId: string };
    const occasion = (await proof.executeCommand(
      owner,
      api.mutations.Occasion_createViaRegister,
      {
        name: "Wedding",
        code: "WEDDING",
        sortOrder: 5,
        description: "Wedding reception",
      },
    )) as { docId: string };
    expect(
      await owner.run(async (ctx) => liveRows(ctx, "serviceStyles")),
    ).toHaveLength(1);
    expect(
      await owner.run(async (ctx) => liveRows(ctx, "occasions")),
    ).toHaveLength(1);

    const bookedClient = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Populated-catalog client",
      },
    )) as { docId: string };

    const bookedEvent = (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: bookedClient.docId,
        title: "Orchard wedding",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 90,
        primaryContactName: "Robin Planner",
        budgetAmount: 9000,
        quotedPrice: 10500,
        serviceStyleId: style.docId,
        occasionId: occasion.docId,
      },
    )) as { docId: string };

    const booked = (await owner.run(async (ctx) =>
      ctx.db.get(bookedEvent.docId),
    )) as {
      serviceStyleId: string | null;
      occasionId: string | null;
      clientId: string | null;
    };
    // The typed ids persist on the event — not text copies.
    expect(booked.serviceStyleId).toBe(style.docId);
    expect(booked.occasionId).toBe(occasion.docId);
    expect(booked.clientId).toBe(bookedClient.docId);

    // And they resolve: each id maps back to the live catalog row it came
    // from (the lookup EventDetailsCard.nameOf performs).
    const styleRow = (await owner.run(async (ctx) =>
      ctx.db.get(style.docId),
    )) as {
      name: string;
      code: string;
      status: string;
      deletedAt: number | null;
    };
    expect(styleRow.name).toBe("Full Service");
    expect(styleRow.code).toBe("FULL_SERVICE");
    expect(styleRow.status).toBe("active");
    expect(styleRow.deletedAt ?? null).toBeNull();

    const occasionRow = (await owner.run(async (ctx) =>
      ctx.db.get(occasion.docId),
    )) as {
      name: string;
      code: string;
      status: string;
      deletedAt: number | null;
    };
    expect(occasionRow.name).toBe("Wedding");
    expect(occasionRow.code).toBe("WEDDING");
    expect(occasionRow.status).toBe("active");
    expect(occasionRow.deletedAt ?? null).toBeNull();

    // Two live events: the empty-catalog booking kept its null ids after the
    // catalogs were populated (no backfill, no cross-contamination). Table
    // order is unspecified, so assert by membership, not position.
    const events = await owner.run(async (ctx) => liveRows(ctx, "events"));
    expect(events).toHaveLength(2);
    const ids = events.map(
      (row) =>
        (row as { serviceStyleId?: string | null }).serviceStyleId ?? null,
    );
    expect(ids.filter((id) => id === null)).toHaveLength(1);
    expect(ids.filter((id) => id === style.docId)).toHaveLength(1);
  });
});
