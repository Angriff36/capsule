/**
 * Shared event gallery rules (Venue Partner Playbook section 06): captions
 * carry the occasion and month only, food photos come first, links cannot
 * be guessed.
 */
import { describe, expect, it } from "vitest";
import {
  galleryCaption,
  galleryFileName,
  isGalleryFile,
  newGalleryToken,
  sortForGallery,
} from "../../src/features/facilities/venueGallery";
import { packetPhotos } from "../../src/features/facilities/venueInfoPacket";
import { shotCounts } from "../../src/features/facilities/venueSiteVisit";

describe("shared event gallery", () => {
  it("captions show the occasion and month, never a name", () => {
    const june = Date.UTC(2026, 5, 15, 18);
    expect(galleryCaption("Wedding", june)).toBe("Wedding · June 2026");
    expect(galleryCaption(null, june)).toBe("June 2026");
    expect(galleryCaption("  ", null)).toBe("Event");
    const name = galleryFileName("Wedding · June 2026", "IMG_1.jpg");
    expect(name).toBe("Event gallery - Wedding · June 2026 - IMG_1.jpg");
    expect(isGalleryFile(name)).toBe(true);
    expect(isGalleryFile("Kitchen - IMG_1.jpg")).toBe(false);
  });

  it("food photos first, then the newest event", () => {
    const sorted = sortForGallery([
      { id: "setup-new", evidenceType: "setup", eventStartsAt: 300 },
      { id: "food-old", evidenceType: "food", eventStartsAt: 100 },
      { id: "untagged", evidenceType: null, eventStartsAt: 200 },
      { id: "food-new", evidenceType: "food", eventStartsAt: 200 },
    ]);
    expect(sorted.map((photo) => photo.id)).toEqual([
      "food-new",
      "food-old",
      "setup-new",
      "untagged",
    ]);
  });

  it("links are 32 random characters and differ each time", () => {
    const a = newGalleryToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/u);
    expect(newGalleryToken()).not.toBe(a);
  });

  it("gallery photos may go in the venue info packet and are not site visit shots", () => {
    const file = {
      _id: "1",
      fileName: galleryFileName("Wedding · June 2026", "plates.jpg"),
      contentType: "image/jpeg",
      url: "https://x/1",
    };
    expect(packetPhotos([file])).toHaveLength(1);
    expect(shotCounts([file])).toEqual({});
  });
});
