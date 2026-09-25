/**
 * Runtime proof (AC-234): a booked Event stores every mapped TPP field as a
 * linked id (or a real date / guest number), not loose typed copies —
 * startsAt/endsAt/expectedHeadcount as sent, and occasionId, serviceStyleId,
 * venueId, assignedToId (salesperson), referralSourceId, clientId pointing at
 * the live rows the create-page selectors resolved. A book without the
 * optional catalog ids (empty salesperson / referral dropdown) still creates
 * the Event.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-ac234-tpp-fields",
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
type Owner = ReturnType<Proof["asRole"]>;

async function readRow<T>(owner: Owner, id: string) {
  return (await owner.run(async (ctx) => ctx.db.get(id as never))) as T & {
    deletedAt: number | null;
  };
}

describe("runtime proof: Event stores mapped TPP fields as linked ids (AC-234)", () => {
  it("stores occasion, style, venue, salesperson, and referral as linked ids", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-ac234-tpp-fields",
      role: "owner",
      tenantId: S.tenantId,
    });

    // Seed every catalog row the create form's selectors read.
    const client = (await proof.executeCommand(
      owner,
      M.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Harper Party Co",
      },
    )) as { docId: string };
    const style = (await proof.executeCommand(
      owner,
      M.ServiceStyle_createViaRegister,
      { name: "Full Service", code: "FULL_SERVICE", sortOrder: 10 },
    )) as { docId: string };
    const occasion = (await proof.executeCommand(
      owner,
      M.Occasion_createViaRegister,
      { name: "Wedding", code: "WEDDING", sortOrder: 5 },
    )) as { docId: string };
    const venue = (await proof.executeCommand(
      owner,
      M.Venue_createViaRegister,
      {
        name: "Garden Hall",
        venueType: "other",
        capacity: 80,
        addressLine1: "100 Oak St",
      },
    )) as { docId: string };
    const referral = (await proof.executeCommand(
      owner,
      M.ReferralSource_createViaRegister,
      { name: "Repeat client", code: "REPEAT", sortOrder: 1 },
    )) as { docId: string };
    const person = (await proof.executeCommand(owner, M.Person_createViaHire, {
      givenName: "Pat",
      familyName: "Owner",
      email: "pat-owner-ac234@proof.example",
      role: "staff",
      employmentType: "full_time",
    })) as { docId: string };

    const event = (await proof.executeCommand(
      owner,
      M.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        venueId: venue.docId,
        venueName: "Garden Hall",
        venueAddress: "100 Oak St",
        venueCapacity: 80,
        title: "Orchard wedding",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 90,
        primaryContactName: "Robin Planner",
        budgetAmount: 9000,
        quotedPrice: 10500,
        serviceStyleId: style.docId,
        occasionId: occasion.docId,
        assignedToId: person.docId,
        ownerName: "Pat Owner",
        referralSourceId: referral.docId,
      },
    )) as { docId: string };

    const saved = await readRow<{
      startsAt: number;
      endsAt: number;
      expectedHeadcount: number;
      clientId: string | null;
      venueId: string | null;
      occasionId: string | null;
      serviceStyleId: string | null;
      assignedToId: string | null;
      referralSourceId: string | null;
    }>(owner, event.docId);

    // Real values, not text copies of the catalog names.
    expect(saved.startsAt).toBe(S.startsAt);
    expect(saved.endsAt).toBe(S.endsAt);
    expect(saved.expectedHeadcount).toBe(90);
    expect(saved.clientId).toBe(client.docId);
    expect(saved.venueId).toBe(venue.docId);
    expect(saved.occasionId).toBe(occasion.docId);
    expect(saved.serviceStyleId).toBe(style.docId);
    expect(saved.assignedToId).toBe(person.docId);
    expect(saved.referralSourceId).toBe(referral.docId);

    // Each id resolves back to the live row it came from — the event holds
    // links, and the rows really exist.
    const clientRow = await readRow<{ companyName: string }>(
      owner,
      saved.clientId as string,
    );
    expect(clientRow.companyName).toBe("Harper Party Co");
    expect(clientRow.deletedAt ?? null).toBeNull();

    const venueRow = await readRow<{ name: string; code?: string }>(
      owner,
      saved.venueId as string,
    );
    expect(venueRow.name).toBe("Garden Hall");
    expect(venueRow.deletedAt ?? null).toBeNull();

    const occasionRow = await readRow<{ name: string; code: string }>(
      owner,
      saved.occasionId as string,
    );
    expect(occasionRow.name).toBe("Wedding");
    expect(occasionRow.code).toBe("WEDDING");
    expect(occasionRow.deletedAt ?? null).toBeNull();

    const styleRow = await readRow<{ name: string; code: string }>(
      owner,
      saved.serviceStyleId as string,
    );
    expect(styleRow.name).toBe("Full Service");
    expect(styleRow.code).toBe("FULL_SERVICE");
    expect(styleRow.deletedAt ?? null).toBeNull();

    const personRow = await readRow<{
      givenName: string;
      familyName: string;
    }>(owner, saved.assignedToId as string);
    expect(personRow.givenName).toBe("Pat");
    expect(personRow.familyName).toBe("Owner");
    expect(personRow.deletedAt ?? null).toBeNull();

    const referralRow = await readRow<{ name: string; code: string }>(
      owner,
      saved.referralSourceId as string,
    );
    expect(referralRow.name).toBe("Repeat client");
    expect(referralRow.code).toBe("REPEAT");
    expect(referralRow.deletedAt ?? null).toBeNull();
  });

  it("books without salesperson or referral when those catalogs are empty", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-ac234-empty-optional",
      role: "owner",
      tenantId: "tenant-ac234-empty-optional",
    });

    const client = (await proof.executeCommand(
      owner,
      M.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Bare Booking Client",
      },
    )) as { docId: string };
    const venue = (await proof.executeCommand(
      owner,
      M.Venue_createViaRegister,
      {
        name: "Bare Barn",
        venueType: "other",
        capacity: 50,
        addressLine1: "7 Elm St",
      },
    )) as { docId: string };

    const event = (await proof.executeCommand(
      owner,
      M.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        venueId: venue.docId,
        venueName: "Bare Barn",
        venueAddress: "7 Elm St",
        venueCapacity: 50,
        title: "Bare booking",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 40,
        primaryContactName: "Casey Planner",
        budgetAmount: 2000,
        quotedPrice: 2500,
      },
    )) as { docId: string };

    const saved = await readRow<{
      expectedHeadcount: number;
      assignedToId: string | null;
      referralSourceId: string | null;
    }>(owner, event.docId);
    expect(saved.expectedHeadcount).toBe(40);
    expect(saved.assignedToId ?? null).toBeNull();
    expect(saved.referralSourceId ?? null).toBeNull();
  });
});
