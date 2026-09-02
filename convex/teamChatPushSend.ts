"use node";
/**
 * AUTHOR SEAM — deliver web push for one new team-chat message (Node runtime).
 *
 * Scheduled by convex/teamChatSend.ts right after a message commits. Builds
 * the job in the default runtime (convex/teamChatPush.ts), signs and encrypts
 * each push with web-push (VAPID, RFC 8291), and reports which devices took
 * it and which are gone (404/410) so their rows are retired. Without VAPID
 * keys on the deployment it does nothing — chat works the same without push.
 */
import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

/** A chat ping older than an hour is not worth waking a phone for. */
const TTL_SECONDS = 3600;

export const deliver = internalAction({
  args: { messageId: v.id("staffMessages") },
  handler: async (ctx, args): Promise<void> => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    // The same full config the vapidPublicKey query requires; without it a
    // client can never enable, so nothing should be delivered either.
    if (!publicKey || !privateKey || !subject) return;

    const now = Date.now();
    const job = await ctx.runQuery(internal.teamChatPush.buildPushJob, {
      messageId: args.messageId,
      now,
    });
    if (!job || job.targets.length === 0) return;

    webpush.setVapidDetails(subject, publicKey, privateKey);
    const payload = JSON.stringify(job.payload);
    const results = await Promise.allSettled(
      job.targets.map((target) =>
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

    const used: Id<"pushSubscriptions">[] = [];
    const gone: { id: Id<"pushSubscriptions">; version: number }[] = [];
    results.forEach((result, index) => {
      const target = job.targets[index];
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
          `push: delivery failed (${statusCode ?? "no status"}) for one device`,
        );
      }
    });
    if (used.length > 0 || gone.length > 0) {
      await ctx.runMutation(internal.teamChatPush.recordPushResults, {
        used,
        gone,
        now,
      });
    }
  },
});
