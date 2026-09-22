/**
 * Runtime proof: Event.cancel covers every allowed stage, refuses
 * completed/closed_out, rejects illegal skips (AC-226), and neither
 * sales_lock → executing command freezes on unfinished ops work.
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

type EventRoles = { sales: Role; events: Role; logistics: Role };

function rolesFor(proof: Proof, tenantId: string): EventRoles {
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
    logistics: proof.asRole({
      subject: `logistics-${tenantId}`,
      role: "logistics_manager",
      tenantId,
    }),
  };
}

async function createEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<string> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Lifecycle proof client ${tenantId} ${title}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Lifecycle",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return event.docId;
}

const LADDER = [
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "closed_out",
] as const;
type LadderStage = (typeof LADDER)[number];

/** Walks a fresh event to the named stage via public lifecycle commands.
 * Returns the event's version there (the optimistic-concurrency value the
 * next write must pass). */
async function walkToStage(
  proof: Proof,
  tenantId: string,
  target: LadderStage,
  title: string,
): Promise<{ eventId: string; version: number }> {
  const { sales, events } = rolesFor(proof, tenantId);
  const eventId = await createEvent(proof, tenantId, title);
  // steps[i] moves the event from version i+1 to version i+2.
  const steps: Array<(v: number) => Promise<unknown>> = [
    (v) =>
      proof.executeCommand(events, api.mutations.Event_submitForApproval, {
        docId: eventId,
        version: v,
      }),
    (v) =>
      proof.executeCommand(events, api.mutations.Event_approve, {
        docId: eventId,
        version: v,
      }),
    (v) =>
      proof.executeCommand(sales, api.mutations.Event_lockForSales, {
        docId: eventId,
        version: v,
      }),
    (v) =>
      proof.executeCommand(events, api.mutations.Event_beginExecution, {
        docId: eventId,
        version: v,
      }),
    (v) =>
      proof.executeCommand(events, api.mutations.Event_finalizeEvent, {
        docId: eventId,
        version: v,
      }),
    (v) =>
      proof.executeCommand(events, api.mutations.Event_complete, {
        docId: eventId,
        version: v,
      }),
    (v) =>
      proof.executeCommand(events, api.mutations.Event_closeOut, {
        docId: eventId,
        version: v,
      }),
  ];
  let version = 1;
  for (const [i, step] of steps.entries()) {
    if (LADDER.indexOf(target) < i + 1) break;
    await step(version);
    version = i + 2;
  }
  return { eventId, version };
}

/** Moves the approve-created draft pack list to `packing` and proves it. */
async function startPackingOnApproveList(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const { logistics } = rolesFor(proof, tenantId);
  const rows = await logistics.run(async (ctx) =>
    (await ctx.db.query("packLists").collect()).filter(
      (row) =>
        (row as { eventId?: string }).eventId === eventId &&
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { status?: string }).status === "draft",
    ),
  );
  const pack = rows[0] as { _id: string; version: number } | undefined;
  expect(pack).toBeDefined();
  await proof.executeCommand(logistics, api.mutations.PackList_startPacking, {
    docId: pack!._id,
    version: pack!.version,
  });
  const packing = (await logistics.run(async (ctx) =>
    ctx.db.get(pack!._id as never),
  )) as { status: string };
  expect(packing.status).toBe("packing");
}

/** Walks to `stage`, proves finalizeEvent is refused there (AC-226), and
 * proves the refusal wrote nothing: same stage, same version. */
async function expectFinalizeRefused(
  proof: Proof,
  tenantId: string,
  stage: "approved" | "completed",
): Promise<void> {
  const { events } = rolesFor(proof, tenantId);
  const { eventId, version } = await walkToStage(
    proof,
    tenantId,
    stage,
    `Skip from ${stage}`,
  );
  await expect(
    proof.executeCommand(events, api.mutations.Event_finalizeEvent, {
      docId: eventId,
      version,
    }),
  ).rejects.toThrow(/Guard|Invalid state transition/);
  const row = (await events.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as { stage: string; version: number };
  expect(row.stage).toBe(stage);
  expect(row.version).toBe(version);
}

describe("runtime proof: Event lifecycle meanings", () => {
  it("cancels from every stage the transition table allows, including quote, sales_lock, and final", async () => {
    const proof = harness();
    const stages: Array<LadderStage | "quote"> = [
      "quote",
      "planning",
      "pending_approval",
      "approved",
      "sales_lock",
      "executing",
      "final",
    ];

    for (const stage of stages) {
      const tenantId = `tenant-cancel-${stage}`;
      const { events } = rolesFor(proof, tenantId);
      let version: number;
      let eventId: string;
      if (stage === "quote") {
        // No public command creates a quote-stage event; place it on the
        // stage directly and change nothing else.
        eventId = await createEvent(proof, tenantId, `Cancel quote ${stage}`);
        await events.run(async (ctx) =>
          ctx.db.patch(eventId as never, { stage: "quote" }),
        );
        version = 1;
      } else {
        const walked = await walkToStage(
          proof,
          tenantId,
          stage,
          `Cancel at ${stage}`,
        );
        eventId = walked.eventId;
        version = walked.version;
      }

      const reason = `Cancelled from ${stage}`;
      await proof.executeCommand(events, api.mutations.Event_cancel, {
        docId: eventId,
        version,
        reason,
      });

      const row = (await events.run(async (ctx) =>
        ctx.db.get(eventId as never),
      )) as {
        stage: string;
        cancellationReason: string;
        cancelledAt: number | null;
      };
      expect(row.stage).toBe("cancelled");
      expect(row.cancellationReason).toBe(reason);
      expect(row.cancelledAt).toEqual(expect.any(Number));
    }
  });

  it("refuses cancel at completed and closed_out, leaving the row and its version untouched", async () => {
    const proof = harness();
    for (const stage of ["completed", "closed_out"] as const) {
      const tenantId = `tenant-cancel-refused-${stage}`;
      const { events } = rolesFor(proof, tenantId);
      const { eventId, version } = await walkToStage(
        proof,
        tenantId,
        stage,
        `Refuse cancel at ${stage}`,
      );

      await expect(
        proof.executeCommand(events, api.mutations.Event_cancel, {
          docId: eventId,
          version,
          reason: `Should not cancel at ${stage}`,
        }),
      ).rejects.toThrow(/Guard|Invalid state transition/);

      const row = (await events.run(async (ctx) =>
        ctx.db.get(eventId as never),
      )) as { stage: string; cancelledAt: number | null; version: number };
      expect(row.stage).toBe(stage);
      expect(row.cancelledAt == null).toBe(true);
      expect(row.version).toBe(version);
    }
  });

  it("rejects illegal finalizeEvent skips (AC-226): approved→final and completed→final with zero writes", async () => {
    const proof = harness();
    await expectFinalizeRefused(proof, "tenant-skip-approved", "approved");
    await expectFinalizeRefused(proof, "tenant-skip-completed", "completed");
  });

  it("beginExecution succeeds from sales_lock with packing still in progress", async () => {
    const proof = harness();
    const tenantId = "tenant-begin-unfinished-pack";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Begin execution with unfinished packing",
    );

    await startPackingOnApproveList(proof, tenantId, eventId);
    await proof.executeCommand(events, api.mutations.Event_beginExecution, {
      docId: eventId,
      version,
    });
    const row = (await events.run(async (ctx) =>
      ctx.db.get(eventId as never),
    )) as { stage: string };
    expect(row.stage).toBe("executing");
  });

  it("confirmSalesLock succeeds from sales_lock with packing still in progress", async () => {
    const proof = harness();
    const tenantId = "tenant-confirm-unfinished-pack";
    const { sales, events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Confirm sales lock with unfinished packing",
    );

    await startPackingOnApproveList(proof, tenantId, eventId);
    await proof.executeCommand(sales, api.mutations.Event_confirmSalesLock, {
      docId: eventId,
      version,
    });
    const row = (await events.run(async (ctx) =>
      ctx.db.get(eventId as never),
    )) as { stage: string };
    expect(row.stage).toBe("executing");
  });
});
