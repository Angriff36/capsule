/**
 * Seed helpers for the revenue split proofs (PL-ATTRIBUTION). A finance
 * manager with a staff profile, a venue, and an event booked at it.
 * Assertion-free; the test files own every expect().
 */
import { api } from "../../convex/_generated/api";
import {
  DAY,
  harness,
  M,
  readDoc,
  run,
  type Proof,
  type Role,
} from "./venue-layout.runtime.helpers";

export { DAY, harness, M, readDoc, run };
export type { Proof, Role };

export type Split = {
  _id: string;
  eventId: string;
  attributionType: string;
  allocationMethod: string;
  status: string;
  percentBasis: number;
  fixedAmount: number;
  allocatedAmount: number;
  venueId?: string;
  venueCommissionTermId?: string;
  overrideReason?: string;
  overriddenById?: string;
  overRevenueReason?: string;
  overRevenueAllowedById?: string;
  reason?: string;
  deletedAt?: number | null;
};

export async function seedFinance(proof: Proof, tenantId: string) {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  const finance = mk("finance", "finance_manager");
  await proof.seedEntity(finance, "people", {
    tenantId,
    givenName: "Fran",
    familyName: "Finance",
    email: `finance-${tenantId}@example.com`,
    role: "finance_manager",
    employmentType: "full_time",
    status: "active",
    authSubjectId: `finance-${tenantId}`,
    version: 1,
  });
  const events = mk("event-manager", "event_manager");
  const sales = mk("sales", "sales_manager");
  const venue = await run(proof, events, M.Venue_createViaRegister, {
    name: "Lakeside Hall",
    venueType: "banquet_hall",
    capacity: 200,
  });
  const client = await run(proof, sales, M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Split client ${tenantId}`,
  });
  return {
    finance,
    events,
    sales,
    venueId: venue.docId,
    clientId: client.docId,
  };
}

export async function planEvent(
  proof: Proof,
  sales: Role,
  clientId: string,
  venueId: string,
  title: string,
  quotedPrice: number,
  startsAt = Date.now() + 30 * DAY,
) {
  return (
    await run(proof, sales, M.Event_createViaPlanEngagement, {
      clientId,
      title,
      eventType: "corporate dinner",
      startsAt,
      endsAt: startsAt + 4 * 60 * 60 * 1000,
      expectedHeadcount: 100,
      primaryContactName: "Casey Client",
      budgetAmount: quotedPrice,
      quotedPrice,
      venueId,
      venueName: "Lakeside Hall",
    })
  ).docId;
}

/** planning -> pending_approval -> approved (the booking). */
export async function book(proof: Proof, events: Role, eventId: string) {
  for (const cmd of [M.Event_submitForApproval, M.Event_approve]) {
    const { version } = await readDoc<{ version: number }>(events, eventId);
    await proof.executeCommand(events, cmd, { docId: eventId, version });
  }
}

export async function splitsFor(
  finance: Role,
  eventId: string,
): Promise<Split[]> {
  return (
    (await finance.query(api.queries.listRevenueAttribution, {})) as Split[]
  ).filter((row) => row.eventId === eventId && row.deletedAt == null);
}

/** draft -> pending_approval -> approved -> applied against `revenue`. */
export async function approveAndApply(
  proof: Proof,
  finance: Role,
  splitId: string,
  revenue: number,
) {
  await proof.executeCommand(finance, M.RevenueAttribution_requestApproval, {
    docId: splitId,
  });
  await proof.executeCommand(finance, M.RevenueAttribution_approve, {
    docId: splitId,
  });
  return proof.executeCommand(finance, M.RevenueAttribution_apply, {
    docId: splitId,
    eventRevenue: revenue,
  });
}
