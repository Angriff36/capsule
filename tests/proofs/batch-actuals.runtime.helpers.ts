/**
 * Setup-only helpers for the PL-BATCH proofs (AC-458, AC-491): one published
 * recipe, one event, and a batch planned for it through governed commands.
 * The cook has a linked staff profile so "who did it" resolves to a Person.
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

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

export type BatchRow = {
  _id: string;
  version: number;
  status: string;
  plannedYield: number;
  actualYield?: number | null;
  shortfallQuantity?: number | null;
  shortfallResolvedAt?: number | null;
  shortfallResolution?: string | null;
  wasteQuantity?: number | null;
  wasteReason?: string | null;
  startedById?: string | null;
  completedById?: string | null;
  yieldCorrectedById?: string | null;
  yieldCorrectionReason?: string | null;
  makeUpForBatchId?: string | null;
};

export async function readDoc<T>(role: Role, id: string): Promise<T> {
  return (await role.run(async (ctx) => ctx.db.get(id as never))) as T;
}

export async function eventsOfType(role: Role, type: string) {
  const rows = (await role.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as { type: string; payload: Record<string, unknown> }[];
  return rows.filter((row) => row.type === type);
}

/** A cook whose sign-in is linked to a staff profile (Person). */
export async function linkedCook(proof: Proof, tenantId: string) {
  const subject = `cook-${tenantId}`;
  const cook = proof.asRole({ subject, role: "kitchen_manager", tenantId });
  const personId = (await cook.run((ctx) =>
    ctx.db.insert("people", {
      tenantId,
      givenName: "Casey",
      familyName: "Cook",
      email: `${subject}@example.test`,
      role: "kitchen_manager",
      employmentType: "full_time",
      status: "active",
      authSubjectId: subject,
      version: 1,
    } as never),
  )) as unknown as string;
  return { cook, personId };
}

/** A published recipe, an event, and a planned batch with one event share. */
export async function plannedBatch(
  proof: Proof,
  tenantId: string,
  cook: Role,
  plannedYield: number,
) {
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const component = (await proof.executeCommand(
    cook,
    M.Component_createViaDraft,
    {
      name: "Batch actuals short rib",
      yieldQuantity: 1,
      yieldUnit: "portion",
      batchMultiplier: 1,
    },
  )) as { docId: string };
  await proof.executeCommand(cook, M.Component_publishVersion, {
    docId: component.docId,
    version: 1,
  });
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: "Batch actuals client",
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Batch actuals dinner",
      eventType: "catering",
      startsAt: Date.UTC(2026, 10, 7, 17, 0),
      endsAt: Date.UTC(2026, 10, 7, 22, 0),
      expectedHeadcount: plannedYield,
      primaryContactName: "Pat Planner",
      budgetAmount: 2000,
      quotedPrice: 2500,
    },
  )) as { docId: string };
  const batch = (await proof.executeCommand(
    cook,
    M.ProductionBatch_createViaPlan,
    {
      componentId: component.docId,
      plannedYield,
      yieldUnit: "portion",
      eventId: event.docId,
    },
  )) as { docId: string };
  const allocation = (await proof.executeCommand(
    cook,
    M.ProductionBatchAllocation_createViaAllocate,
    {
      productionBatchId: batch.docId,
      allocatedQuantity: plannedYield,
      unit: "portion",
      formulaShare: 1,
      eventId: event.docId,
    },
  )) as { docId: string };
  return {
    componentId: component.docId,
    eventId: event.docId,
    batchId: batch.docId,
    allocationId: allocation.docId,
  };
}
