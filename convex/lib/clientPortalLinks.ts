/**
 * AUTHOR SEAM — saved client portal links.
 *
 * A link's id is the public address. Copying a new link turns the previous
 * one off. Each link stops working 90 days after it is copied. Staff can
 * turn the current link off sooner. Older signed links (no saved row) keep
 * working until the first saved link exists for that event, and never later
 * than 90 days after the event.
 */
import { ConvexError, v } from "convex/values";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { getAuthContext } from "./authContext";
import { verifyClientPortalToken } from "./clientPortalToken";
import { clockNow } from "./clockNow";

export const CLIENT_PORTAL_LINK_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

type PortalAccess = { eventId: string; tenantId: string };
type PortalDb = QueryCtx | MutationCtx;
type CreatedLink = { _id: Id<"clientPortalLinks">; version?: number };

export async function resolveClientPortalAccess(
  ctx: QueryCtx,
  token: string,
  clock?: number,
): Promise<PortalAccess | null> {
  if (!token || token.length > 2048) return null;
  const now = clockNow(clock);
  if (!token.includes(".")) return accessFromSavedLink(ctx, token, now);
  return accessFromLegacyToken(ctx, token, now);
}

export const issueClientPortalLink = mutation({
  args: { eventId: v.id("events") },
  returns: v.id("clientPortalLinks"),
  handler: async (ctx, { eventId }) => {
    await requireEventInTenant(ctx, eventId);
    const created = await insertPortalLink(ctx, eventId);
    await revokeOtherActiveLinks(ctx, eventId, created._id);
    return created._id;
  },
});

export const turnOffClientPortalLinks = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({ turnedOff: v.boolean() }),
  handler: async (ctx, { eventId }) => {
    await requireEventInTenant(ctx, eventId);
    const active = (await linksForEvent(ctx, eventId)).filter(
      (link) => link.status === "active",
    );
    if (active.length === 0) {
      const created = await insertPortalLink(ctx, eventId);
      await revokePortalLink(ctx, created);
      return { turnedOff: true };
    }
    for (const link of active) await revokePortalLink(ctx, link);
    return { turnedOff: true };
  },
});

async function accessFromSavedLink(
  ctx: QueryCtx,
  token: string,
  now: number,
): Promise<PortalAccess | null> {
  const linkId = ctx.db.normalizeId("clientPortalLinks", token);
  if (!linkId) return null;
  const link = await ctx.db.get(linkId);
  if (!isOpenLink(link, now)) return null;
  return { eventId: String(link.eventId), tenantId: link.tenantId };
}

async function accessFromLegacyToken(
  ctx: QueryCtx,
  token: string,
  now: number,
): Promise<PortalAccess | null> {
  const legacy = await verifyClientPortalToken(token);
  if (!legacy) return null;
  const eventId = ctx.db.normalizeId("events", legacy.eventId);
  if (!eventId) return null;
  if ((await linksForEvent(ctx, eventId)).length > 0) return null;
  // Signed links carry no end date, so they stop 90 days after the event.
  const event = await ctx.db.get(eventId);
  if (!event) return null;
  const eventDay = event.endsAt ?? event.startsAt ?? event._creationTime;
  if (eventDay + CLIENT_PORTAL_LINK_LIFETIME_MS <= now) return null;
  return legacy;
}

function isOpenLink(
  link: Doc<"clientPortalLinks"> | null,
  now: number = Date.now(),
): link is Doc<"clientPortalLinks"> {
  if (!link || link.deletedAt != null) return false;
  if (link.status !== "active") return false;
  // Same read-time check as proposal share links. Turning a link off updates
  // the row, so an open page drops the event. A visit after the end date
  // sees nothing.
  return link.expiresAt > now;
}

async function linksForEvent(
  ctx: PortalDb,
  eventId: Id<"events">,
): Promise<Doc<"clientPortalLinks">[]> {
  const rows = await ctx.db
    .query("clientPortalLinks")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  return rows.filter((row) => row.deletedAt == null);
}

async function requireEventInTenant(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || !auth.id) {
    throw new ConvexError("Sign in to change the client link.");
  }
  const event = await ctx.db.get(eventId);
  if (!event || event.deletedAt != null || event.tenantId !== auth.tenantId) {
    throw new ConvexError(
      "Event unavailable. Check your workspace access and try again.",
    );
  }
}

async function insertPortalLink(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<CreatedLink> {
  const expiresAt = Date.now() + CLIENT_PORTAL_LINK_LIFETIME_MS;
  return (await ctx.runMutation(api.mutations.ClientPortalLink_create, {
    eventId,
    expiresAt,
    deletedAt: null,
  })) as CreatedLink;
}

async function revokeOtherActiveLinks(
  ctx: MutationCtx,
  eventId: Id<"events">,
  keepId: Id<"clientPortalLinks">,
): Promise<void> {
  for (const link of await linksForEvent(ctx, eventId)) {
    if (link._id === keepId || link.status !== "active") continue;
    await revokePortalLink(ctx, link);
  }
}

async function revokePortalLink(
  ctx: MutationCtx,
  link: { _id: Id<"clientPortalLinks">; version?: number },
): Promise<void> {
  await ctx.runMutation(api.mutations.ClientPortalLink_revoke, {
    docId: link._id,
    version: link.version ?? 1,
  });
}
