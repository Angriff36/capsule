/**
 * Runtime proof (AC-398 commercial-total-seed slice): the Event's
 * quotedPrice / budgetAmount are the commercial seed the operator stored at
 * booking (planEngagement) or later by an explicit Event.changePricing. A
 * later Proposal total must NOT rewrite them. Refusal-to-cascade is a
 * snapshot, not a freeze: changePricing still writes a new seed while the
 * stage allows it.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
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

function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role } {
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
  };
}

/** Client + Event carrying the commercial seed, then a later proposal. */
async function createEventWithClient(
  proof: Proof,
  tenantId: string,
  title: string,
  companyName: string,
): Promise<{ eventId: string; clientId: string }> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      clientName: companyName,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Seed",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return { eventId: event.docId, clientId: client.docId };
}

async function createProposal(
  proof: Proof,
  tenantId: string,
  clientId: string,
  title: string,
  total: number,
): Promise<{ proposalId: string }> {
  const owner = proof.asRole({
    subject: `proposal-owner-${tenantId}`,
    role: "owner",
    tenantId,
  });
  const proposal = (await proof.executeCommand(
    owner,
    M.Proposal_createViaDraft,
    {
      clientId,
      title,
      subtotal: total,
      taxAmount: 0,
      discountAmount: 0,
      total,
    },
  )) as { docId: string };
  return { proposalId: proposal.docId };
}

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{
  stage: string;
  budgetAmount: number | null;
  quotedPrice: number | null;
}> {
  return (await actor.run(async (ctx) => ctx.db.get(eventId as never))) as {
    stage: string;
    budgetAmount: number | null;
    quotedPrice: number | null;
  };
}

async function readProposal(
  actor: Role,
  proposalId: string,
): Promise<{ total: number | null }> {
  return (await actor.run(async (ctx) => ctx.db.get(proposalId as never))) as {
    total: number | null;
  };
}

describe("runtime proof: Event commercial seed stays put under later proposals", () => {
  it("a later proposal total leaves the event commercial seed", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-commercial-later-proposal";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, clientId } = await createEventWithClient(
      proof,
      tenantId,
      "Commercial seed holds under later proposal",
      "Acme Catering",
    );

    const before = await readEvent(events, eventId);
    expect(before.quotedPrice).toBe(4500);
    expect(before.budgetAmount).toBe(3000);
    expect(before.stage).toBe("planning");

    const { proposalId } = await createProposal(
      proof,
      tenantId,
      clientId,
      "Later repriced proposal",
      9999,
    );
    const proposal = await readProposal(events, proposalId);
    expect(proposal.total).toBe(9999);

    const after = await readEvent(events, eventId);
    expect(after.quotedPrice).toBe(4500);
    expect(after.budgetAmount).toBe(3000);
    expect(after.stage).toBe("planning");
  });

  it("changePricing writes a new seed and a later proposal still leaves it", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-commercial-change-pricing";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, clientId } = await createEventWithClient(
      proof,
      tenantId,
      "Change pricing rewrites the seed",
      "Beacon Hospitality",
    );

    // An explicit changePricing writes a new seed — snapshot, not freeze.
    await proof.executeCommand(events, M.Event_changePricing, {
      docId: eventId,
      budgetAmount: 2800,
      quotedPrice: 5200,
    });
    const reseeded = await readEvent(events, eventId);
    expect(reseeded.quotedPrice).toBe(5200);
    expect(reseeded.budgetAmount).toBe(2800);

    const { proposalId } = await createProposal(
      proof,
      tenantId,
      clientId,
      "Second later proposal",
      100,
    );
    const proposal = await readProposal(events, proposalId);
    expect(proposal.total).toBe(100);

    const after = await readEvent(events, eventId);
    expect(after.quotedPrice).toBe(5200);
    expect(after.budgetAmount).toBe(2800);
    expect(after.stage).toBe("planning");

    // Still not a freeze: a following changePricing succeeds.
    await proof.executeCommand(events, M.Event_changePricing, {
      docId: eventId,
      budgetAmount: 2900,
      quotedPrice: 5300,
    });
    const again = await readEvent(events, eventId);
    expect(again.quotedPrice).toBe(5300);
    expect(again.budgetAmount).toBe(2900);
  });
});
