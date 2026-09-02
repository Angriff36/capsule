/**
 * AUTHOR SEAM — the push job for one new team-chat message (default runtime).
 *
 * `buildPushJob` decides who gets a push and with what text; the Node action
 * in convex/teamChatPushSend.ts sends it and reports back through
 * `recordPushResults`. Direct messages push to the recipient's devices,
 * channel messages only to the people @mentioned — plain channel traffic
 * never wakes a phone. The sender's own devices are always skipped, and a
 * device counts only while its sign-in still owns the addressed Person.
 */
import { v } from "convex/values";
import { chatPreviewText } from "../src/features/chat/chatLinkTokens";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  decryptField,
  live,
  tenantEvent,
  tenantPerson,
} from "./lib/teamChatRead";

/** A push older than this when the action finally runs is not worth sending. */
const STALE_MS = 5 * 60_000;
/** Notification body length; the payload must stay far under 4 KB. */
const PREVIEW_CHARS = 120;
/** Devices per person read for one push. */
const DEVICES_PER_PERSON = 20;
/** People one mention list may address. */
const MENTION_CAP = 50;

export type PushTarget = {
  readonly id: Id<"pushSubscriptions">;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
};

export type PushPayload = {
  readonly title: string;
  readonly body: string;
  /** In-app path the notification opens. */
  readonly url: string;
  /** Collapses a burst from one thread into one notification. */
  readonly tag: string;
};

export type PushJob = {
  readonly targets: readonly PushTarget[];
  readonly payload: PushPayload;
};

function displayName(person: Doc<"people"> | null): string {
  if (!person) return "A teammate";
  const name = `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim();
  return name.length > 0 ? name : "A teammate";
}

export const buildPushJob = internalQuery({
  args: { messageId: v.id("staffMessages"), now: v.number() },
  handler: async (ctx, args): Promise<PushJob | null> => {
    const message = await ctx.db.get(args.messageId);
    if (!message || !live(message)) return null;
    if (args.now - message._creationTime > STALE_MS) return null;
    const tenantId = message.tenantId;

    const sender = await tenantPerson(
      ctx,
      tenantId,
      String(message.senderPersonId),
    );
    const senderName = displayName(sender);

    let recipientIds: string[] = [];
    let title: string;
    let url: string;
    let tag: string;
    if (message.recipientPersonId) {
      recipientIds = [String(message.recipientPersonId)];
      title = senderName;
      url = `/staff/messages?dm=${encodeURIComponent(String(message.senderPersonId))}`;
      tag = `dm:${String(message.senderPersonId)}`;
    } else if (message.eventId) {
      recipientIds = (message.mentionedPersonIds ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .slice(0, MENTION_CAP);
      if (recipientIds.length === 0) return null;
      const event = await tenantEvent(ctx, tenantId, String(message.eventId));
      const eventTitle = event?.title?.trim() || "an event channel";
      title = `${senderName} mentioned you in ${eventTitle}`;
      url = `/staff/messages?event=${encodeURIComponent(String(message.eventId))}`;
      tag = `event:${String(message.eventId)}`;
    } else {
      return null;
    }

    const body = await decryptField(ctx, "StaffMessage", "body", message.body);
    let preview = chatPreviewText(body).slice(0, PREVIEW_CHARS);
    if (preview.length === 0) {
      const files = message.attachmentCount ?? 0;
      preview =
        files === 1
          ? "Sent a photo or file"
          : files > 1
            ? `Sent ${files} files`
            : "";
    }

    const targets: PushTarget[] = [];
    const seenEndpoints = new Set<string>();
    for (const personId of new Set(recipientIds)) {
      if (personId === String(message.senderPersonId)) continue;
      const person = await tenantPerson(ctx, tenantId, personId);
      if (!person || !person.authSubjectId) continue;
      const devices = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_personId", (q) => q.eq("personId", person._id))
        .take(DEVICES_PER_PERSON);
      for (const device of devices) {
        if (device.tenantId !== tenantId || !live(device)) continue;
        // The device must still belong to the sign-in that owns this Person,
        // and never be one of the sender's own.
        if (device.authSubjectId !== person.authSubjectId) continue;
        if (device.authSubjectId === message.senderAuthSubjectId) continue;
        if (seenEndpoints.has(device.endpoint)) continue;
        seenEndpoints.add(device.endpoint);
        targets.push({
          id: device._id,
          endpoint: device.endpoint,
          p256dh: device.p256dh,
          auth: device.auth,
        });
      }
    }
    if (targets.length === 0) return null;
    return { targets, payload: { title, body: preview, url, tag } };
  },
});

export const recordPushResults = internalMutation({
  args: {
    used: v.array(v.id("pushSubscriptions")),
    gone: v.array(v.id("pushSubscriptions")),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    for (const id of args.used) {
      const row = await ctx.db.get(id);
      if (row && live(row)) await ctx.db.patch(id, { lastUsedAt: args.now });
    }
    // 404/410 from the push service: the browser dropped the subscription.
    for (const id of args.gone) {
      const row = await ctx.db.get(id);
      if (row && live(row)) {
        await ctx.db.patch(id, {
          deletedAt: args.now,
          updatedAt: args.now,
          version: row.version + 1,
        });
      }
    }
  },
});
