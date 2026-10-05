/**
 * Runtime proof: shared event gallery (work/mangia-venue-partner-playbook.pdf,
 * section 06: "professional photos from joint events, shared with venue for
 * their marketing"). Staff see the photos from events at a venue, pick some
 * into the venue gallery, and give the venue one link. The link shows only
 * the picked photos with an occasion + month caption, works without the
 * company's sign-in, stops when sharing stops, and never shows a file another
 * company owns.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  M,
  rolesFor,
  run,
  seedVenueEvent,
  type Role,
} from "./venue-layout.runtime.helpers";

const TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

async function storeBlob(role: Role, text: string): Promise<string> {
  return (await role.run((ctx: any) =>
    ctx.storage.store(new Blob([text], { type: "image/png" })),
  )) as string;
}

describe("runtime proof: shared event gallery", () => {
  it("picked event photos show on the venue's link; nothing else does", async () => {
    const proof = harness();
    const tenantId = "tenant-gallery";
    const { roles, venueId, eventId } = await seedVenueEvent(proof, tenantId);
    const attach = async (
      parentType: string,
      parentId: string,
      fileName: string,
      storageId: string,
      evidenceType?: string,
    ) =>
      run(proof, roles.events, M.Attachment_createViaAttach, {
        parentType,
        parentId,
        fileName,
        contentType: "image/png",
        fileSize: 10,
        storageId,
        ...(evidenceType ? { evidenceType } : {}),
      });

    const food = await storeBlob(roles.owner, "food-photo");
    const setup = await storeBlob(roles.owner, "setup-photo");
    await attach("eventRecord", eventId, "plates.png", food, "food");
    await attach("eventRecord", eventId, "tables.png", setup, "setup");

    // Staff see both event photos, with the event they came from.
    const picks = (await roles.events.query(api.venueGallery.eventPhotos, {
      venueId: venueId as never,
    })) as any[];
    expect(picks.map((photo) => photo.fileName).sort()).toEqual([
      "plates.png",
      "tables.png",
    ]);
    expect(picks[0]).toMatchObject({
      eventTitle: "Garden dinner",
      url: expect.any(String),
    });

    // Another company sees none of them.
    const other = rolesFor(proof, "tenant-gallery-other");
    expect(
      await other.events.query(api.venueGallery.eventPhotos, {
        venueId: venueId as never,
      }),
    ).toEqual([]);

    // Pick the food photo into the gallery; a site visit kitchen shot stays out.
    await attach(
      "venue",
      venueId,
      "Event gallery - corporate dinner · June 2026 - plates.png",
      food,
    );
    await attach("venue", venueId, "Kitchen - walk-in.png", setup);

    const shared = (tokenValue: string, role: Role = other.owner) =>
      role.query(api.venueGallery.getShared, {
        token: tokenValue,
      }) as Promise<any>;

    // Not shared yet: the link finds nothing.
    expect(await shared(TOKEN)).toBeNull();

    // Too short to be a link.
    await expect(
      proof.executeCommand(roles.events, M.Venue_setGalleryToken, {
        docId: venueId,
        galleryToken: "short",
      }),
    ).rejects.toThrow(/too short/u);

    await proof.executeCommand(roles.events, M.Venue_setGalleryToken, {
      docId: venueId,
      galleryToken: TOKEN,
    });
    // Anyone holding the link (here: someone from another company) sees it.
    const page = await shared(TOKEN);
    expect(page.venueName).toBe("Garden Hall");
    expect(page.photos).toEqual([
      {
        id: expect.any(String),
        url: expect.any(String),
        caption: "corporate dinner · June 2026",
      },
    ]);
    expect(JSON.stringify(page)).not.toContain("Venue client");
    expect(await shared(TOKEN.slice(0, 20))).toBeNull();

    // A file another company owns never shows, even when linked here.
    const foreign = await storeBlob(roles.owner, "someone-elses");
    await roles.owner.run((ctx: any) =>
      ctx.db.insert("attachments", {
        tenantId: "tenant-someone-else",
        storageId: foreign,
        parentType: "venue",
        parentId: "other-venue",
        fileName: "theirs.png",
        contentType: "image/png",
        fileSize: 10,
        uploadedAt: Date.now(),
        version: 1,
      }),
    );
    await attach(
      "venue",
      venueId,
      "Event gallery - Wedding - theirs.png",
      foreign,
    );
    expect((await shared(TOKEN)).photos).toHaveLength(1);

    // Stop sharing: the link stops working.
    await proof.executeCommand(roles.events, M.Venue_setGalleryToken, {
      docId: venueId,
    });
    expect(await shared(TOKEN)).toBeNull();
  });
});
