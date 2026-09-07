"use node";
/**
 * AUTHOR SEAM — deliver run-of-show web push (Node runtime).
 *
 * Called by convex/runOfShowAlerts.tick with an already-built job. Same
 * send-and-prune shape as convex/teamChatPushSend.ts: sign with VAPID,
 * deliver to every target, and report 404/410 devices back so their rows
 * are retired. The sent ledger lands with the delivery report, so a crash
 * mid-send simply re-fires on the next scan.
 */
import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** A task call older than this is not worth waking a phone for. */
const TTL_SECONDS = 900;

export const deliver = internalAction({
  args: {
    activityId: v.string(),
    kind: v.string(),
    targets: v.array(
      v.object({
        id: v.id("pushSubscriptions"),
        version: v.number(),
        endpoint: v.string(),
        p256dh: v.string(),
        auth: v.string(),
      }),
    ),
    payload: v.object({
      title: v.string(),
      body: v.string(),
      url: v.string(),
      tag: v.string(),
    }),
  },
  handler: async (ctx, args): Promise<void> => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) return;
    if (args.targets.length === 0) return;

    webpush.setVapidDetails(subject, publicKey, privateKey);
    const payload = JSON.stringify(args.payload);
    const results = await Promise.allSettled(
      args.targets.map((target) =>
        webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          payload,
          { TTL: TTL_SECONDS, urgency: "high" },
        ),
      ),
    );

    const used: import("./_generated/dataModel").Id<"pushSubscriptions">[] = [];
    const gone: {
      id: import("./_generated/dataModel").Id<"pushSubscriptions">;
      version: number;
    }[] = [];
    results.forEach((result, index) => {
      const target = args.targets[index];
      if (!target) return;
      if (result.status === "fulfilled") {
        used.push(target.id);
        return;
      }
      const statusCode = (result.reason as { statusCode?: number } | null)
        ?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        gone.push({ id: target.id, version: target.version });
      } else {
        console.warn(
          `run alerts: delivery failed (${statusCode ?? "no status"}) for one device`,
        );
      }
    });
    await ctx.runMutation(internal.runOfShowAlerts.recordRunPushResults, {
      alertKey: { activityId: args.activityId, kind: args.kind },
      used,
      gone,
      now: Date.now(),
    });
  },
});
