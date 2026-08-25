/**
 * DX proof: TPP event report bundle → governed commands → persisted event.
 *
 * Covers the acceptance criteria for entering an event from documents without
 * the UI: capability commands only, the same guards as the UI, a preview that
 * writes nothing, a refusal while warnings stand, and a safe re-run.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import type {
  CapsuleCommandExecutor,
  CapsuleCommandInvocation,
} from "../../src/agent/CapsuleCommandExecutor";
import { CapsuleEventBundleCoordinator } from "../../src/agent/CapsuleEventBundleCoordinator";
import { loadEventBundle } from "../../src/lib/tppReports/loadEventBundle";
import { modules } from "./convex-test-modules";

const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/agent/tpp-event", import.meta.url),
);
const TENANT_ID = "tenant-tpp-bundle";

function readBundle() {
  const files = readdirSync(FIXTURE_DIR).map((name) => ({
    name,
    contents: readFileSync(join(FIXTURE_DIR, name)),
  }));
  return loadEventBundle(files);
}

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type ProofHarness = ReturnType<typeof harness>;
type RoleSession = ReturnType<ProofHarness["asRole"]>;

/** Runs each planned command through the same generated mutations as the UI. */
class ProofCommandExecutor implements CapsuleCommandExecutor {
  private readonly catalog = new CapsuleCommandCatalog();
  readonly calls: string[] = [];

  constructor(
    private readonly proof: ProofHarness,
    private readonly session: RoleSession,
  ) {}

  async execute(invocation: CapsuleCommandInvocation): Promise<unknown> {
    const descriptor = this.catalog.get(invocation.capabilityId);
    const mutationTable = api.mutations as unknown as Record<string, unknown>;
    const mutation = mutationTable[descriptor.mutationName];
    if (!mutation) {
      throw new Error(`Missing mutation ${descriptor.mutationName}`);
    }
    this.calls.push(invocation.capabilityId);
    return this.proof.executeCommand(
      this.session,
      mutation as never,
      {
        ...invocation.args,
        ...(invocation.idempotencyKey
          ? { idempotencyKey: invocation.idempotencyKey }
          : {}),
      } as Record<string, unknown>,
    );
  }
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: TPP event bundle → governed commands", () => {
  it("reads every report shape in the fixture bundle", () => {
    const { bundle, recognized, unrecognized } = readBundle();

    expect(unrecognized).toEqual([]);
    expect(recognized.map((entry) => entry.source).sort()).toEqual([
      "eventWorksheet",
      "packList",
      "productionWorksheet",
      "proposal",
    ]);
    expect(bundle.header.invoiceNumber).toBe("7001");
    expect(bundle.header.eventDate).toBe("2026-09-12");
    expect(bundle.header.guestCount).toBe(40);
    expect(bundle.client.email).toBe("sample.client@example.com");
    expect(bundle.venue.name).toBe("Sample Hall");
    expect(bundle.menu).toHaveLength(2);
    expect(bundle.prepTasks.length).toBeGreaterThan(0);
    expect(bundle.totals.eventTotalCents).toBe(72_080);
    expect(bundle.otherContacts.length).toBeGreaterThan(0);
    expect(bundle.payments).toHaveLength(1);
    expect(bundle.payments[0]?.amountCents).toBe(20_000);
  });

  it("previews without writing, then enters through capability commands", async () => {
    const proof = harness();
    const admin = proof.asRole({
      subject: "agent-tpp-bundle",
      role: "admin",
      tenantId: TENANT_ID,
    });
    const executor = new ProofCommandExecutor(proof, admin);
    const coordinator = new CapsuleEventBundleCoordinator(executor);
    const { bundle } = readBundle();

    const preview = coordinator.preview(bundle);
    expect(preview.plan.steps.length).toBeGreaterThan(10);
    expect(executor.calls).toEqual([]);

    const events = await admin.run(async (ctx) =>
      ctx.db.query("events").collect(),
    );
    expect(events).toHaveLength(0);

    // The fixture has no start time, so the preview warns. Entering must
    // refuse until that warning is acknowledged.
    expect(preview.plan.warnings.length).toBeGreaterThan(0);
    await expect(coordinator.enter({ bundle })).rejects.toThrow(
      /Refusing to enter/,
    );

    const result = await coordinator.enter({ bundle, acceptWarnings: true });
    expect(result.eventId).toBeTruthy();
    expect(result.executedSteps).toBe(preview.plan.steps.length);

    // Every write went through a governed command, never a table insert.
    expect(new Set(executor.calls)).toEqual(
      new Set([
        "Venue.register",
        "Client.register",
        "Event.planEngagement",
        "EventTimelineActivity.schedule",
        "Dish.introduce",
        "EventDish.addToEvent",
        "PrepTask.open",
        "PackList.open",
        "PackListItem.addItem",
        "ClientContact.add",
        "Proposal.draft",
        "ProposalLineItem.addLine",
        "Invoice.issue",
        "Invoice.setDeposit",
        "Payment.record",
        "Invoice.send",
        "Payment.settle",
        "Proposal.send",
        "Proposal.accept",
      ]),
    );

    const stored = await admin.run(async (ctx) => {
      const event = await ctx.db.get(result.eventId as never);
      const timeline = await ctx.db.query("eventTimelineActivities").collect();
      const eventDishes = await ctx.db.query("eventDishes").collect();
      const prepTasks = await ctx.db.query("prepTasks").collect();
      const packListItems = await ctx.db.query("packListItems").collect();
      const clientContacts = await ctx.db.query("clientContacts").collect();
      const proposals = await ctx.db.query("proposals").collect();
      const proposalLines = await ctx.db.query("proposalLineItems").collect();
      const invoices = await ctx.db.query("invoices").collect();
      const payments = await ctx.db.query("payments").collect();
      return {
        event,
        timeline,
        eventDishes,
        prepTasks,
        packListItems,
        clientContacts,
        proposals,
        proposalLines,
        invoices,
        payments,
      };
    });

    const event = stored.event as {
      title?: string;
      expectedHeadcount?: number;
      quotedPrice?: number;
      budgetAmount?: number;
    } | null;
    expect(event?.title).toBe("Sample Garden Reception");
    expect(event?.expectedHeadcount).toBe(40);
    // Money is stored in dollars, and the bundle carries cents.
    expect(event?.quotedPrice).toBe(720.8);
    // The reports state no client budget, so it stays zero.
    expect(event?.budgetAmount).toBe(0);

    expect(stored.timeline).toHaveLength(3);
    expect(stored.eventDishes).toHaveLength(2);
    expect(stored.prepTasks).toHaveLength(3);
    expect(stored.packListItems).toHaveLength(3);

    // The proposal's money, contacts and payment history land as records.
    expect(stored.clientContacts).toHaveLength(1);
    expect(stored.proposals).toHaveLength(1);
    // The worksheet says "2- Sales Lock": the client signed.
    expect((stored.proposals[0] as { status?: string }).status).toBe(
      "accepted",
    );
    expect(stored.proposalLines).toHaveLength(2);
    const invoice = stored.invoices[0] as {
      invoiceNumber?: string;
      total?: number;
      depositAmount?: number;
      status?: string;
      amountPaid?: number;
    };
    expect(stored.invoices).toHaveLength(1);
    expect(invoice.invoiceNumber).toBe("7001");
    expect(invoice.total).toBe(720.8);
    expect(invoice.depositAmount).toBe(200);
    expect(stored.payments).toHaveLength(1);
    const payment = stored.payments[0] as { amount?: number; status?: string };
    expect(payment.amount).toBe(200);
    // Settling applies the payment to the sent invoice by reaction.
    expect(payment.status).toBe("completed");
    expect(invoice.status).toBe("partial");
    expect(invoice.amountPaid).toBe(200);
  });

  it("attaches to an event that already exists and adds only what is missing", async () => {
    const proof = harness();
    const admin = proof.asRole({
      subject: "agent-tpp-bundle-attach",
      role: "admin",
      tenantId: TENANT_ID,
    });
    const executor = new ProofCommandExecutor(proof, admin);
    const coordinator = new CapsuleEventBundleCoordinator(executor);
    const { bundle } = readBundle();

    const first = await coordinator.enter({ bundle, acceptWarnings: true });

    // Read the tenant back the way the live loader does, from the same tables.
    const context = await admin.run(async (ctx) => {
      const event = (await ctx.db.get(first.eventId as never)) as Record<
        string,
        unknown
      >;
      const dishes = await ctx.db.query("dishes").collect();
      const dishName = (id: unknown) =>
        String(
          (
            dishes.find((row) => String(row._id) === String(id)) as
              { name?: string } | undefined
          )?.name ?? "",
        );
      const eventDishes = await ctx.db.query("eventDishes").collect();
      const prepTasks = await ctx.db.query("prepTasks").collect();
      const packList = (await ctx.db.query("packLists").collect())[0];
      const packListItems = await ctx.db.query("packListItems").collect();
      const invoices = await ctx.db.query("invoices").collect();
      const payments = await ctx.db.query("payments").collect();
      const proposals = await ctx.db.query("proposals").collect();
      const contacts = await ctx.db.query("clientContacts").collect();
      return {
        existing: {
          eventId: first.eventId,
          clientId: String(event.clientId),
          venueId: event.venueId ? String(event.venueId) : undefined,
          event: {
            quotedPrice: Number(event.quotedPrice ?? 0),
            primaryContactName: event.primaryContactName as string,
            primaryContactEmail: event.primaryContactEmail as string | null,
            primaryContactPhone: event.primaryContactPhone as string | null,
            serviceRequirements: event.serviceRequirements as string | null,
            operationalRequirements: event.operationalRequirements as
              string | null,
          },
          client: { email: "sample.client@example.com", phone: null },
          clientContactNames: contacts.map((row) =>
            `${(row as { givenName?: string }).givenName ?? ""} ${(row as { familyName?: string }).familyName ?? ""}`.trim(),
          ),
          eventDishes: eventDishes.map((row) => ({
            id: String(row._id),
            dishName: dishName((row as { dishId?: unknown }).dishId),
            course: (row as { course?: string | null }).course,
          })),
          timelineNames: (
            await ctx.db.query("eventTimelineActivities").collect()
          ).map((row) => String((row as { name?: string }).name ?? "")),
          prepTasks: prepTasks.map((row) => ({
            dishName: dishName(
              eventDishes.find(
                (dish) =>
                  String(dish._id) ===
                  String((row as { eventDishId?: unknown }).eventDishId),
              )?.dishId,
            ),
            name: String((row as { name?: string }).name ?? ""),
          })),
          packList: packList
            ? {
                id: String(packList._id),
                itemDescriptions: packListItems.map((row) =>
                  String((row as { description?: string }).description ?? ""),
                ),
              }
            : undefined,
          assignedPersonIds: [],
        },
        directory: {
          organizationNames: [],
          people: [],
          vendors: [],
          ingredients: [],
          invoices: invoices.map((row) => ({
            id: String(row._id),
            invoiceNumber: String(
              (row as { invoiceNumber?: string }).invoiceNumber ?? "",
            ),
            status: String((row as { status?: string }).status ?? ""),
          })),
          payments: payments.map((row) => ({
            id: String(row._id),
            invoiceId: String((row as { invoiceId?: unknown }).invoiceId),
            amountCents: Math.round(
              Number((row as { amount?: number }).amount ?? 0) * 100,
            ),
            status: String((row as { status?: string }).status ?? ""),
          })),
          proposals: proposals.map((row) => ({
            id: String(row._id),
            proposalNumber: String(
              (row as { proposalNumber?: string }).proposalNumber ?? "",
            ),
            status: String((row as { status?: string }).status ?? ""),
          })),
          vendorOrderNumbers: [],
        },
      };
    });

    const preview = coordinator.preview(bundle, context);
    // Everything the reports carry is already there: no step is planned.
    expect(preview.plan.steps.map((step) => step.capabilityId)).toEqual([]);

    const callsBefore = executor.calls.length;
    const second = await coordinator.enter({
      bundle,
      acceptWarnings: true,
      context,
    });
    expect(second.eventId).toBe(first.eventId);
    expect(second.executedSteps).toBe(0);
    expect(executor.calls.length).toBe(callsBefore);
  });

  it("does not duplicate records when the same bundle is entered twice", async () => {
    const proof = harness();
    const admin = proof.asRole({
      subject: "agent-tpp-bundle-retry",
      role: "admin",
      tenantId: TENANT_ID,
    });
    const coordinator = new CapsuleEventBundleCoordinator(
      new ProofCommandExecutor(proof, admin),
    );
    const { bundle } = readBundle();

    const first = await coordinator.enter({ bundle, acceptWarnings: true });
    const second = await coordinator.enter({ bundle, acceptWarnings: true });

    expect(second.eventId).toBe(first.eventId);
    const counts = await admin.run(async (ctx) => ({
      events: (await ctx.db.query("events").collect()).length,
      eventDishes: (await ctx.db.query("eventDishes").collect()).length,
      prepTasks: (await ctx.db.query("prepTasks").collect()).length,
    }));
    expect(counts.events).toBe(1);
    expect(counts.eventDishes).toBe(2);
    expect(counts.prepTasks).toBe(3);
  });
});
