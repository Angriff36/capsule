/**
 * Shared helpers for the reaction-replay identity runtime proof (AC-404 /
 * backend §6.2). Extracted so the proof file stays under the size cap. No
 * assertion logic lives here.
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

export const S = {
  startsAt: Date.UTC(2026, 9, 22, 17, 0),
  endsAt: Date.UTC(2026, 9, 22, 22, 0),
  headcount: 40,
} as const;
export const M = api.mutations;

export function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

export type Proof = ReturnType<typeof harness>;
export type Role = ReturnType<Proof["asRole"]>;
export type Row = Record<string, unknown>;

export function rolesFor(proof: Proof, tenantId: string) {
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
    finance: proof.asRole({
      subject: `finance-${tenantId}`,
      role: "finance_manager",
      tenantId,
    }),
    logistics: proof.asRole({
      subject: `logistics-${tenantId}`,
      role: "logistics_manager",
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

export async function createEvent(
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
      companyName: `Replay client ${tenantId} ${title}`,
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
      expectedHeadcount: S.headcount,
      primaryContactName: "Casey Replay",
      budgetAmount: 3200,
      quotedPrice: 4800,
    },
  )) as { docId: string };
  return event.docId;
}

/** Live (deletedAt == null) rows in one table, optionally one event. */
export async function liveRows(
  reader: Role,
  table: "invoices" | "packLists" | "productionBatches" | "purchaseNeeds",
  eventId?: string,
): Promise<Row[]> {
  const rows = (await reader.run(async (ctx) =>
    ctx.db.query(table).collect(),
  )) as Row[];
  return rows.filter(
    (row) =>
      (row as { deletedAt?: number | null }).deletedAt == null &&
      (eventId == null || (row as { eventId?: string }).eventId === eventId),
  );
}

export async function readEventStage(
  actor: Role,
  eventId: string,
): Promise<string> {
  const row = (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as { stage: string };
  return row.stage;
}

export async function seedDishComponentForEvent(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const { events, kitchen } = rolesFor(proof, tenantId);
  const component = (await proof.executeCommand(
    kitchen,
    M.Component_createViaDraft,
    {
      name: `Replay rolls ${tenantId}`,
      yieldQuantity: 1,
      yieldUnit: "portion",
      batchMultiplier: 1,
    },
  )) as { docId: string };
  await proof.executeCommand(kitchen, M.Component_publishVersion, {
    docId: component.docId,
    version: 1,
  });
  const dish = (await proof.executeCommand(kitchen, M.Dish_createViaIntroduce, {
    name: `Replay roll ${tenantId}`,
    portionSize: 1,
    portionUnit: "portion",
    category: "bread",
  })) as { docId: string };
  await proof.executeCommand(kitchen, M.DishComponent_createViaAttach, {
    dishId: dish.docId,
    componentId: component.docId,
    yieldQuantity: 1,
    batchMultiplier: 1,
  });
  await proof.executeCommand(events, M.EventDish_createViaAddToEvent, {
    eventId,
    dishId: dish.docId,
    quantityServings: S.headcount,
  });
}

export async function seedEligibleDemandForEvent(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const { kitchen, inventory } = rolesFor(proof, tenantId);
  const ingredient = (await proof.executeCommand(
    kitchen,
    M.Ingredient_createViaIntroduce,
    {
      name: `Replay flour ${tenantId}`,
      unit: "kilogram",
      costPerUnit: 2.5,
      allergens: [],
      category: "pantry",
    },
  )) as { docId: string };
  await proof.executeCommand(inventory, M.IngredientDemand_createViaCalculate, {
    eventId,
    ingredientId: ingredient.docId,
    requiredQuantity: 4.5,
    unit: "kilogram",
    servings: S.headcount,
  });
}

/** Finance re-issues the SAME event invoice with deliberately different money. */
export async function replayIssue(
  proof: Proof,
  tenantId: string,
  invoice: Row,
) {
  const { finance } = rolesFor(proof, tenantId);
  await proof.executeCommand(finance, M.Invoice_issue, {
    docId: invoice._id as string,
    version: invoice.version as number,
    clientId: invoice.clientId as string,
    eventId: invoice.eventId as string,
    invoiceSequence: 0,
    subtotal: 1,
    taxAmount: 0,
    discountAmount: 0,
    total: 1,
  });
}
