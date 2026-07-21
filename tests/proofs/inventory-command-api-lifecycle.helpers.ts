import { api } from "../../convex/_generated/api";
import {
  createManifestTestContext,
  type ManifestConvexTestHarness,
} from "@angriff36/manifest/proof-kit/convex-test";
import { INVENTORY_HTTP_LIFECYCLE as S } from "../fixtures/inventory-http-lifecycle-scenario";

export type Actor = ManifestConvexTestHarness & {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

export type Proof = ReturnType<typeof createManifestTestContext>;

function asActor(actor: ManifestConvexTestHarness): Actor {
  return actor as unknown as Actor;
}

export async function dispatchCommand(
  actor: Actor,
  entity: string,
  command: string,
  body: Record<string, unknown>,
) {
  const response = await actor.fetch(
    `/api/manifest/${entity}/commands/${command}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json()) as {
    data?: unknown;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.error ?? `HTTP ${response.status} for ${entity}.${command}`,
    );
  }
  return payload.data;
}

export async function seedApprovedEvent(proof: Proof) {
  const sales = asActor(
    proof.asRole({
      subject: `sales-${S.tenantId}`,
      role: S.salesRole,
      tenantId: S.tenantId,
    }),
  );
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: "HTTP lifecycle client",
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: S.eventTitle,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Lifecycle",
      budgetAmount: 4000,
      quotedPrice: 4800,
    },
  )) as { docId: string };

  const events = asActor(
    proof.asRole({
      subject: `events-${S.tenantId}`,
      role: S.eventManagerRole,
      tenantId: S.tenantId,
    }),
  );
  await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
    docId: event.docId,
    version: 1,
  });
  await proof.executeCommand(events, api.mutations.Event_approve, {
    docId: event.docId,
    version: 2,
  });
  return event.docId;
}

export async function seedStock(proof: Proof, eventId: string) {
  const kitchen = asActor(
    proof.asRole({
      subject: `kitchen-${S.tenantId}`,
      role: S.kitchenRole,
      tenantId: S.tenantId,
    }),
  );
  const ingredient = (await proof.executeCommand(
    kitchen,
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: S.ingredientName,
      unit: S.unit,
      costPerUnit: 3.5,
      allergens: [],
      category: "pantry",
    },
  )) as { docId: string };

  const inventory = asActor(
    proof.asRole({
      subject: `inventory-${S.tenantId}`,
      role: S.role,
      tenantId: S.tenantId,
    }),
  );
  const location = (await proof.executeCommand(
    inventory,
    api.mutations.StorageLocation_createViaRegister,
    { name: "HTTP lifecycle dry storage", locationType: "dry" },
  )) as { docId: string };
  const item = (await proof.executeCommand(
    inventory,
    api.mutations.InventoryItem_createViaOpen,
    {
      ingredientId: ingredient.docId,
      locationId: location.docId,
      unit: S.unit,
      quantityOnHand: S.onHand,
      parLevel: 10,
      reorderThreshold: 5,
      unitCost: 3.5,
    },
  )) as { docId: string };

  const demand = (await dispatchCommand(
    inventory,
    "IngredientDemand",
    "calculate",
    {
      eventId,
      ingredientId: ingredient.docId,
      requiredQuantity: S.initialDemand,
      unit: S.unit,
      servings: 40,
    },
  )) as { docId: string };

  return {
    inventory,
    ingredientId: ingredient.docId,
    itemId: item.docId,
    demandId: demand.docId,
  };
}

export async function loadRows(actor: Actor, eventId: string) {
  return actor.run(async (ctx) => {
    const demands = await ctx.db.query("ingredientDemands").collect();
    const items = await ctx.db.query("inventoryItems").collect();
    const reservations = await ctx.db.query("inventoryReservations").collect();
    return {
      demands: demands.filter((row: any) => row.eventId === eventId),
      items,
      reservations: reservations.filter((row: any) => row.eventId === eventId),
    };
  });
}

export function mapDemands(rows: any[]) {
  return rows.map((demand) => ({
    id: demand._id,
    eventId: demand.eventId,
    ingredientId: demand.ingredientId,
    requiredQuantity: Number(demand.requiredQuantity),
    unit: String(demand.unit),
    status: String(demand.status),
    version: demand.version,
    deletedAt: demand.deletedAt,
  }));
}

export function mapItems(rows: any[]) {
  return rows.map((item) => ({
    id: item._id,
    ingredientId: item.ingredientId,
    quantityOnHand: Number(item.quantityOnHand),
    locationId: item.locationId,
    unit: String(item.unit),
    stockedAt: item.stockedAt,
    deletedAt: item.deletedAt,
  }));
}

export function mapReservations(rows: any[]) {
  return rows.map((reservation) => ({
    id: reservation._id,
    inventoryItemId: reservation.inventoryItemId,
    eventId: reservation.eventId,
    ingredientId: reservation.ingredientId,
    quantity: Number(reservation.quantity),
    status: String(reservation.status),
    version: reservation.version,
    deletedAt: reservation.deletedAt,
  }));
}
