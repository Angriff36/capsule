/**
 * Runtime proof (AC-205 cancellation-release slice): Event.cancel releases
 * future equipment reservations and future crew assignments in the same
 * transaction, while already-performed custody (checked_out) and attendance
 * (checked_in) stay as history (backend §6.5).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 22, 17, 0),
  endsAt: Date.UTC(2026, 9, 22, 22, 0),
  expectedHeadcount: 40,
  quotedPrice: 4500,
  budgetAmount: 3000,
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
type Cmd = Parameters<Proof["executeCommand"]>[1];

async function run<T = { docId: string }>(
  proof: Proof,
  role: Role,
  cmd: Cmd,
  args: Record<string, unknown>,
): Promise<T> {
  return (await proof.executeCommand(role, cmd, args as never)) as T;
}

function rolesFor(proof: Proof, tenantId: string) {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  return {
    sales: mk("sales", "sales_manager"),
    events: mk("events", "event_manager"),
    inventory: mk("inventory", "inventory_staff"),
    workforce: mk("workforce", "workforce_manager"),
  };
}

/** One planned event + one reserved equipment hold + one assigned crew
 * member, seeded through the same governed commands as the sales-lock proof. */
async function seedScenario(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{
  eventId: string;
  reservationId: string;
  assignmentId: string;
}> {
  const { sales, inventory, workforce } = rolesFor(proof, tenantId);
  const client = await run(proof, sales, M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Cancellation release client ${tenantId} ${title}`,
  });
  const event = await run(proof, sales, M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.expectedHeadcount,
    primaryContactName: "Casey CancellationRelease",
    budgetAmount: S.budgetAmount,
    quotedPrice: S.quotedPrice,
  });

  const equipment = await run(proof, inventory, M.Equipment_createViaRegister, {
    name: `Cancellation release equipment ${tenantId} ${title}`,
    assetTag: `cancel-release-${tenantId}-${title}`,
    category: "furniture",
    ownership: "owned",
  });
  const reserved = (await inventory.mutation(api.equipmentCheckout.reserve, {
    equipmentId: equipment.docId,
    eventId: event.docId,
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    quantity: 1,
  })) as { equipmentReservationId: string };

  const person = await run(proof, workforce, M.Person_createViaHire, {
    givenName: "Avery",
    familyName: "Rivera",
    email: `avery-${tenantId}-${title}@proof.example`,
    role: "workforce_staff",
    employmentType: "part_time",
  });
  const assignment = await run(
    proof,
    workforce,
    M.EventAssignment_createViaAssign,
    { eventId: event.docId, personId: person.docId, role: "captain" },
  );

  return {
    eventId: event.docId,
    reservationId: reserved.equipmentReservationId,
    assignmentId: assignment.docId,
  };
}

async function readRow(
  actor: Role,
  docId: string,
): Promise<Record<string, unknown>> {
  return (await actor.run(async (ctx) => ctx.db.get(docId as never))) as Record<
    string,
    unknown
  >;
}

async function countEvents(
  actor: Role,
  type: string,
  payloadKey: string,
  docId: string,
): Promise<number> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as Array<{ type: string; payload: Record<string, unknown> }>;
  return rows.filter(
    (row) =>
      row.type === type &&
      (row.payload?.[payloadKey] as string | undefined) === docId,
  ).length;
}

async function cancelEvent(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const { events } = rolesFor(proof, tenantId);
  await run(proof, events, M.Event_cancel, {
    docId: eventId,
    version: 1,
    reason: "Client postponed",
  });
}

describe("runtime proof: Event.cancel releases future holds and keeps performed history", () => {
  it("cancel releases a reserved equipment hold and an assigned crew member", async () => {
    const proof = harness();
    const tenantId = "tenant-cancel-release-yes";
    const { events, inventory, workforce } = rolesFor(proof, tenantId);
    const seeded = await seedScenario(proof, tenantId, "Release on cancel");

    await cancelEvent(proof, tenantId, seeded.eventId);

    expect((await readRow(events, seeded.eventId)).stage).toBe("cancelled");
    const reservation = await readRow(inventory, seeded.reservationId);
    expect(reservation.status).toBe("cancelled");
    expect(reservation.cancellationReason).toBe("Client postponed");
    const assignment = await readRow(workforce, seeded.assignmentId);
    expect(assignment.status).toBe("unassigned");

    expect(
      await countEvents(
        events,
        "EquipmentReservationCancelled",
        "equipmentReservationId",
        seeded.reservationId,
      ),
    ).toBe(1);
    expect(
      await countEvents(
        events,
        "EventAssignmentUnassigned",
        "eventAssignmentId",
        seeded.assignmentId,
      ),
    ).toBe(1);
  });

  it("cancel leaves checked-out equipment and a checked-in assignment as history", async () => {
    const proof = harness();
    const tenantId = "tenant-cancel-release-history";
    const { events, inventory, workforce } = rolesFor(proof, tenantId);
    const seeded = await seedScenario(
      proof,
      tenantId,
      "History survives cancel",
    );

    await run(proof, inventory, M.EquipmentReservation_checkOut, {
      docId: seeded.reservationId,
      version: 0,
      condition: "good",
    });
    await run(proof, workforce, M.EventAssignment_checkIn, {
      docId: seeded.assignmentId,
      version: 1,
    });
    await cancelEvent(proof, tenantId, seeded.eventId);

    expect((await readRow(events, seeded.eventId)).stage).toBe("cancelled");
    expect((await readRow(inventory, seeded.reservationId)).status).toBe(
      "checked_out",
    );
    expect((await readRow(workforce, seeded.assignmentId)).status).toBe(
      "checked_in",
    );
    expect(
      await countEvents(
        events,
        "EquipmentReservationCancelled",
        "equipmentReservationId",
        seeded.reservationId,
      ),
    ).toBe(0);
    expect(
      await countEvents(
        events,
        "EventAssignmentUnassigned",
        "eventAssignmentId",
        seeded.assignmentId,
      ),
    ).toBe(0);
  });
});
