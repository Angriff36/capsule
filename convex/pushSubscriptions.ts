/**
 * AUTHOR SEAM — web push devices for team chat, as upserts.
 *
 * PushSubscription declares `unique [tenantId, endpoint]` but Convex enforces
 * no alternate keys and the generated creation command inserts a new row on
 * every call. This is the write path the UI uses: `register` finds the row
 * for the endpoint and re-owns or refreshes it, or inserts the single row;
 * `unregister` soft-deletes the caller's row. Same raw-write posture as
 * convex/teamChatCursor.ts, with the domain events recorded in manifestEvents.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { chatAuth } from "./lib/teamChatRead";

/** Live devices one sign-in may keep; more is a bug or a very old account. */
const DEVICES_CAP = 20;
/** Rows walked over one endpoint's history before giving up. One physical
 *  browser should hold a single row; the generated create path could add
 *  more, so the whole key is folded, not a fixed slice. */
const ENDPOINT_WALK_CAP = 200;
/** Rows walked over a person's history before giving up (dead rows accrue). */
const HISTORY_WALK_CAP = 400;

/** Every row for one endpoint (bounded), so register/unregister fold them all. */
async function rowsForEndpoint(
  ctx: MutationCtx,
  endpoint: string,
): Promise<Doc<"pushSubscriptions">[]> {
  const out: Doc<"pushSubscriptions">[] = [];
  for await (const row of ctx.db
    .query("pushSubscriptions")
    .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))) {
    out.push(row);
    if (out.length >= ENDPOINT_WALK_CAP) break;
  }
  return out;
}

/**
 * The public half of the VAPID key pair, so the browser can subscribe. Read
 * from the deployment, not baked into the build: the same bundle works against
 * any deployment and a key change needs no redeploy of the front end.
 */
export const vapidPublicKey = query({
  args: {},
  handler: async () => {
    // Only advertise a key when delivery is fully configured; a public key
    // without its private key (or subject) would let a client subscribe and
    // read "Notifications on" while teamChatPushSend.deliver silently sends
    // nothing.
    if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
      return null;
    }
    return process.env.VAPID_PUBLIC_KEY ?? null;
  },
});

/** The caller's live devices — enough for the UI to know whether THIS device is on. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const auth = await chatAuth(ctx);
    if (!auth) return [];
    // Newest first, LIVE rows only: a person who reset or rotated many devices
    // accumulates soft-deleted rows, so a plain take(cap) could return only
    // the oldest, dead ones and hide a live device.
    const out: { endpoint: string; personId: string }[] = [];
    let walked = 0;
    for await (const row of ctx.db
      .query("pushSubscriptions")
      .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", auth.id))
      .order("desc")) {
      if (++walked > HISTORY_WALK_CAP) break;
      if (row.tenantId !== auth.tenantId || row.deletedAt != null) continue;
      out.push({ endpoint: row.endpoint, personId: String(row.personId) });
      if (out.length >= DEVICES_CAP) break;
    }
    return out;
  },
});

export const register = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) throw new Error("Sign in to turn on notifications");
    if (!auth.personId) {
      throw new Error(
        "Link your account to a staff profile before turning on notifications",
      );
    }
    const endpoint = args.endpoint.trim();
    if (endpoint.length === 0) throw new Error("Endpoint is required");
    if (args.p256dh.trim().length === 0 || args.auth.trim().length === 0) {
      throw new Error("Push keys are required");
    }
    const now = Date.now();
    const userAgent = args.userAgent?.slice(0, 200);

    // The endpoint identifies one physical browser, so it has exactly one
    // owner: whoever is signed in on it now. EVERY other row for this endpoint
    // — including one left by a different tenant or sign-in that used this
    // browser before, or an extra row the generated create path may have
    // added — is removed, so the previous account can never receive a
    // decrypted preview on a browser that has changed hands. The whole key is
    // read (bounded by the walk cap), never a fixed slice.
    const existing = await rowsForEndpoint(ctx, endpoint);
    const keep =
      existing.find(
        (row) => row.tenantId === auth.tenantId && row.deletedAt == null,
      ) ??
      existing.find((row) => row.tenantId === auth.tenantId) ??
      existing[0];
    if (keep) {
      await ctx.db.patch(keep._id, {
        // Re-own to the current tenant too: keep may be a previous tenant's row.
        tenantId: auth.tenantId,
        authSubjectId: auth.id,
        personId: auth.personId as Id<"people">,
        p256dh: args.p256dh,
        auth: args.auth,
        ...(userAgent ? { userAgent } : {}),
        deletedAt: undefined,
        updatedAt: now,
        version: keep.version + 1,
      });
      for (const duplicate of existing) {
        if (duplicate._id !== keep._id) await ctx.db.delete(duplicate._id);
      }
      await ctx.db.insert("manifestEvents", {
        type: "PushSubscriptionRegistered",
        entity: "PushSubscription",
        entityId: keep._id,
        payload: {
          pushSubscriptionId: keep._id,
          tenantId: auth.tenantId,
          authSubjectId: auth.id,
        },
        createdAt: now,
      });
      return { subscriptionId: String(keep._id) };
    }

    const subscriptionId = await ctx.db.insert("pushSubscriptions", {
      tenantId: auth.tenantId,
      authSubjectId: auth.id,
      personId: auth.personId as Id<"people">,
      endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      ...(userAgent ? { userAgent } : {}),
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    await ctx.db.insert("manifestEvents", {
      type: "PushSubscriptionRegistered",
      entity: "PushSubscription",
      entityId: subscriptionId,
      payload: {
        pushSubscriptionId: subscriptionId,
        tenantId: auth.tenantId,
        authSubjectId: auth.id,
      },
      createdAt: now,
    });
    return { subscriptionId: String(subscriptionId) };
  },
});

/**
 * Retire a subscription by its endpoint, WITHOUT auth. The endpoint is a
 * secret the browser holds (whoever knows it can already push to the device),
 * so proving possession of it is enough to turn the device off. Used when the
 * session is already gone (sign-out / expiry) and the authenticated seam can
 * no longer run; it only soft-deletes, so a user can re-enable at any time.
 */
export const releaseByEndpoint = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const endpoint = args.endpoint.trim();
    if (endpoint.length === 0) return { removed: 0 };
    const now = Date.now();
    let removed = 0;
    for (const row of await rowsForEndpoint(ctx, endpoint)) {
      if (row.deletedAt != null) continue;
      await ctx.db.patch(row._id, {
        deletedAt: now,
        updatedAt: now,
        version: row.version + 1,
      });
      await ctx.db.insert("manifestEvents", {
        type: "PushSubscriptionRemoved",
        entity: "PushSubscription",
        entityId: row._id,
        payload: { pushSubscriptionId: row._id, tenantId: row.tenantId },
        createdAt: now,
      });
      removed += 1;
    }
    return { removed };
  },
});

export const unregister = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) throw new Error("Sign in to manage notifications");
    const endpoint = args.endpoint.trim();
    const all = await rowsForEndpoint(ctx, endpoint);
    // Only the owner may turn a device off — but once they do, EVERY live row
    // for this physical browser is retired, so a stray row left by an earlier
    // owner cannot keep delivering to it.
    const ownsLive = all.some(
      (row) =>
        row.authSubjectId === auth.id &&
        row.tenantId === auth.tenantId &&
        row.deletedAt == null,
    );
    const rows = ownsLive ? all.filter((row) => row.deletedAt == null) : [];
    const now = Date.now();
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        deletedAt: now,
        updatedAt: now,
        version: row.version + 1,
      });
      await ctx.db.insert("manifestEvents", {
        type: "PushSubscriptionRemoved",
        entity: "PushSubscription",
        entityId: row._id,
        payload: { pushSubscriptionId: row._id, tenantId: auth.tenantId },
        createdAt: now,
      });
    }
    return { removed: rows.length };
  },
});
