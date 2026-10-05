import { describe, expect, it } from "vitest";
import {
  packetFacts,
  packetPhotos,
} from "../../src/features/facilities/venueInfoPacket";

const file = (id: string, fileName: string, contentType = "image/jpeg") => ({
  _id: id,
  fileName,
  contentType,
  url: `https://files/${id}`,
});

describe("venue info packet (playbook sections 06 and 10)", () => {
  it("keeps client-safe pictures and leaves out crew-only shots and other files", () => {
    const kept = packetPhotos([
      file("1", "Exterior - front.jpg"),
      file("2", "Kitchen - ovens.jpg"),
      file("3", "Damage - wall.jpg"),
      file("4", "load-in path - door.jpg"),
      file("5", "Restrooms - hall.jpg"),
      file("6", "Wow features - fireplace.jpg"),
      file("7", "wedding table.png", "image/png"),
      file("8", "floor plan.pdf", "application/pdf"),
      { ...file("9", "Main space - room.jpg"), url: null },
    ]);
    expect(kept.map((f) => f._id)).toEqual(["1", "6", "7"]);
  });

  it("writes only client-facing facts, blanks left out", () => {
    expect(
      packetFacts({
        addressLine1: "12 Vine St",
        city: "Napa",
        region: "CA",
        postalCode: "94558",
        capacity: 200,
        seatedCapacity: 150,
        vibe: "garden_outdoor",
        vibeWords: " Vineyard terrace ",
        topFeature: "Sunset over the vines",
        otherFeatures: "",
        targetClient: "Couples who want an outdoor wedding",
      }).map((fact) => `${fact.label}: ${fact.text}`),
    ).toEqual([
      "Where: 12 Vine St, Napa, CA 94558",
      "Guests: 150 seated",
      "The look: Garden / outdoor — Vineyard terrace",
      "What guests remember: Sunset over the vines",
      "A great fit for: Couples who want an outdoor wedding",
      "How we serve here: Stations, family style, passed starters during the cocktail hour",
      "How the food looks here: Fresh herbs, edible flowers, natural wood, garden-to-table look",
    ]);
    expect(packetFacts({ capacity: 80 })).toEqual([
      { label: "Guests", text: "Up to 80 guests" },
    ]);
    expect(packetFacts({ capacity: 0 })).toEqual([]);
  });
});
