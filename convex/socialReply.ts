// AUTHOR-OWNED — answer a client's Facebook or Instagram message from the
// inbox (PL-SMS-SOCIAL, AC-354). A manager pastes the company's Facebook Page
// key once (a Page access token from the Meta app; an Instagram account linked
// to the Page uses the same key). Capsule checks with Meta that the key opens
// the company's own Page, keeps it encrypted in the ledger, and never shows it
// again. A reply goes to the client in the same conversation through Meta's
// Send API and is added with Meta's message id.
//
// One typed reply sends at most one message (same claim as text replies:
// convex/messageTextReply.ts). Meta's limits come back in plain words: the
// 24-hour answer window, an expired key, a person who cannot get messages,
// too many messages at once.
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { insertStepEvent } from "./lib/commandAudit";
import { decrypt, encrypt } from "./lib/encryption";
import { canManage } from "./smsAlerts";

const KEY_ENTITY = "SocialPageKey";
const GRAPH = "https://graph.facebook.com/v21.0";
const NOT_FOUND =
  "Capsule could not find this conversation. It may have been removed, or your role cannot open it. Ask a manager.";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** Plain words for the Meta refusals a caterer will actually see. */
export function socialReplyRefusal(
  code: number | null,
  subcode: number | null,
): string {
  if (code === 10 || subcode === 2018278 || subcode === 2018108)
    return "Facebook and Instagram let a business answer only within 24 hours of the client's last message. Answer from the Facebook or Instagram app, or call them.";
  if (code === 190)
    return "The Facebook Page key no longer works. A manager pastes a new one on the Brand page.";
  if (code === 551 || subcode === 1545041)
    return "This person cannot get messages right now. Call or email them instead.";
  if (code === 4 || code === 32 || code === 613)
    return "Facebook is limiting messages right now. Try again in a few minutes.";
  if (code === 200)
    return "The Facebook Page key is not allowed to send messages. In the Meta app, give it the messaging permission, then paste it again on the Brand page.";
  return code == null
    ? "Facebook refused the reply. Try again in a minute."
    : `Facebook refused the reply (code ${code}). Try again in a minute.`;
}

interface StoredKey {
  pageId: string;
  key: { ciphertext: string; keyId: string } | null;
  savedAt: number;
}

/** The company's latest saved Page key, or null when none or removed. */
export const loadPageKey = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args): Promise<StoredKey | null> => {
    const rows = (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
        .collect()
    )
      .filter(
        (row) =>
          row.entity === KEY_ENTITY &&
          asRecord(row.payload).tenantId === args.tenantId,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    const latest = rows[0];
    if (!latest || latest.type !== "SocialPageKeySaved") return null;
    const payload = asRecord(latest.payload);
    return {
      pageId: String(payload.pageId ?? ""),
      key: payload.key as StoredKey["key"],
      savedAt: latest.createdAt,
    };
  },
});

export const recordPageKey = internalMutation({
  args: {
    tenantId: v.string(),
    actorId: v.string(),
    pageId: v.optional(v.string()),
    key: v.optional(v.object({ ciphertext: v.string(), keyId: v.string() })),
  },
  handler: async (ctx, args): Promise<void> => {
    await insertStepEvent(ctx, {
      type: args.key ? "SocialPageKeySaved" : "SocialPageKeyRemoved",
      entity: KEY_ENTITY,
      entityId: args.tenantId,
      payload: {
        tenantId: args.tenantId,
        actorId: args.actorId,
        pageId: args.pageId ?? null,
        key: args.key ?? null,
      },
      createdAt: Date.now(),
    });
  },
});

export const loadCompanyPage = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const company = (
      await ctx.db
        .query("organizations")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect()
    ).find((org) => org.deletedAt == null);
    return company?.facebookPageId?.trim() || null;
  },
});

/** Managers: save (or, with an empty key, remove) the company's Page key. */
export const savePageKey = action({
  args: { pageKey: v.string() },
  handler: async (ctx, args): Promise<{ saved: boolean }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!canManage(auth.role))
      throw new ConvexError("Only a manager can change the Facebook Page key.");
    const pageKey = args.pageKey.trim();
    if (!pageKey) {
      await ctx.runMutation(internal.socialReply.recordPageKey, {
        tenantId,
        actorId: String(auth.id),
      });
      return { saved: false };
    }
    const pageId = await ctx.runQuery(internal.socialReply.loadCompanyPage, {
      tenantId,
    });
    if (!pageId)
      throw new ConvexError(
        "Add your Facebook Page ID first, then paste the Page key.",
      );
    let ownerId: string | null = null;
    try {
      const response = await fetch(`${GRAPH}/me?fields=id`, {
        headers: { Authorization: `Bearer ${pageKey}` },
      });
      const body = asRecord(await response.json().catch(() => null));
      if (response.ok && typeof body.id === "string") ownerId = body.id;
    } catch {
      throw new ConvexError(
        "Capsule could not reach Facebook to check the key. Try again in a minute.",
      );
    }
    if (ownerId !== pageId)
      throw new ConvexError(
        "This key does not open your Facebook Page. Copy the Page access token for that Page from the Meta app and paste it again.",
      );
    const key = await encrypt(pageKey, {
      ctx,
      entity: KEY_ENTITY,
      property: "pageKey",
    });
    await ctx.runMutation(internal.socialReply.recordPageKey, {
      tenantId,
      actorId: String(auth.id),
      pageId,
      key,
    });
    return { saved: true };
  },
});

/** Whether a Page key is saved (never the key itself). */
export const pageKeyStatus = query({
  args: {},
  handler: async (ctx): Promise<{ savedAt: number | null } | null> => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    const { tenantId } = await getAuthContext(ctx);
    if (typeof tenantId !== "string") return null;
    const rows = (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
        .collect()
    )
      .filter(
        (row) =>
          row.entity === KEY_ENTITY &&
          asRecord(row.payload).tenantId === tenantId,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    const latest = rows[0];
    return {
      savedAt:
        latest && latest.type === "SocialPageKeySaved"
          ? latest.createdAt
          : null,
    };
  },
});

export const loadSocialThread = internalQuery({
  args: { threadId: v.id("messageThreads"), tenantId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ provider: string; account: string; to: string } | null> => {
    const thread = await ctx.db.get(args.threadId);
    if (
      !thread ||
      thread.tenantId !== args.tenantId ||
      thread.deletedAt != null
    )
      return null;
    return {
      provider: String(thread.provider),
      account: thread.providerAccountId ?? "",
      to: thread.providerThreadId?.trim() ?? "",
    };
  },
});

export const sendSocialReply = action({
  args: {
    threadId: v.id("messageThreads"),
    bodyText: v.string(),
    /** Made once per typed reply; a retry reuses it. */
    requestId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ messageId: string; network: string }> => {
    const body = args.bodyText.trim();
    if (!body) throw new ConvexError("Write something in the reply.");
    const requestId = args.requestId.trim().slice(0, 100);
    if (!requestId)
      throw new ConvexError("Reload the page, then send the reply again.");
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !auth.id) throw new ConvexError(NOT_FOUND);
    const thread = await ctx.runQuery(internal.socialReply.loadSocialThread, {
      threadId: args.threadId,
      tenantId: auth.tenantId,
    });
    if (!thread) throw new ConvexError(NOT_FOUND);
    const network = thread.account.startsWith("instagram:")
      ? "Instagram"
      : thread.account.startsWith("facebook:")
        ? "Facebook"
        : null;
    if (thread.provider !== "social" || !network || !thread.to) {
      throw new ConvexError(
        "Capsule can answer only Facebook and Instagram messages that came in.",
      );
    }
    const stored = await ctx.runQuery(internal.socialReply.loadPageKey, {
      tenantId: auth.tenantId,
    });
    if (!stored?.key) {
      throw new ConvexError(
        "No Facebook Page key is saved. A manager pastes it on the Brand page.",
      );
    }
    const pageKey = await decrypt(stored.key.ciphertext, stored.key.keyId, {
      ctx,
      entity: KEY_ENTITY,
      property: "pageKey",
    });

    const claim = await ctx.runMutation(
      internal.messageTextReply.claimTextReply,
      {
        tenantId: auth.tenantId,
        threadId: String(args.threadId),
        requestId,
        actorId: String(auth.id),
      },
    );
    if (!claim.claimed) {
      throw new ConvexError(
        "Capsule already tried to send this reply and is not sure it went. Check the conversation in the app before sending it again.",
      );
    }

    let response: Response;
    try {
      response = await fetch(`${GRAPH}/me/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pageKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: thread.to },
          messaging_type: "RESPONSE",
          message: { text: body.slice(0, 2000) },
        }),
      });
    } catch {
      // No answer from Meta: the message may have gone. Keep the claim.
      throw new ConvexError(
        "Capsule could not hear back from Facebook, so it is not sure the reply went. Check the conversation in the app before sending it again.",
      );
    }
    const result = asRecord(await response.json().catch(() => null));
    const messageId =
      typeof result.message_id === "string" ? result.message_id : "";
    if (!response.ok || !messageId) {
      const error = asRecord(result.error);
      const code = typeof error.code === "number" ? error.code : null;
      const subcode =
        typeof error.error_subcode === "number" ? error.error_subcode : null;
      await ctx.runMutation(internal.messageTextReply.releaseTextReply, {
        tenantId: auth.tenantId,
        threadId: String(args.threadId),
        requestId,
        ...(code == null ? {} : { code }),
      });
      throw new ConvexError(socialReplyRefusal(code, subcode));
    }

    const posted = (await ctx.runMutation(api.mutations.Message_createViaPost, {
      threadId: args.threadId,
      direction: "outbound",
      status: "sent",
      bodyText: body,
      providerMessageId: messageId,
      senderIdentity: thread.account,
      sentAt: Date.now(),
      idempotencyKey: `inbox-social-reply/${args.threadId}/${requestId}`,
    })) as { _id?: string; docId?: string };
    return {
      messageId: String(posted.docId ?? posted._id ?? ""),
      network,
    };
  },
});
