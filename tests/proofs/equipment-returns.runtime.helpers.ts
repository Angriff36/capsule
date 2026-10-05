/**
 * Shared seed for the PL-RETURNS proofs (AC-136, 137, 342, 543, 544, 546,
 * 549, 551): one tenant, a logistics manager and staff, events, catalog
 * lines, and small wrappers for reserve / read / availability / exceptions.
 */
import { convexTest } from "convex-test";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

export const M = api.mutations;
export const HOUR = 3600_000;
export const SAT = Date.UTC(2026, 10, 14, 16, 0);
export const SUN = Date.UTC(2026, 10, 15, 10, 0);

export function ensureEncryptionKey() {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
}

export type Row = Record<string, any>;

export function returnsHarness(tenantId: string) {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  const as = (subject: string, role: string) =>
    proof.asRole({ subject: `${subject}-${tenantId}`, role, tenantId });
  const manager = as("logistics-manager", "logistics_manager");
  const staff = as("logistics-staff", "logistics_staff");
  const sales = as("sales", "sales_manager");
  const events = as("events", "event_manager");
  const finance = as("finance", "finance_staff");
  type Actor = typeof manager;
  const run = (actor: Actor, cmd: unknown, args: object) =>
    proof.executeCommand(actor, cmd as never, args as never) as Promise<{
      docId: string;
    }>;
  const read = async (id: string) =>
    (await manager.run(async (ctx) => ctx.db.get(id as never))) as Row;
  const all = async (table: string) =>
    (await manager.run(async (ctx) =>
      ctx.db.query(table as never).collect(),
    )) as Row[];
  const event = async (title: string, startsAt: number, endsAt: number) => {
    const client = await run(sales, M.Client_createViaRegister, {
      clientType: "company",
      companyName: `${title} client`,
    });
    return run(sales, M.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title,
      eventType: "wedding",
      startsAt,
      endsAt,
      expectedHeadcount: 100,
      primaryContactName: "Riley Host",
      budgetAmount: 5000,
      quotedPrice: 7000,
    });
  };
  const equipment = (
    name: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ) =>
    run(manager, M.Equipment_createViaRegister, {
      name,
      assetTag: `${name}-${Math.random().toString(36).slice(2, 8)}`,
      category: "Serving",
      ownership: "owned",
      quantity,
      ...extra,
    });
  const reserve = (
    actor: Actor,
    equipmentId: string,
    eventId: string,
    startsAt: number,
    endsAt: number,
    quantity: number,
    overrideReason?: string,
  ) =>
    actor.mutation(api.equipmentCheckout.reserve, {
      equipmentId: equipmentId as never,
      eventId: eventId as never,
      startsAt,
      endsAt,
      quantity,
      ...(overrideReason ? { overrideReason } : {}),
    }) as Promise<{ equipmentReservationId: string }>;
  const availability = async (
    eventId: string,
    startsAt: number,
    endsAt: number,
    equipmentId: string,
  ) =>
    (
      (await manager.query(api.equipmentCheckout.equipmentAvailability, {
        eventId: eventId as never,
        startsAt,
        endsAt,
      })) as Row[]
    ).find((row) => row.equipmentId === equipmentId)!;
  const exceptions = async (actor: Actor, eventId: string) =>
    (await actor.query(api.equipmentCheckout.eventEquipmentExceptions, {
      eventId: eventId as never,
    })) as Row;
  const checkOut = async (reservationId: string) =>
    run(manager, M.EquipmentReservation_checkOut, {
      docId: reservationId,
      version: (await read(reservationId)).version,
      condition: "good",
    });
  const markReturned = async (reservationId: string, args: object) =>
    run(staff, M.EquipmentReservation_markReturned, {
      docId: reservationId,
      version: (await read(reservationId)).version,
      ...args,
    });
  const issuesFor = async (eventId: string) =>
    (await all("equipmentIssues")).filter((row) => row.eventId === eventId);
  return {
    proof,
    as,
    manager,
    staff,
    sales,
    events,
    finance,
    run,
    read,
    all,
    event,
    equipment,
    reserve,
    availability,
    exceptions,
    checkOut,
    markReturned,
    issuesFor,
  };
}
