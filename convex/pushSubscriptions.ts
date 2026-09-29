/**
 * AUTHOR SEAM — web push devices for team chat, as upserts.
 *
 * PushSubscription declares `unique [tenantId, endpoint]` but Convex enforces
 * no alternate keys. This is the write path the UI uses: `register` retires
 * every other owner's row for the endpoint and refreshes the caller's own row
 * or creates the single row; `unregister` retires the device.
 * ~~Same raw-write posture as convex/teamChatCursor.ts, with the domain
 * events recorded in manifestEvents.~~
 * 2026-09-29: every write runs a generated PushSubscription command
 * (createViaRegister, renew, unregister, releaseDevice), which emits the domain
 * event. Rows the caller does not own are released as the owning tenant's
 * system role; possession of the endpoint is the authority, the same basis
 * `releaseByEndpoint` has always used.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import type { AppAuthContext } from "./lib/authContext";
import { chatAuth, live } from "./lib/teamChatRead";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";

/** Live devices one sign-in may keep; more is a bug or a very old account. */
const DEVICES_CAP = 20;
/** Rows walked over one endpoint's history before giving up. One physical
 *  browser holds one row per tenant and sign-in that used it, so the whole
 *  key is folded, not a fixed slice. */
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

const ownedBy = (auth: AppAuthContext, row: Doc<"pushSubscriptions">) =>
  row.tenantId === auth.tenantId && row.authSubjectId === auth.id;

/**
 * Retire one live row for an endpoint the caller holds. The row may belong to
 * another sign-in or another tenant: the caller cannot read it, so the owning
 * tenant's system role runs PushSubscription.releaseDevice, whose guard checks the
 * endpoint the caller proved it holds.
 */
async function releaseRow(
  ctx: MutationCtx,
  row: Doc<"pushSubscriptions">,
  endpoint: string,
  version?: number,
): Promise<void> {
  await TenantSystemCommandRunner.forTenant(
    ctx,
    row.tenantId,
  ).context.runMutation(api.mutations.PushSubscription_releaseDevice, {
    docId: row._id,
    endpoint,
    ...(version !== undefined ? { version } : {}),
  });
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
    if (endpoint.length === 0)
      throw new Error("This device couldn't turn on notifications. Try again.");
    if (args.p256dh.trim().length === 0 || args.auth.trim().length === 0) {
      throw new Error("This device couldn't turn on notifications. Try again.");
    }
    const userAgent = args.userAgent?.slice(0, 200);
    const keys = {
      p256dh: args.p256dh,
      auth: args.auth,
      ...(userAgent ? { userAgent } : {}),
    };

    // The endpoint identifies one physical browser, so it has exactly one
    // owner: whoever is signed in on it now. EVERY other live row for this
    // endpoint — including one left by a different tenant or sign-in that
    // used this browser before, or an extra row of the caller's own — is
    // retired first, so the previous account can never receive a push on a
    // browser that has changed hands. The whole key is read (bounded by the
    // walk cap), never a fixed slice.
    const existing = await rowsForEndpoint(ctx, endpoint);
    const own = existing.filter((row) => ownedBy(auth, row));
    const keep = own.find(live) ?? own[0];
    for (const row of existing) {
      if (row._id === keep?._id || !live(row)) continue;
      await releaseRow(ctx, row, endpoint);
    }

    if (keep) {
      // The caller's own row (live, or retired earlier): fresh keys, the
      // current Person, live again.
      await ctx.runMutation(api.mutations.PushSubscription_renew, {
        docId: keep._id,
        ...keys,
      });
      return { subscriptionId: String(keep._id) };
    }

    const created = (await ctx.runMutation(
      api.mutations.PushSubscription_createViaRegister,
      { endpoint, ...keys },
    )) as { docId?: string } | null;
    if (!created?.docId) {
      throw new Error("This device couldn't turn on notifications. Try again.");
    }
    return { subscriptionId: String(created.docId) };
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
    let removed = 0;
    for (const row of await rowsForEndpoint(ctx, endpoint)) {
      if (!live(row)) continue;
      await releaseRow(ctx, row, endpoint);
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
    const ownsLive = all.some((row) => ownedBy(auth, row) && live(row));
    const rows = ownsLive ? all.filter(live) : [];
    for (const row of rows) {
      if (ownedBy(auth, row)) {
        await ctx.runMutation(api.mutations.PushSubscription_unregister, {
          docId: row._id,
        });
      } else {
        await releaseRow(ctx, row, endpoint);
      }
    }
    return { removed: rows.length };
  },
});

/**
 * Delivery results for the push seams (convex/teamChatPush.ts,
 * convex/runOfShowAlerts.ts). They run without a user, so each device's own
 * tenant system role records the delivery or retires a device the push
 * service reported gone (404/410) — only the exact row version the delivery
 * held, so a device refreshed or re-owned since is never pruned by a stale
 * report.
 */
export async function recordDeviceResults(
  ctx: MutationCtx,
  used: readonly Doc<"pushSubscriptions">["_id"][],
  gone: readonly { id: Doc<"pushSubscriptions">["_id"]; version: number }[],
  now: number,
): Promise<void> {
  for (const id of used) {
    const row = await ctx.db.get(id);
    if (!row || !live(row)) continue;
    await TenantSystemCommandRunner.forTenant(
      ctx,
      row.tenantId,
    ).context.runMutation(api.mutations.PushSubscription_recordDelivery, {
      docId: id,
      at: now,
    });
  }
  for (const { id, version } of gone) {
    const row = await ctx.db.get(id);
    if (row && live(row) && row.version === version) {
      await releaseRow(ctx, row, row.endpoint, version);
    }
  }
}
