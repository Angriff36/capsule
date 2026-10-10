/**
 * AUTHOR SEAM — client Facebook and Instagram messages come into the company
 * inbox (PL-SMS-SOCIAL, AC-354). Each company sets its own Facebook Page id
 * and Instagram account id (Organization.facebookPageId /
 * instagramAccountId). Meta sends every message a client writes to them to
 * POST /meta/messages; Capsule checks Meta's signature (X-Hub-Signature-256,
 * keyed with the app secret), finds the company by the account the message
 * went to, and keeps it in one conversation per client. A repeated delivery
 * of the same message (same Meta message id) adds nothing. The first message
 * of a conversation becomes a lead the usual way, from the inbox.
 */
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, internalMutation, query } from "./_generated/server";
import type { MessageMediaRef } from "./lib/messageMedia";
import {
  lastInboxArrivalAt,
  recordInboxArrival,
} from "./lib/inboxConnectionMirror";
import { getAuthContext } from "./lib/authContext";
import { redactSecrets } from "./lib/redactPayload";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";

export const SOCIAL_ROUTE_PATH = "/meta/messages";
const MAX_RAW_PAYLOAD = 8192;
const MAX_MEDIA = 20;

export type SocialNetwork = "facebook" | "instagram";

/** Meta's "object" field names the network the message came from. */
function networkOf(object: unknown): SocialNetwork | null {
  if (object === "page") return "facebook";
  if (object === "instagram") return "instagram";
  return null;
}

/** Checks X-Hub-Signature-256: "sha256=" + hex HMAC-SHA256 of the raw body. */
export async function metaSignatureMatches(args: {
  appSecret: string;
  body: string;
  signature: string;
}): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(args.appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(args.body)),
  );
  const expected =
    "sha256=" +
    Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== args.signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ args.signature.charCodeAt(i);
  }
  return diff === 0;
}

interface MetaAttachment {
  type?: string;
}
interface MetaMessaging {
  sender?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: MetaAttachment[];
  };
}

/** Photos and files on a message: kind only, never Meta's short-lived link. */
function metaMediaRefs(
  mid: string,
  attachments: MetaAttachment[] | undefined,
): MessageMediaRef[] {
  return (attachments ?? []).slice(0, MAX_MEDIA).map((a, i) => ({
    id: `${mid}:${i}`,
    kind: a.type || "file",
  }));
}

function storedPayload(messaging: MetaMessaging): string | undefined {
  const kept = {
    sender: messaging.sender,
    message: {
      mid: messaging.message?.mid,
      text: messaging.message?.text,
      attachments: messaging.message?.attachments?.map((a) => ({
        type: a.type,
      })),
    },
  };
  const text = JSON.stringify(redactSecrets(kept));
  return text.length <= MAX_RAW_PAYLOAD ? text : undefined;
}

/** Stores one client message for the company that owns the account. */
export const ingestSocialMessage = internalMutation({
  args: {
    network: v.union(v.literal("facebook"), v.literal("instagram")),
    accountId: v.string(),
    senderId: v.string(),
    body: v.string(),
    messageId: v.string(),
    mediaJson: v.optional(v.string()),
    rawPayload: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { result: "unknown_account" }
    | {
        result: "stored" | "duplicate";
        threadId: Id<"messageThreads">;
        messageId: Id<"messages">;
      }
  > => {
    const accountId = args.accountId.trim();
    const senderId = args.senderId.trim();
    const company = (await ctx.db.query("organizations").collect()).find(
      (org) =>
        org.deletedAt == null &&
        accountId !== "" &&
        (args.network === "facebook"
          ? org.facebookPageId?.trim()
          : org.instagramAccountId?.trim()) === accountId,
    );
    if (!company || !senderId) return { result: "unknown_account" };
    const tenantId = company.tenantId;
    const system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
    const account = `${args.network}:${accountId}`;

    const thread = (
      await ctx.db
        .query("messageThreads")
        .withIndex("by_providerThreadId", (q) =>
          q.eq("providerThreadId", senderId),
        )
        .collect()
    ).find(
      (t) =>
        t.tenantId === tenantId &&
        t.provider === "social" &&
        t.providerAccountId === account &&
        t.deletedAt == null,
    );
    let threadId: Id<"messageThreads">;
    if (thread) {
      threadId = thread._id;
    } else {
      const created = await system.runMutation(
        api.mutations.MessageThread_create,
        {
          provider: "social",
          providerAccountId: account,
          providerThreadId: senderId,
          subject:
            args.network === "facebook"
              ? "Facebook message"
              : "Instagram message",
          senderIdentity: senderId,
          idempotencyKey: `tenant-shared/mt:social:${account}:${senderId}`,
        },
      );
      threadId = created._id;
    }

    const existing = (
      await ctx.db
        .query("messages")
        .withIndex("by_providerMessageId", (q) =>
          q.eq("providerMessageId", args.messageId),
        )
        .collect()
    ).find((m) => m.threadId === threadId && m.deletedAt == null);
    if (existing) {
      return { result: "duplicate", threadId, messageId: existing._id };
    }

    const media = args.mediaJson
      ? (JSON.parse(args.mediaJson) as unknown[])
      : [];
    const bodyText =
      args.body.trim() ||
      (media.length === 1
        ? "Sent a photo or file."
        : `Sent ${media.length} photos or files.`);
    const posted = await system.runMutation(
      api.mutations.Message_createViaPost,
      {
        threadId,
        direction: "inbound",
        status: "received",
        bodyText,
        providerMessageId: args.messageId,
        senderIdentity: senderId,
        sentAt: Date.now(),
        rawPayload: args.rawPayload,
        mediaJson: args.mediaJson,
        idempotencyKey: `tenant-shared/msg:${threadId}:${args.messageId}`,
      },
    );
    await recordInboxArrival(ctx, tenantId, args.network, accountId);
    return { result: "stored", threadId, messageId: posted.docId };
  },
});

/** GET /meta/messages — Meta's one-time check when the webhook is set up. */
export const verifySocialWebhook = httpAction(async (_ctx, request) => {
  const verifyToken = process.env.META_VERIFY_TOKEN?.trim();
  const url = new URL(request.url);
  if (
    verifyToken &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === verifyToken
  ) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", {
      status: 200,
    });
  }
  return new Response("Not set up.", { status: 403 });
});

/** POST /meta/messages — Meta's "a message comes in" webhook. */
export const receiveSocialMessage = httpAction(async (ctx, request) => {
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appSecret)
    return new Response("Social messages are not set up.", { status: 503 });

  const raw = await request.text();
  const signed = await metaSignatureMatches({
    appSecret,
    body: raw,
    signature: request.headers.get("X-Hub-Signature-256") ?? "",
  });
  if (!signed)
    return new Response("Signature does not match.", { status: 403 });

  let payload: { object?: unknown; entry?: unknown };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return new Response("Not JSON.", { status: 400 });
  }
  const network = networkOf(payload.object);
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  if (network) {
    for (const entry of entries as Array<{
      id?: string;
      messaging?: MetaMessaging[];
    }>) {
      for (const messaging of entry.messaging ?? []) {
        const message = messaging.message;
        const mid = message?.mid ?? "";
        const senderId = messaging.sender?.id ?? "";
        if (!message || message.is_echo || !mid || !senderId) continue;
        const body = message.text ?? "";
        const media = metaMediaRefs(mid, message.attachments);
        if (!body.trim() && media.length === 0) continue;
        await ctx.runMutation(internal.socialInbox.ingestSocialMessage, {
          network,
          accountId: String(entry.id ?? ""),
          senderId,
          body,
          messageId: mid,
          mediaJson: media.length > 0 ? JSON.stringify(media) : undefined,
          rawPayload: storedPayload(messaging),
        });
      }
    }
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
});

/** What a company needs to point its Meta app at Capsule. */
export const socialSetup = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    address: string | null;
    socialReady: boolean;
    lastFacebookAt: number | null;
    lastInstagramAt: number | null;
  } | null> => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/$/, "");
    const { tenantId } = await getAuthContext(ctx);
    let lastFacebookAt: number | null = null;
    let lastInstagramAt: number | null = null;
    if (typeof tenantId === "string") {
      const company = (
        await ctx.db
          .query("organizations")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .collect()
      ).find((org) => org.deletedAt == null);
      const page = company?.facebookPageId?.trim();
      const insta = company?.instagramAccountId?.trim();
      if (page)
        lastFacebookAt = await lastInboxArrivalAt(
          ctx,
          tenantId,
          "facebook",
          page,
        );
      if (insta)
        lastInstagramAt = await lastInboxArrivalAt(
          ctx,
          tenantId,
          "instagram",
          insta,
        );
    }
    return {
      address: site ? `${site}${SOCIAL_ROUTE_PATH}` : null,
      socialReady: Boolean(
        process.env.META_APP_SECRET?.trim() &&
        process.env.META_VERIFY_TOKEN?.trim(),
      ),
      lastFacebookAt,
      lastInstagramAt,
    };
  },
});
