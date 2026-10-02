/**
 * Runtime proof (AC-312, CF-8.1-01): a venue carries every §8.1 fact through
 * register / revise / setSiteFacts, and the detail page's panels read
 * them back - rooms, notes, photos and files, plus the operating facts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { harness, hireStaff, M } from "./venue-notes.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const FULL_PROFILE = {
  name: "Riverside Barn",
  venueType: "outdoor",
  capacity: 220,
  onPremise: false,
  kitchenAccess: "Warming kitchen only",
  parkingAvailable: true,
  hasFreightElevator: false,
  storageAvailable: true,
  logisticsNotes: "Gravel lane, no box trucks after rain",
  loadInInstructions: "Side barn door, ramp on the left",
  powerAvailable: true,
  waterAccess: false,
  hasStairs: true,
  wasteRules: "Carry out all food waste",
  permitsInsuranceNotes: "Certificate naming the farm, $2M",
  restrictions: "No open flame inside the barn",
  addressLine1: "4 Mill Rd",
  city: "Hudson",
  region: "NY",
  postalCode: "12534",
  countryCode: "US",
  latitude: 42.25,
  longitude: -73.79,
  contactName: "Dana Barn",
  contactEmail: "dana@barn.example",
  contactPhone: "555-0101",
  accessNotes: "Gate code 4412",
  cateringNotes: "Owner prefers family style",
} as const;

describe("runtime proof: venue profile carries every §8.1 fact", () => {
  it("register, revise and operating facts read back on the detail page reads", async () => {
    const proof = harness();
    const tenantId = "tenant-ac312-venue-profile";
    const manager = proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    });

    const venue = (await proof.executeCommand(
      manager,
      M.Venue_createViaRegister,
      FULL_PROFILE,
    )) as { docId: string };
    await proof.executeCommand(manager, M.Venue_setSiteFacts, {
      docId: venue.docId,
      seatedCapacity: 160,
      standingCapacity: 220,
      hasOven: false,
      hasRefrigeration: true,
      loadInFrom: " 07:30 ",
      loadOutBy: "23:00",
    });

    const read = (await manager.query(api.queries.getVenue, {
      id: venue.docId as never,
    })) as Record<string, unknown>;
    for (const [key, value] of Object.entries(FULL_PROFILE)) {
      expect(read[key], key).toEqual(value);
    }
    expect(read.seatedCapacity).toBe(160);
    expect(read.standingCapacity).toBe(220);
    expect(read.hasOven).toBe(false);
    expect(read.hasRefrigeration).toBe(true);
    expect(read.loadInFrom).toBe("07:30");
    expect(read.loadOutBy).toBe("23:00");

    // The details form leaves the operating facts alone.
    const { capacity: _capacity, ...details } = FULL_PROFILE;
    await proof.executeCommand(manager, M.Venue_updateDetails, {
      docId: venue.docId,
      ...details,
      name: "Riverside Barn & Orchard",
    });
    const revised = (await manager.query(api.queries.getVenue, {
      id: venue.docId as never,
    })) as Record<string, unknown>;
    expect(revised.name).toBe("Riverside Barn & Orchard");
    expect(revised.seatedCapacity).toBe(160);
    expect(revised.loadInFrom).toBe("07:30");

    // A blank clears one fact; a negative count is refused in plain words.
    await proof.executeCommand(manager, M.Venue_setSiteFacts, {
      docId: venue.docId,
      seatedCapacity: 160,
      standingCapacity: 220,
      hasOven: false,
      hasRefrigeration: true,
      loadInFrom: "",
      loadOutBy: "23:00",
    });
    const cleared = (await manager.query(api.queries.getVenue, {
      id: venue.docId as never,
    })) as Record<string, unknown>;
    expect(cleared.loadInFrom ?? null).toBeNull();
    await expect(
      proof.executeCommand(manager, M.Venue_setSiteFacts, {
        docId: venue.docId,
        seatedCapacity: -1,
      }),
    ).rejects.toThrow(/Seated capacity can't be negative/);

    // Rooms panel.
    await proof.executeCommand(manager, M.VenueRoom_createViaAdd, {
      venueId: venue.docId,
      name: "Hay loft",
      roomType: "dining",
      capacity: 90,
      squareFootage: 1800,
    });
    const rooms = (await manager.query(
      api.queries.listVenueRoom,
      {},
    )) as Array<{ venueId: string; name: string; capacity: number }>;
    expect(
      rooms.filter((room) => room.venueId === venue.docId).map((r) => r.name),
    ).toEqual(["Hay loft"]);

    // Notes panel.
    const author = await hireStaff(proof, tenantId, "author", "event_manager");
    const writer = proof.asRole({
      subject: author.authSubjectId,
      role: "event_manager",
      tenantId,
    });
    await proof.executeCommand(writer, M.VenueNote_createViaPost, {
      venueId: venue.docId,
      category: "logistics",
      content: "Bring extension cords - one outlet per wall",
      visibility: "internal",
    });
    const notes = (await writer.query(api.queries.listVenueNote, {})) as Array<{
      venueId: string;
      content: string;
    }>;
    expect(
      notes
        .filter((note) => note.venueId === venue.docId)
        .map((note) => note.content),
    ).toContain("Bring extension cords - one outlet per wall");

    // Photos and files: a venue can carry an attachment and the page lists it.
    const storageId = await manager.run(async (ctx) =>
      (
        ctx as unknown as {
          storage: { store: (blob: Blob) => Promise<string> };
        }
      ).storage.store(new Blob(["floor plan"])),
    );
    await proof.executeCommand(manager, M.Attachment_createViaAttach, {
      parentType: "venue",
      parentId: venue.docId,
      fileName: "floor-plan.pdf",
      contentType: "application/pdf",
      fileSize: 10,
      storageId,
    });
    const files = (await manager.query(api.fileStorage.listForParent, {
      parentType: "venue",
      parentId: venue.docId,
    })) as Array<{ fileName: string; url: string | null }>;
    expect(files.map((file) => file.fileName)).toEqual(["floor-plan.pdf"]);
    expect(files[0].url).not.toBeNull();
  });
});
