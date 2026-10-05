import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { clockNow } from "./lib/clockNow";
import { SHARE_LINK_DEFAULT_LIFETIME_MS } from "./shareLinks";

/**
 * AUTHOR SEAM — presentation deck links (spec §4.6, PL-DECK-SHARING, AC-253).
 *
 * Same posture as convex/shareLinks.ts: the DeckShareLink `_id` is the bearer
 * token; these two functions are the only way in. A link opens only while it
 * is active, inside its end date (no end date = 90 days), and while the file
 * it names is still kept in the same company. A "staff" link opens only for a
 * signed-in person of that company. The file is the Attachment written once
 * at upload, so the link always serves the exact file that was shared.
 */

type SharedDeck = {
  fileName: string;
  contentType: string;
  url: string | null;
  audience: "anyone" | "staff";
  linkExpiresAt: number;
};

function linkEndsAt(link: Doc<"deckShareLinks">): number {
  return (
    link.expiresAt ??
    (link.createdAt ?? link._creationTime) + SHARE_LINK_DEFAULT_LIFETIME_MS
  );
}

async function openDeckLink(
  ctx: QueryCtx,
  token: string,
  clock?: number,
): Promise<{
  link: Doc<"deckShareLinks">;
  file: Doc<"attachments">;
  viewer: string | null;
} | null> {
  const linkId = ctx.db.normalizeId("deckShareLinks", token);
  if (!linkId) return null;
  const link = await ctx.db.get(linkId);
  if (!link || link.deletedAt != null || link.status !== "active") return null;
  if (linkEndsAt(link) <= clockNow(clock)) return null;

  const file = await ctx.db.get(link.attachmentId as Id<"attachments">);
  if (
    !file ||
    file.deletedAt != null ||
    file.tenantId !== link.tenantId ||
    file.parentType === "staffMessage"
  ) {
    return null;
  }

  let viewer: string | null = null;
  if (link.audience === "staff") {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.tenantId !== link.tenantId) return null;
    viewer = auth.personName ?? auth.personId ?? auth.id;
  }
  return { link, file, viewer };
}

/** The shared file for a deck link, or null (revoked, ended, removed, not allowed). */
export const getSharedDeck = query({
  args: { token: v.string(), clock: v.optional(v.number()) },
  handler: async (ctx, { token, clock }): Promise<SharedDeck | null> => {
    const opened = await openDeckLink(ctx, token, clock);
    if (!opened) return null;
    const { link, file } = opened;
    return {
      fileName: file.fileName,
      contentType: file.contentType,
      url: await ctx.storage.getUrl(file.storageId as Id<"_storage">),
      audience: link.audience,
      linkExpiresAt: linkEndsAt(link),
    };
  },
});

/**
 * Count a view: first view stays, last view moves. A staff link records the
 * signed-in person; an open link keeps what the page could tell (if anything).
 * A link that does not open records nothing.
 */
export const recordDeckView = mutation({
  args: { token: v.string(), viewerIdentity: v.optional(v.string()) },
  handler: async (ctx, { token, viewerIdentity }): Promise<void> => {
    const opened = await openDeckLink(ctx, token);
    if (!opened) return;
    const { link, viewer } = opened;
    const now = Date.now();
    await ctx.db.patch(link._id, {
      viewCount: (link.viewCount ?? 0) + 1,
      firstViewedAt: link.firstViewedAt ?? now,
      lastViewedAt: now,
      lastViewerIdentity: viewer ?? viewerIdentity ?? link.lastViewerIdentity,
      updatedAt: now,
    } as Partial<Doc<"deckShareLinks">>);
  },
});
