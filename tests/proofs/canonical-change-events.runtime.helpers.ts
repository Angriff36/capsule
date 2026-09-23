/**
 * Shared harness for the AC-422 canonical-change-events runtime proof:
 * roles, the manifestEvents ledger read, the exactly-one typed-row contract,
 * and the planned-event / accepted-proposal seeds every §8.1 slice uses.
 */
import { convexTest } from "convex-test";
import { expect } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
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
export type Cmd = Parameters<Proof["executeCommand"]>[1];

/** A command runner bound to one actor, for terse seed/step calls. */
export function runner(proof: Proof, role: Role) {
  return async (cmd: Cmd, args: Record<string, unknown>) =>
    (await proof.executeCommand(role, cmd, args as never)) as {
      docId: string;
    };
}

export function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role; kitchen: Role; owner: Role } {
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
    owner: proof.asRole({
      subject: `owner-${tenantId}`,
      role: "owner",
      tenantId,
    }),
  };
}

export type LedgerRow = {
  type: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

/** Raw manifestEvents collect, filtered by typed event name + entity id. */
export async function ledgerRows(
  actor: Role,
  type: string,
  entityId: string,
): Promise<LedgerRow[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as LedgerRow[];
  return rows.filter((row) => row.type === type && row.entityId === entityId);
}

/** Exactly one row of `type` for this entity: a runtime createdAt, the
 * tenant when asserted, and every extra field equal in the payload. */
export async function expectExactlyOne(
  actor: Role,
  type: string,
  entityId: string,
  extra: Record<string, unknown> = {},
): Promise<LedgerRow> {
  const rows = await ledgerRows(actor, type, entityId);
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row.createdAt).toEqual(expect.any(Number));
  expect(row.createdAt).toBeGreaterThan(0);
  if (extra.tenantId !== undefined) {
    expect(row.payload.tenantId).toBe(extra.tenantId);
  }
  for (const [field, value] of Object.entries(extra)) {
    expect(row.payload[field]).toBe(value);
  }
  return row;
}

/** Company client + planned Event (version 1) via the sales role — the seed
 * every ops/menu slice walks forward from. */
export async function createPlannedEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; clientId: string; version: 1 }> {
  const run = runner(proof, rolesFor(proof, tenantId).sales);
  const client = await run(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: `Canonical events client ${tenantId} ${title}`,
  });
  const event = await run(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: 40,
    primaryContactName: "Casey Canonical",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  return { eventId: event.docId, clientId: client.docId, version: 1 };
}

/** Client + published menu + dish + draft→send→view→accept proposal, the
 * booking-identity seed shape. */
export async function acceptedProposal(
  proof: Proof,
  owner: Role,
  tenantId: string,
): Promise<{ clientId: string; proposalId: string }> {
  const run = runner(proof, owner);
  const client = await run(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: `Canonical proposal client ${tenantId}`,
  });
  const menu = await run(api.mutations.Menu_createViaDraft, {
    name: `Canonical tasting menu ${tenantId}`,
  });
  await run(api.mutations.Menu_markPublished, { docId: menu.docId });
  const dish = await run(api.mutations.Dish_createViaIntroduce, {
    name: "Maple duck",
    portionSize: 1,
    portionUnit: "serving",
  });
  const proposal = await run(api.mutations.Proposal_createViaDraft, {
    clientId: client.docId,
    title: "Autumn gala proposal",
    subtotal: 1200,
    taxAmount: 100,
    discountAmount: 0,
    total: 1300,
    eventType: "gala dinner",
    eventDate: Date.parse("2026-11-05T18:00:00Z"),
    eventEndDate: Date.parse("2026-11-05T23:00:00Z"),
    guestCount: 80,
    venueName: "Garden Hall",
  });
  await run(api.mutations.ProposalDishSelection_createViaSelect, {
    proposalId: proposal.docId,
    menuId: menu.docId,
    dishId: dish.docId,
    quantityServings: 80,
    course: "main",
  });
  await run(api.mutations.Proposal_send, { docId: proposal.docId });
  await run(api.mutations.Proposal_markViewed, { docId: proposal.docId });
  await run(api.mutations.Proposal_accept, { docId: proposal.docId });
  return { clientId: client.docId, proposalId: proposal.docId };
}
