"use node";
/**
 * AUTHOR SEAM — deliver the work-week phone notice (Node runtime).
 *
 * Scheduled when a week is published or re-sent. Same send-and-prune shape as
 * convex/teamChatPushSend.ts. Without VAPID keys on the deployment it does
 * nothing: the week still shows in the app to confirm.
 */
import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

/** A week notice is still worth a phone ping for a day. */
const TTL_SECONDS = 86_400;

export const deliver = internalAction({
  args: { noticeId: v.id("weeklyScheduleNotices") },
  handler: async (ctx, args): Promise<void> => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) return;

    const job = await ctx.runQuery(internal.schedulePush.buildSchedulePushJob, {
      noticeId: args.noticeId,
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
          { TTL: TTL_SECONDS, urgency: "normal" },
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
          `schedule push: delivery failed (${statusCode ?? "no status"}) for one device`,
        );
      }
    });
    if (used.length > 0 || gone.length > 0) {
      await ctx.runMutation(internal.teamChatPush.recordPushResults, {
        used,
        gone,
        now: Date.now(),
      });
    }
  },
});
