/**
 * Runtime proof (AC-399 planning slice): an Event on `planning` or
 * `pending_approval` creates NO automatic operational downstream rows — no
 * invoice, no pack list, no purchase need, no staff need. Materialization is
 * EventApproved-gated, so the control case walks to approved and sees exactly
 * one draft pack list and one draft invoice appear.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 19, 17, 0),
  endsAt: Date.UTC(2026, 9, 19, 22, 0),
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
): { sales: Role; events: Role; logistics: Role } {
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
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Planning provisional client ${tenantId} ${title}`,
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
      primaryContactName: "Casey Planning",
      budgetAmount: 3200,
      quotedPrice: 4800,
    },
  )) as { docId: string };
  return event.docId;
}

/** Live (deletedAt == null) rows for one event in one table. */
async function liveRowsFor(
  reader: Role,
  table: "invoices" | "packLists" | "purchaseNeeds" | "eventStaffNeeds",
  eventId: string,
): Promise<Array<Record<string, unknown>>> {
  return (await reader.run(async (ctx) =>
    ctx.db.query(table).collect(),
  )) as Array<Record<string, unknown>>;
}

function rowsForEvent(
  rows: Array<Record<string, unknown>>,
  eventId: string,
): Array<Record<string, unknown>> {
  return rows.filter(
    (row) =>
      (row as { deletedAt?: number | null }).deletedAt == null &&
      (row as { eventId?: string }).eventId === eventId,
  );
}

async function readEventStage(actor: Role, eventId: string): Promise<string> {
  const row = (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as { stage: string };
  return row.stage;
}

const DOWNSTREAM_TABLES = [
  "invoices",
  "packLists",
  "purchaseNeeds",
  "eventStaffNeeds",
] as const;

describe("runtime proof: planning and pending_approval keep downstream drafts empty (AC-399 planning slice)", () => {
  it("a fresh planning event has zero invoices, pack lists, purchase needs, and staff needs", async () => {
    const proof = harness();
    const tenantId = "tenant-planning-provisional";
    const { logistics } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Planning stays provisional",
    );

    expect(await readEventStage(logistics, eventId)).toBe("planning");

    for (const table of DOWNSTREAM_TABLES) {
      const rows = rowsForEvent(
        await liveRowsFor(logistics, table, eventId),
        eventId,
      );
      expect(rows).toHaveLength(0);
    }
  });

  it("pending_approval still has zero invoices, pack lists, purchase needs, and staff needs", async () => {
    const proof = harness();
    const tenantId = "tenant-pending-approval-provisional";
    const { events, logistics } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Pending approval invents nothing",
    );

    // Walk planning → pending_approval via the public command; create is
    // version 1, each lifecycle command bumps it by one.
    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventId,
      version: 1,
    });

    expect(await readEventStage(logistics, eventId)).toBe("pending_approval");

    for (const table of DOWNSTREAM_TABLES) {
      const rows = rowsForEvent(
        await liveRowsFor(logistics, table, eventId),
        eventId,
      );
      expect(rows).toHaveLength(0);
    }
  });

  it("approve then ensures one draft invoice and one pack list (control)", async () => {
    const proof = harness();
    const tenantId = "tenant-planning-control-approved";
    const { events, logistics } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Approve materializes the planning control",
    );

    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventId,
      version: 1,
    });
    await proof.executeCommand(events, M.Event_approve, {
      docId: eventId,
      version: 2,
    });

    expect(await readEventStage(logistics, eventId)).toBe("approved");

    const packLists = rowsForEvent(
      await liveRowsFor(logistics, "packLists", eventId),
      eventId,
    );
    expect(packLists).toHaveLength(1);
    expect((packLists[0] as { status?: string }).status).toBe("draft");

    const invoices = rowsForEvent(
      await liveRowsFor(logistics, "invoices", eventId),
      eventId,
    );
    expect(invoices).toHaveLength(1);
    const invoice = invoices[0] as {
      status?: string;
      sentAt?: number | null;
    };
    expect(invoice.status).toBe("draft");
    expect(invoice.sentAt == null).toBe(true);

    // The other two counters must also be readable on the same path, so the
    // zero counts in the earlier cases are not a blind spot in the harness.
    expect(
      rowsForEvent(
        await liveRowsFor(logistics, "purchaseNeeds", eventId),
        eventId,
      ),
    ).toHaveLength(0);
    expect(
      rowsForEvent(
        await liveRowsFor(logistics, "eventStaffNeeds", eventId),
        eventId,
      ),
    ).toHaveLength(0);
  });
});
