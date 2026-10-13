/**
 * A duplicate venue merges into the one to keep: its events and commission
 * terms move over and it leaves the book. Clashing active terms refuse the
 * merge, so no commission rate is picked without a person.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const M = api.mutations;
const DAY = 86_400_000;

async function setup() {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  const admin = proof.asRole({
    subject: "venue-merge-admin",
    role: "admin",
    tenantId: "tenant-venue-merge",
  });
  const venue = async (name: string) =>
    (
      (await proof.executeCommand(admin, M.Venue_createViaRegister, {
        name,
        venueType: "banquet_hall",
        capacity: 150,
      })) as { docId: string }
    ).docId;
  const keep = await venue("Riverfront Park Pavilion");
  const drop = await venue("Riverfront Pavilion");
  const client = (
    (await proof.executeCommand(admin, M.Client_createViaRegister, {
      clientType: "company",
      companyName: "Merge Test Co",
    })) as { docId: string }
  ).docId;
  const startsAt = Date.now() + 20 * DAY;
  const event = (
    (await proof.executeCommand(admin, M.Event_createViaPlanEngagement, {
      clientId: client,
      title: "Booked on the duplicate",
      eventType: "corporate",
      startsAt,
      endsAt: startsAt + 4 * 3_600_000,
      expectedHeadcount: 80,
      primaryContactName: "Contact",
      budgetAmount: 0,
      quotedPrice: 0,
      venueId: drop,
      venueName: "Riverfront Pavilion",
    })) as { docId: string }
  ).docId;
  return { proof, admin, keep, drop, event };
}

describe("venue merge", () => {
  it("moves events and terms to the kept venue and removes the duplicate", async () => {
    const { proof, admin, keep, drop, event } = await setup();
    await proof.executeCommand(admin, M.VenueCommissionTerm_createViaDefine, {
      venueId: drop,
      commissionPercent: 10,
      effectiveStartDate: Date.now() - 10 * DAY,
    });

    const result = (await admin.mutation(api.venueMerge.mergeInto, {
      duplicateVenueId: drop as never,
      targetVenueId: keep as never,
      reason: "Same pavilion, typed twice",
    })) as { moved: Record<string, number> };
    expect(result.moved).toMatchObject({
      events: 1,
      venueCommissionTerms: 1,
    });

    const rows = (await admin.run(async (ctx) => ({
      event: await ctx.db.get(event as never),
      dropped: await ctx.db.get(drop as never),
      terms: (
        (await ctx.db.query("venueCommissionTerms").collect()) as Array<{
          venueId: string;
        }>
      ).filter((term) => term.venueId === keep),
    }))) as {
      event: Record<string, unknown>;
      dropped: Record<string, unknown>;
      terms: unknown[];
    };
    expect(rows.event.venueId).toBe(keep);
    expect(rows.event.venueName).toBe("Riverfront Park Pavilion");
    expect(rows.dropped.deletedAt).not.toBeNull();
    expect(rows.terms).toHaveLength(1);
  });

  it("refuses when both venues hold an active term for the same dates", async () => {
    const { proof, admin, keep, drop } = await setup();
    for (const [venueId, commissionPercent] of [
      [drop, 10],
      [keep, 15],
    ] as const) {
      await proof.executeCommand(admin, M.VenueCommissionTerm_createViaDefine, {
        venueId,
        commissionPercent,
        effectiveStartDate: Date.now() - 10 * DAY,
      });
    }
    await expect(
      admin.mutation(api.venueMerge.mergeInto, {
        duplicateVenueId: drop as never,
        targetVenueId: keep as never,
        reason: "Same pavilion",
      }),
    ).rejects.toThrow(/same dates/);
  });
});
