/**
 * Runtime proof: the venue partner program (work/mangia-venue-partner-playbook.pdf).
 * A venue gets a partnership tier, one relationship owner and 1-10 ratings;
 * check-ins and problems go in the venue file as notes; a referral source is
 * tied to the venue; the partner scorecard reads all of it back.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { partnerScorecard } from "../../src/features/facilities/venuePartnership";
import {
  harness,
  hireStaff,
  M,
  registerVenue,
} from "./venue-notes.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type VenueRow = {
  _id: string;
  version: number;
  partnerTier?: string | null;
  partnerOwnerPersonId?: string | null;
  partnerSince?: number | null;
  opsEaseScore?: number | null;
  relationshipScore?: number | null;
};

describe("runtime proof: venue partner program", () => {
  it("tier, owner, ratings, check-ins, problems and the referral link read back on the scorecard", async () => {
    const proof = harness();
    const tenantId = "tenant-venue-partner";
    const manager = proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    });
    const rep = await hireStaff(proof, tenantId, "Kayden", "event_staff");
    const repActor = proof.asRole({
      subject: rep.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const venueId = await registerVenue(proof, manager, "Kindred + Co.", 180);
    const read = async () =>
      (await manager.query(api.queries.getVenue, {
        id: venueId as never,
      })) as VenueRow;

    await proof.executeCommand(manager, M.Venue_setPartnership, {
      docId: venueId,
      partnerTier: "full_event",
      partnerOwnerPersonId: rep.personId,
      opsEaseScore: 8,
      relationshipScore: 9,
    });
    const partner = await read();
    expect(partner.partnerTier).toBe("full_event");
    expect(partner.partnerOwnerPersonId).toBe(rep.personId);
    expect(partner.opsEaseScore).toBe(8);
    expect(partner.relationshipScore).toBe(9);
    expect(typeof partner.partnerSince).toBe("number");

    // A rating outside 1-10 is refused with a plain reason.
    await expect(
      proof.executeCommand(manager, M.Venue_setPartnership, {
        docId: venueId,
        partnerTier: "full_event",
        opsEaseScore: 11,
      }),
    ).rejects.toThrow(/1 to 10/);

    // Changing the tier keeps the start date; ending the partnership clears it.
    await proof.executeCommand(manager, M.Venue_setPartnership, {
      docId: venueId,
      partnerTier: "catering_rentals",
      partnerOwnerPersonId: rep.personId,
      opsEaseScore: 8,
      relationshipScore: 9,
    });
    expect((await read()).partnerSince).toBe(partner.partnerSince);

    // The rep logs a check-in and a problem in the venue file.
    for (const [category, content] of [
      ["check_in", "Called Sarah: two June weddings booked."],
      ["incident", "Scuffed the dance floor on load-out; repair booked."],
    ] as const) {
      await proof.executeCommand(repActor, M.VenueNote_createViaPost, {
        venueId,
        category,
        content,
        visibility: "internal",
      });
    }

    // A sales manager ties a lead source to the venue.
    const sales = proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    });
    const source = (await proof.executeCommand(
      sales,
      M.ReferralSource_createViaRegister,
      { name: "Kindred + Co. (venue referral)", code: `venue-${venueId}` },
    )) as { docId: string };
    await proof.executeCommand(sales, M.ReferralSource_linkVenue, {
      docId: source.docId,
      venueId,
    });

    const venue = await read();
    const notes = (await manager.query(
      api.queries.listVenueNote,
      {},
    )) as never[];
    const sources = (await sales.query(api.queries.listReferralSource, {})) as {
      _id: string;
      venueId?: string | null;
    }[];
    expect(sources.find((row) => row._id === source.docId)?.venueId).toBe(
      venueId,
    );
    const now = Date.now();
    const card = partnerScorecard({
      venue,
      events: [],
      notes,
      referralSources: sources,
      leads: [
        { referralSourceId: source.docId, capturedAt: now, convertedAt: now },
        { referralSourceId: source.docId, capturedAt: now },
      ],
      now,
    });
    expect(card.lastContactAt).not.toBeNull();
    expect(card.contactOverdue).toBe(false);
    expect(card.problemsLast90Days).toBe(1);
    expect(card.referralsSent).toBe(2);
    expect(card.referralsBooked).toBe(1);
    expect(card.grade).toBe("A");

    await proof.executeCommand(manager, M.Venue_setPartnership, {
      docId: venueId,
    });
    const ended = await read();
    expect(ended.partnerTier ?? null).toBeNull();
    expect(ended.partnerSince ?? null).toBeNull();
  });

  it("a dish can be offered only at one venue, then anywhere again", async () => {
    const proof = harness();
    const tenantId = "tenant-venue-exclusive";
    const manager = proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    });
    const kitchen = proof.asRole({
      subject: `kitchen-${tenantId}`,
      role: "kitchen_manager",
      tenantId,
    });
    const venueId = await registerVenue(proof, manager, "Kindred + Co.", 180);
    const dish = (await proof.executeCommand(
      kitchen,
      M.Dish_createViaIntroduce,
      {
        name: "Kindred Charcuterie Tower",
        portionSize: 1,
        portionUnit: "portion",
      },
    )) as { docId: string };
    const read = async () =>
      (await kitchen.query(api.queries.getDish, {
        id: dish.docId as never,
      })) as {
        exclusiveVenueId?: string | null;
      };

    await proof.executeCommand(kitchen, M.Dish_setExclusiveVenue, {
      docId: dish.docId,
      venueId,
    });
    expect((await read()).exclusiveVenueId).toBe(venueId);

    await proof.executeCommand(kitchen, M.Dish_setExclusiveVenue, {
      docId: dish.docId,
    });
    expect((await read()).exclusiveVenueId ?? null).toBeNull();
  });
});
