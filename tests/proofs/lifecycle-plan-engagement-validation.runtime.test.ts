/**
 * Runtime proof (AC-237 / CF-4-1-validation-trusted-context): plan-engagement
 * validation refuses bad input with ZERO writes. An inverted date range and an
 * out-of-range headcount write no Event row at all, and a valid create still
 * succeeds — proving refusal is the constraint, not a broken harness. The same
 * constraints hold on the edit commands: an inverted reschedule and a zero
 * headcount leave the row untouched, while a valid edit still lands.
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

function rolesFor(proof: Proof, tenantId: string): { sales: Role } {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
  };
}

async function liveEventCount(actor: Role): Promise<number> {
  return await actor.run(
    async (ctx) =>
      (await ctx.db.query("events").collect()).filter(
        (row: { deletedAt?: number | null }) => row.deletedAt == null,
      ).length,
  );
}

async function createEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<string> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Plan engagement validation client ${tenantId} ${title}`,
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
      primaryContactName: "Casey PlanValidation",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return event.docId;
}

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{
  stage: string;
  version: number;
  expectedHeadcount: number;
  startsAt: number;
  endsAt: number;
}> {
  return (await actor.run(async (ctx) => ctx.db.get(eventId as never))) as {
    stage: string;
    version: number;
    expectedHeadcount: number;
    startsAt: number;
    endsAt: number;
  };
}

describe("runtime proof: plan-engagement validation refuses bad dates and headcounts with zero writes", () => {
  it("inverted dates on create write nothing", async () => {
    const proof = harness();
    const tenantId = "tenant-ac237-dates";
    const { sales } = rolesFor(proof, tenantId);
    const client = (await proof.executeCommand(
      sales,
      M.Client_createViaRegister,
      {
        clientType: "company",
        companyName: `Inverted dates client ${tenantId}`,
      },
    )) as { docId: string };

    await expect(
      proof.executeCommand(sales, M.Event_createViaPlanEngagement, {
        clientId: client.docId,
        title: "Inverted dates refused",
        eventType: "corporate dinner",
        startsAt: S.endsAt,
        endsAt: S.startsAt,
        expectedHeadcount: 40,
        primaryContactName: "Casey InvertedDates",
        budgetAmount: 3000,
        quotedPrice: 4500,
      }),
    ).rejects.toThrow(/Event end must be after its start/);

    expect(await liveEventCount(sales)).toBe(0);
  });

  it("headcount 0 and 100001 on create write nothing", async () => {
    const proof = harness();
    const tenantId = "tenant-ac237-headcount";
    const { sales } = rolesFor(proof, tenantId);
    const client = (await proof.executeCommand(
      sales,
      M.Client_createViaRegister,
      {
        clientType: "company",
        companyName: `Headcount bounds client ${tenantId}`,
      },
    )) as { docId: string };

    await expect(
      proof.executeCommand(sales, M.Event_createViaPlanEngagement, {
        clientId: client.docId,
        title: "Headcount zero refused",
        eventType: "corporate dinner",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 0,
        primaryContactName: "Casey HeadcountZero",
        budgetAmount: 3000,
        quotedPrice: 4500,
      }),
    ).rejects.toThrow(/Headcount must be between 1 and 100000/);

    await expect(
      proof.executeCommand(sales, M.Event_createViaPlanEngagement, {
        clientId: client.docId,
        title: "Headcount over max refused",
        eventType: "corporate dinner",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 100001,
        primaryContactName: "Casey HeadcountMax",
        budgetAmount: 3000,
        quotedPrice: 4500,
      }),
    ).rejects.toThrow(/Headcount must be between 1 and 100000/);

    expect(await liveEventCount(sales)).toBe(0);
  });

  it("valid create succeeds; inverted reschedule and headcount 0 still refuse", async () => {
    const proof = harness();
    const tenantId = "tenant-ac237-valid-edit";
    const { sales } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Valid create then refusals",
    );

    const created = await readEvent(sales, eventId);
    expect(created.stage).toBe("planning");
    expect(created.expectedHeadcount).toBe(40);
    expect(created.startsAt).toBe(S.startsAt);
    expect(created.endsAt).toBe(S.endsAt);
    expect(created.version).toBe(1);

    await expect(
      proof.executeCommand(sales, M.Event_reschedule, {
        docId: eventId,
        startsAt: S.endsAt,
        endsAt: S.startsAt,
      }),
    ).rejects.toThrow(/Event end must be after its start/);

    const afterRescheduleRefusal = await readEvent(sales, eventId);
    expect(afterRescheduleRefusal.startsAt).toBe(S.startsAt);
    expect(afterRescheduleRefusal.endsAt).toBe(S.endsAt);
    expect(afterRescheduleRefusal.expectedHeadcount).toBe(40);
    expect(afterRescheduleRefusal.version).toBe(1);

    await expect(
      proof.executeCommand(sales, M.Event_changeHeadcount, {
        docId: eventId,
        version: 1,
        newHeadcount: 0,
      }),
    ).rejects.toThrow(/Headcount must be between 1 and 100000/);

    const afterHeadcountRefusal = await readEvent(sales, eventId);
    expect(afterHeadcountRefusal.expectedHeadcount).toBe(40);
    expect(afterHeadcountRefusal.version).toBe(1);

    await proof.executeCommand(sales, M.Event_changeHeadcount, {
      docId: eventId,
      version: 1,
      newHeadcount: 55,
    });

    const afterValidEdit = await readEvent(sales, eventId);
    expect(afterValidEdit.expectedHeadcount).toBe(55);
    expect(afterValidEdit.version).toBe(2);
  });
});
