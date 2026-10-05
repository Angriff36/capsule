/**
 * Runtime proof: a website inquiry's typed venue joins the saved venue
 * (PL-NATIVE-JOURNEY AC-184, venue leg). Converting the inquiry links the
 * event to a saved venue only when exactly one saved venue has that name and
 * an address to drive to; a saved venue with no address, or two venues with
 * the same name, leave the event with the typed name and address only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};

async function convertInquiry(tenantId: string, venues: object[]) {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  const owner = proof.asRole({
    subject: `owner-${tenantId}`,
    role: "owner",
    tenantId,
  });
  await proof.executeCommand(
    owner,
    api.mutations.Organization_createViaRegister,
    { name: "Inquiry venue kitchen" },
  );
  const venueIds: string[] = [];
  for (const venue of venues) {
    const created = (await proof.executeCommand(
      owner,
      api.mutations.Venue_createViaRegister,
      { venueType: "other", capacity: 150, ...venue } as never,
    )) as { docId: string };
    venueIds.push(created.docId);
  }
  const actions = owner as unknown as ActionRunner;
  const submitted = (await actions.action(api.quoteBuilder.submitQuote, {
    clientName: "Rae Visitor",
    email: `rae-${tenantId}@example.com`,
    eventDate: Date.UTC(2026, 10, 7, 17, 0),
    guestCount: 80,
    consent: true,
    venueName: "  orchard barn ",
    venueAddress: "12 Quarry Lane",
  })) as { submissionId: string };
  const converted = (await actions.action(
    api.quoteBuilder.processQuoteSubmission,
    { submissionId: submitted.submissionId },
  )) as { eventId: string | null; errors: string[] };
  expect(converted.errors).toEqual([]);
  const event = (await owner.run(async (ctx) =>
    ctx.db.get(converted.eventId as never),
  )) as { venueId?: string | null; venueName?: string; venueAddress?: string };
  return { event, venueIds };
}

describe("runtime proof: website inquiry venue link (AC-184)", () => {
  it("links the one saved venue with that name and an address", async () => {
    const { event, venueIds } = await convertInquiry("tenant-inquiry-venue-a", [
      {
        name: "Orchard Barn",
        addressLine1: "12 Quarry Lane",
        city: "Spokane",
      },
      { name: "Hillside Hall", addressLine1: "4 Hill Road", city: "Spokane" },
    ]);
    expect(event.venueId).toBe(venueIds[0]);
    expect(event.venueName).toBe("orchard barn");
    expect(event.venueAddress).toBe("12 Quarry Lane");
  });

  it("links a saved venue with only a map pin", async () => {
    const { event, venueIds } = await convertInquiry("tenant-inquiry-venue-b", [
      { name: "Orchard Barn", latitude: 47.66, longitude: -117.43 },
    ]);
    expect(event.venueId).toBe(venueIds[0]);
  });

  it("keeps the typed address when the saved venue has none", async () => {
    const { event } = await convertInquiry("tenant-inquiry-venue-c", [
      { name: "Orchard Barn" },
    ]);
    expect(event.venueId ?? null).toBeNull();
    expect(event.venueAddress).toBe("12 Quarry Lane");
  });

  it("does not pick one of two venues with the same name", async () => {
    const { event } = await convertInquiry("tenant-inquiry-venue-d", [
      { name: "Orchard Barn", addressLine1: "12 Quarry Lane", city: "Spokane" },
      { name: "ORCHARD BARN", addressLine1: "9 Other Way", city: "Cheney" },
    ]);
    expect(event.venueId ?? null).toBeNull();
  });
});
