/**
 * Runtime proof (AC-399 quote slice): an Event parked on `quote` creates NO
 * automatic operational downstream rows — no invoice, no pack list, no
 * purchase need, no staff need. Materialization is EventApproved-gated, so
 * the control case walks to approved and sees exactly one draft invoice and
 * one draft pack list appear.
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
      companyName: `Quote zero-downstream client ${tenantId} ${title}`,
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
      primaryContactName: "Casey Quote",
      budgetAmount: 3000,
      quotedPrice: 4500,
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

describe("runtime proof: quote stage creates no automatic downstream work (AC-399 quote slice)", () => {
  it("quote stage has zero invoices, pack lists, purchase needs, and staff needs", async () => {
    const proof = harness();
    const tenantId = "tenant-quote-zero-downstream";
    const { events, logistics } = rolesFor(proof, tenantId);
    const eventId = await createEvent(proof, tenantId, "Quote holds the line");
    // No public command creates a quote-stage event; place it on the
    // stage directly and change nothing else.
    await events.run(async (ctx) =>
      ctx.db.patch(eventId as never, { stage: "quote" }),
    );

    expect(await readEventStage(logistics, eventId)).toBe("quote");

    for (const table of [
      "invoices",
      "packLists",
      "purchaseNeeds",
      "eventStaffNeeds",
    ] as const) {
      const rows = rowsForEvent(
        await liveRowsFor(logistics, table, eventId),
        eventId,
      );
      expect(rows).toHaveLength(0);
    }
  });

  it("approve then ensures one draft invoice and one pack list (control)", async () => {
    const proof = harness();
    const tenantId = "tenant-quote-control-approved";
    const { events, logistics } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Approve materializes the control",
    );

    // Walk planning → pending_approval → approved via public commands;
    // create is version 1, each lifecycle command bumps it by one.
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
    // zero counts in the quote case are not a blind spot in the harness.
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
