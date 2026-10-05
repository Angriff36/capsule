/**
 * Runtime proof: the venue selling profile (Venue Partner Playbook section
 * 09). Every line saves trimmed, the look is one of the playbook's venue
 * looks, a blank clears a line, and the profile reads back as plain lines
 * with the food look and serve style from the alignment guide.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  hasSellingProfile,
  sellingProfileLines,
  type VenueSellingProfile,
} from "../../src/features/facilities/venueSellingProfile";
import { harness, M, registerVenue } from "./venue-notes.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: venue selling profile", () => {
  it("saves the profile trimmed, clears blanks, and reads back with the food look", async () => {
    const proof = harness();
    const tenantId = "tenant-venue-selling-profile";
    const manager = proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    });
    const venueId = await registerVenue(proof, manager, "Kindred + Co.", 180);
    const venueRow = async () =>
      (
        (await manager.query(api.queries.listVenue, {})) as Array<
          VenueSellingProfile & { _id: string; name: string }
        >
      ).find((row) => row._id === venueId)!;

    expect(hasSellingProfile(await venueRow())).toBe(false);

    await proof.executeCommand(manager, M.Venue_setSellingProfile, {
      docId: venueId,
      vibe: "warehouse_raw",
      vibeWords: " Rustic industrial warehouse ",
      topFeature: "The brick wall",
      otherFeatures: "Rooftop patio",
      targetClient: "Young couples who want a loft feel",
      competitivePosition: "Only loft in town with a full kitchen",
      photoFocus: "Food against the brick wall",
      exclusiveItemIdea: "Skyline ceviche bar",
    });
    const saved = await venueRow();
    expect(saved.vibe).toBe("warehouse_raw");
    expect(saved.vibeWords).toBe("Rustic industrial warehouse");
    const lines = sellingProfileLines(saved);
    expect(lines.map((line) => line.label)).toEqual([
      "Look",
      "What makes it special",
      "Also worth showing",
      "Who books it",
      "Food look",
      "Best serve style",
      "Only-here dish idea",
      "Against other venues",
      "Photo focus",
    ]);
    expect(lines[0]!.text).toBe(
      "Warehouse / open space: Rustic industrial warehouse",
    );
    expect(lines.find((line) => line.label === "Best serve style")?.text).toBe(
      "Food-truck style stations, action stations, hands-on",
    );

    // The whole profile is stated on each save: blanks clear their line.
    await proof.executeCommand(manager, M.Venue_setSellingProfile, {
      docId: venueId,
      topFeature: "The brick wall",
      photoFocus: " ",
    });
    const cleared = await venueRow();
    expect(cleared.vibe ?? null).toBeNull();
    expect(cleared.photoFocus ?? null).toBeNull();
    expect(cleared.vibeWords ?? null).toBeNull();
    expect(sellingProfileLines(cleared)).toEqual([
      { label: "What makes it special", text: "The brick wall" },
    ]);

    // A look that is not in the guide is refused.
    await expect(
      proof.executeCommand(manager, M.Venue_setSellingProfile, {
        docId: venueId,
        vibe: "castle",
      }),
    ).rejects.toThrow();
  });
});
