/**
 * Seed + readers for the AC-407 §6.5 finalized-closeout slice of the
 * plan-vs-fact matrix runtime proof: walk a planned event (quotedPrice 4500)
 * to closed_out, let the EventClosedOut reaction seed one draft closeout,
 * recapture the real actuals on that draft, finalize it as finance, then
 * restate the Event commercial seed. Assertion-free; the test file owns every
 * expect().
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

export const S = {
  startsAt: Date.UTC(2026, 9, 22, 17, 0),
  endsAt: Date.UTC(2026, 9, 22, 22, 0),
  expectedHeadcount: 40,
  quotedPrice: 4500,
  budgetAmount: 3000,
} as const;

/** The actuals recaptured on the reaction-seeded draft before finalizing. */
export const CAPTURED_ACTUALS = {
  actualRevenue: 4500,
  budgetedRevenue: 4500,
  revenueVariance: 0,
  actualIngredientCost: 800,
  actualWasteCost: 50,
  actualLaborCost: 900,
  actualVendorCost: 200,
  budgetedCost: 3000,
  totalActualCost: 1950,
  costVariance: 1050,
  grossProfit: 2550,
  expectedHeadcount: 40,
  actualHeadcount: 38,
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
export type Cmd = Parameters<Proof["executeCommand"]>[1];

/** A command runner bound to one actor, for terse capture/finalize calls. */
export function runner(proof: Proof, role: Role) {
  return async (cmd: Cmd, args: Record<string, unknown>) =>
    (await proof.executeCommand(role, cmd, args as never)) as {
      docId: string;
    };
}

/** Sales / events / finance / logistics actors for one tenant. */
export function rolesFor(proof: Proof, tenantId: string) {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  return {
    sales: mk("sales", "sales_manager"),
    events: mk("event-manager", "event_manager"),
    finance: mk("finance", "finance_manager"),
    logistics: mk("logistics", "logistics_manager"),
  };
}

async function createEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<string> {
  const run = runner(proof, rolesFor(proof, tenantId).sales);
  const client = await run(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: `Finalized closeout client ${tenantId} ${title}`,
  });
  const event = await run(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.expectedHeadcount,
    primaryContactName: "Casey Closeout",
    budgetAmount: S.budgetAmount,
    quotedPrice: S.quotedPrice,
  });
  return event.docId;
}

export const LADDER = [
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "closed_out",
] as const;
export type LadderStage = (typeof LADDER)[number];

export type EventRow = {
  stage: string;
  version: number;
  quotedPrice?: number;
  budgetAmount?: number;
  expectedHeadcount?: number;
};

export async function readEventRow(
  actor: Role,
  eventId: string,
): Promise<EventRow> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as never as EventRow;
}

/** Cancel every open pack list on the event (the approved reaction match-else-
 * creates a draft) so beginExecution can run — same path as the closeout
 * lifecycle proof. */
async function cancelOpenPackLists(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const { logistics } = rolesFor(proof, tenantId);
  const rows = (await logistics.run(async (ctx) =>
    ctx.db.query("packLists").collect(),
  )) as Array<{
    _id: string;
    eventId?: string;
    deletedAt?: number | null;
    status?: string;
    version?: number;
  }>;
  for (const pack of rows) {
    if (pack.eventId !== eventId) continue;
    if (pack.deletedAt != null) continue;
    if (pack.status === "cancelled" || pack.status === "dispatched") continue;
    await proof.executeCommand(logistics, api.mutations.PackList_cancel, {
      docId: pack._id,
      reason: "Closeout proof skips packing",
      version: pack.version,
    });
  }
}

/** Same walker as the completion-correction proof: create is version 1, each
 * public lifecycle command takes the current version and bumps it by one.
 * beginExecution is preceded by the pack-list cancel so an approved draft
 * pack list cannot block the walk. */
export async function walkToStage(
  proof: Proof,
  tenantId: string,
  target: LadderStage,
  title: string,
): Promise<{ eventId: string; version: number }> {
  const roles = rolesFor(proof, tenantId);
  const eventId = await createEvent(proof, tenantId, title);
  const plan: Array<readonly [Role, Cmd]> = [
    [roles.events, api.mutations.Event_submitForApproval],
    [roles.events, api.mutations.Event_approve],
    [roles.sales, api.mutations.Event_lockForSales],
    [roles.events, api.mutations.Event_beginExecution],
    [roles.events, api.mutations.Event_finalizeEvent],
    [roles.events, api.mutations.Event_complete],
    [roles.events, api.mutations.Event_closeOut],
  ];
  let version = 1;
  for (const [i, [role, cmd]] of plan.entries()) {
    if (LADDER.indexOf(target) < i + 1) break;
    if (cmd === api.mutations.Event_beginExecution) {
      await cancelOpenPackLists(proof, tenantId, eventId);
    }
    await proof.executeCommand(role, cmd, { docId: eventId, version });
    version = i + 2;
  }
  return { eventId, version };
}

export type CloseoutFactRow = {
  _id: string;
  eventId?: string | null;
  status: string;
  actualRevenue: number;
  budgetedRevenue: number;
  revenueVariance: number;
  actualIngredientCost: number;
  actualWasteCost: number;
  actualLaborCost: number;
  actualVendorCost: number;
  budgetedCost: number;
  totalActualCost: number;
  costVariance: number;
  grossProfit: number;
  expectedHeadcount: number;
  actualHeadcount: number;
  capturedAt?: number | null;
  finalizedAt?: number | null;
  version: number;
  deletedAt?: number | null;
};

/** Live (deletedAt null or absent) eventCloseouts for one event, read the same
 * way the terminal-meanings proof reads the table. */
export function listedCloseoutFacts(
  actor: Role,
  eventId: string,
): Promise<CloseoutFactRow[]> {
  return actor
    .run(
      async (ctx) =>
        ctx.db.query("eventCloseouts").collect() as unknown as Promise<
          CloseoutFactRow[]
        >,
    )
    .then((rows) =>
      rows.filter((row) => row.deletedAt == null && row.eventId === eventId),
    );
}

export type CloseoutSnapshot = {
  _id: string;
  eventId: string;
  status: string;
  actualRevenue: number;
  budgetedRevenue: number;
  revenueVariance: number;
  actualIngredientCost: number;
  actualWasteCost: number;
  actualLaborCost: number;
  actualVendorCost: number;
  budgetedCost: number;
  totalActualCost: number;
  costVariance: number;
  grossProfit: number;
  expectedHeadcount: number;
  actualHeadcount: number;
  capturedAt: number;
  finalizedAt: number;
  version: number;
  deletedAt: number | null;
};

/** The identity + money + stamps slice the proof compares after a commercial
 * correction. */
export function snapshotCloseout(row: CloseoutFactRow): CloseoutSnapshot {
  if (row.capturedAt == null || row.finalizedAt == null)
    throw new Error(`Closeout ${row._id} is not finalized history`);
  return {
    _id: row._id,
    eventId: row.eventId as string,
    status: row.status,
    actualRevenue: Number(row.actualRevenue),
    budgetedRevenue: Number(row.budgetedRevenue),
    revenueVariance: Number(row.revenueVariance),
    actualIngredientCost: Number(row.actualIngredientCost),
    actualWasteCost: Number(row.actualWasteCost),
    actualLaborCost: Number(row.actualLaborCost),
    actualVendorCost: Number(row.actualVendorCost),
    budgetedCost: Number(row.budgetedCost),
    totalActualCost: Number(row.totalActualCost),
    costVariance: Number(row.costVariance),
    grossProfit: Number(row.grossProfit),
    expectedHeadcount: Number(row.expectedHeadcount),
    actualHeadcount: Number(row.actualHeadcount),
    capturedAt: row.capturedAt,
    finalizedAt: row.finalizedAt,
    version: row.version,
    deletedAt: row.deletedAt ?? null,
  };
}

/** Recapture the real actuals on the existing draft closeout as finance,
 * using its live version. Never creates a second row. */
export async function captureCloseout(
  proof: Proof,
  tenantId: string,
  closeoutId: string,
  eventId: string,
): Promise<void> {
  const { finance } = rolesFor(proof, tenantId);
  const live = (await finance.run(async (ctx) =>
    ctx.db.get(closeoutId as never),
  )) as { version: number };
  await runner(proof, finance)(api.mutations.EventCloseout_capture, {
    docId: closeoutId,
    eventId,
    ...CAPTURED_ACTUALS,
    version: live.version,
  });
}

/** Finalize the closeout as finance at the caller-provided live version. */
export async function finalizeCloseout(
  proof: Proof,
  tenantId: string,
  closeoutId: string,
  version: number,
): Promise<void> {
  const { finance } = rolesFor(proof, tenantId);
  await runner(proof, finance)(api.mutations.EventCloseout_finalize, {
    docId: closeoutId,
    version,
  });
}

/** Restate the Event commercial seed as the event manager. Retries once on a
 * version mismatch by re-reading the event version; other errors propagate. */
export async function correctCommercial(
  proof: Proof,
  tenantId: string,
  eventId: string,
  budgetAmount: number,
  quotedPrice: number,
  reason: string,
  retryVersion?: number,
): Promise<void> {
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);
  const event = await readEventRow(roles.events, eventId);
  try {
    await runEvent(api.mutations.Event_correctCommercial, {
      docId: eventId,
      version: retryVersion ?? event.version,
      reason,
      budgetAmount,
      quotedPrice,
    });
  } catch (error) {
    if (retryVersion !== undefined) throw error;
    if (!String(error).includes("VERSION_MISMATCH")) throw error;
    const fresh = await readEventRow(roles.events, eventId);
    await correctCommercial(
      proof,
      tenantId,
      eventId,
      budgetAmount,
      quotedPrice,
      reason,
      fresh.version,
    );
  }
}
