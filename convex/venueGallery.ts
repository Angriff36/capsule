// AUTHOR-OWNED — shared event gallery (Venue Partner Playbook section 06:
// "professional photos from joint events, shared with the venue for their
// marketing"). Staff pick photos from events at a venue; each pick is a venue
// Attachment named "Event gallery - <caption> - <file>" that points at the
// same stored file. The venue opens one link (Venue.galleryToken) to see and
// save those photos, without signing in.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  storageNotOwnedElsewhere,
  storageReferencedByTenant,
} from "./fileStorage";

const GALLERY_PREFIX = "event gallery - ";
const MIN_TOKEN_LENGTH = 24;
const MAX_PHOTOS = 300;

const isImage = (contentType: string) => contentType.startsWith("image/");

/** "Wedding · June 2026" from "Event gallery - Wedding · June 2026 - a.jpg". */
function galleryCaption(fileName: string): string | null {
  if (!fileName.toLowerCase().startsWith(GALLERY_PREFIX)) return null;
  const rest = fileName.slice(GALLERY_PREFIX.length);
  const cut = rest.indexOf(" - ");
  return cut > 0 ? rest.slice(0, cut).trim() : "";
}

async function storageUrl(
  ctx: QueryCtx,
  storageId: string,
): Promise<string | null> {
  const id = ctx.db.system.normalizeId("_storage", storageId);
  return id ? await ctx.storage.getUrl(id) : null;
}

/**
 * Photos staff took at events held at this venue (the event photo gallery),
 * newest event first, for picking the venue gallery. Own company only.
 */
export const eventPhotos = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, { venueId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return [];
    const venue = await ctx.db.get(venueId);
    if (!venue || venue.deletedAt != null || venue.tenantId !== auth.tenantId)
      return [];
    const events = (
      await ctx.db
        .query("events")
        .withIndex("by_venueId", (q) => q.eq("venueId", venueId))
        .collect()
    )
      .filter((row) => row.tenantId === auth.tenantId && row.deletedAt == null)
      .sort((a, b) => Number(b.startsAt ?? 0) - Number(a.startsAt ?? 0));

    const photos = [];
    for (const event of events) {
      const rows = await ctx.db
        .query("attachments")
        .withIndex("by_parentId", (q) => q.eq("parentId", String(event._id)))
        .collect();
      for (const row of rows) {
        if (
          row.tenantId !== auth.tenantId ||
          row.parentType !== "eventRecord" ||
          row.deletedAt != null ||
          !isImage(row.contentType)
        )
          continue;
        if (
          !(await storageReferencedByTenant(ctx, auth.tenantId, row.storageId))
        )
          continue;
        photos.push({
          attachmentId: row._id,
          storageId: row.storageId,
          fileName: row.fileName,
          contentType: row.contentType,
          fileSize: row.fileSize,
          evidenceType: row.evidenceType ?? null,
          url: await storageUrl(ctx, row.storageId),
          eventTitle: event.title,
          eventType: event.occasionName ?? event.eventType ?? null,
          eventStartsAt: event.startsAt ?? null,
        });
        if (photos.length >= MAX_PHOTOS) return photos;
      }
    }
    return photos;
  },
});

/**
 * The venue's shared gallery by its link token. Public: the token is the
 * only key. Shows the company and venue names and logos and the picked
 * photos with a caption (occasion and month) — never client names.
 */
export const getShared = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const clean = token.trim();
    if (clean.length < MIN_TOKEN_LENGTH) return null;
    const venue = (
      await ctx.db
        .query("venues")
        .withIndex("by_galleryToken", (q) => q.eq("galleryToken", clean))
        .take(2)
    ).find((row) => row.deletedAt == null);
    if (!venue) return null;
    const tenantId = venue.tenantId;

    const organizations = await ctx.db
      .query("organizations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
    const organization =
      organizations.find(
        (row) => row.deletedAt == null && String(row.status) === "active",
      ) ?? organizations.find((row) => row.deletedAt == null);
    const companyLogoStorageId = organization?.brandLogoStorageId;
    const venueLogoStorageId = venue.logoStorageId;

    const rows = await ctx.db
      .query("attachments")
      .withIndex("by_parentId", (q) => q.eq("parentId", String(venue._id)))
      .collect();
    const photos = [];
    for (const row of rows.sort(
      (a, b) => Number(b.uploadedAt ?? 0) - Number(a.uploadedAt ?? 0),
    )) {
      const caption = galleryCaption(row.fileName);
      if (
        caption === null ||
        row.tenantId !== tenantId ||
        row.parentType !== "venue" ||
        row.deletedAt != null ||
        !isImage(row.contentType)
      )
        continue;
      if (!(await storageReferencedByTenant(ctx, tenantId, row.storageId)))
        continue;
      const url = await storageUrl(ctx, row.storageId);
      if (url) photos.push({ id: row._id as Id<"attachments">, url, caption });
      if (photos.length >= MAX_PHOTOS) break;
    }

    return {
      venueName: venue.name,
      venueColor:
        typeof venue.brandColor === "string" &&
        /^#[0-9a-f]{6}$/iu.test(venue.brandColor)
          ? venue.brandColor
          : null,
      venueLogoUrl:
        venueLogoStorageId &&
        (await storageNotOwnedElsewhere(ctx, tenantId, venueLogoStorageId))
          ? await storageUrl(ctx, venueLogoStorageId)
          : null,
      companyName:
        organization?.brandDisplayName?.trim() || organization?.name || null,
      companyLogoUrl: companyLogoStorageId
        ? await storageUrl(ctx, companyLogoStorageId)
        : null,
      photos,
    };
  },
});
