/**
 * AC-424 isolation-proof harness: roles, the planned-event / timing /
 * purchase-need seeds, and read helpers. Assertion-free.
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import type { ReconciliationReceiptOutput } from "../../convex/lib/reconciliationReceipt";
import { modules } from "./convex-test-modules";

export const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;

export function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

export type Proof = ReturnType<typeof harness>;
export type Role = ReturnType<Proof["asRole"]>;

export function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role; kitchen: Role; inventory: Role } {
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
    kitchen: proof.asRole({
      subject: `kitchen-${tenantId}`,
      role: "kitchen_manager",
      tenantId,
    }),
    inventory: proof.asRole({
      subject: `inventory-${tenantId}`,
      role: "inventory_staff",
      tenantId,
    }),
  };
}

/** Company client + planned Event via the sales role. */
export async function createPlannedEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; clientId: string }> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Isolation client ${tenantId}`,
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
      primaryContactName: "Casey Isolation",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return { eventId: event.docId, clientId: client.docId };
}

/** The full configureTiming form — omitted values deliberately clear minutes. */
export async function configureTiming(
  proof: Proof,
  events: Role,
  eventId: string,
  version: number,
  setupMinutes: number,
): Promise<void> {
  await proof.executeCommand(events, api.mutations.Event_configureTiming, {
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

/** One live purchase need on the event, seeded through the governed commands. */
export async function openPurchaseNeed(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<{ needId: string; ingredientId: string }> {
  const { kitchen, inventory } = rolesFor(proof, tenantId);
  const ingredient = (await proof.executeCommand(
    kitchen,
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `Isolation flour ${tenantId}`,
      unit: "kilogram",
      costPerUnit: 2.5,
      allergens: [],
      category: "pantry",
    },
  )) as { docId: string };
  const demand = (await proof.executeCommand(
    inventory,
    api.mutations.IngredientDemand_createViaCalculate,
    {
      eventId,
      ingredientId: ingredient.docId,
      requiredQuantity: 4.5,
      unit: "kilogram",
      servings: 40,
    },
  )) as { docId: string };
  const need = (await proof.executeCommand(
    inventory,
    api.mutations.PurchaseNeed_create,
    {
      eventId,
      ingredientDemandId: demand.docId,
      ingredientId: ingredient.docId,
      requiredQuantity: 4.5,
      unit: "kilogram",
    },
  )) as { docId: string };
  return { needId: need.docId, ingredientId: ingredient.docId };
}

export async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{ stage: string; version: number; tenantId: string }> {
  const event = (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as { stage: string; version: number; tenantId: string };
  return event;
}

/** Live (not deleted) purchase needs for the event. */
export async function livePurchaseNeeds(
  actor: Role,
  eventId: string,
): Promise<
  { id: string; status: string; cancellationReason: string | null }[]
> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("purchaseNeeds").collect(),
  )) as {
    _id: string;
    eventId: string;
    deletedAt: number | null;
    status: string;
    cancellationReason: string | null;
  }[];
  return rows
    .filter((row) => row.eventId === eventId && row.deletedAt == null)
    .map(({ _id, status, cancellationReason }) => ({
      id: _id,
      status,
      cancellationReason,
    }));
}

export type ReceiptOutput = ReconciliationReceiptOutput;

type RawReceiptRow = {
  receiptKey: string | null;
  output: ReceiptOutput | null;
};

/** The eventReconciliation receipt outputs for the tenant — exact rows when
 * they exist, otherwise the head rows. */
export async function readReconciliationReceipts(
  actor: Role,
  tenantId: string,
): Promise<ReceiptOutput[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("materializationReceipts").collect(),
  )) as (RawReceiptRow & { tenantId: string })[];
  const family = rows.filter(
    (row) => row.tenantId === tenantId && row.receiptKey != null,
  );
  const exact = family.filter((row) =>
    row.receiptKey!.includes(":exact:eventReconciliation:"),
  );
  const source = exact.length
    ? exact
    : family.filter((row) => row.receiptKey!.includes("eventReconciliation"));
  return source
    .map((row) => row.output)
    .filter((output): output is ReceiptOutput => output != null);
}
