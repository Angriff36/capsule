/**
 * AUTHOR SEAM — phone notice for a published or changed work week (default
 * runtime, PL-SCHEDULE-CORRECTION AC-326/AC-508).
 *
 * `buildSchedulePushJob` picks the person's own devices; the Node action in
 * convex/schedulePushSend.ts sends it and reports back through
 * teamChatPush.recordPushResults. Same opt-in as team chat and run-of-show
 * alerts (chatNotifyPreference): one switch governs phone alerts from Capsule.
 * The text is generic (no shift details on a lock screen); the person reads and
 * confirms the week in the app.
 */
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { live } from "./lib/teamChatRead";
import type { PushJob, PushTarget } from "./teamChatPush";

const DEVICES_PER_PERSON = 20;
const HISTORY_WALK_CAP = 400;

export const buildSchedulePushJob = internalQuery({
  args: { noticeId: v.id("weeklyScheduleNotices") },
  handler: async (ctx, { noticeId }): Promise<PushJob | null> => {
    const notice = await ctx.db.get(noticeId);
    if (!notice || notice.deletedAt != null || notice.publishedAt == null)
      return null;
    const person = await ctx.db.get(notice.personId);
    if (
      !person ||
      person.tenantId !== notice.tenantId ||
      person.deletedAt != null ||
      person.status !== "active" ||
      !person.authSubjectId
    )
      return null;
    const preference = (
      await ctx.db
        .query("chatNotifyPreferences")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", person.authSubjectId!))
        .take(10)
    ).find((row) => row.tenantId === notice.tenantId);
    if (preference?.enabled !== true) return null;
    const targets: PushTarget[] = [];
    let walked = 0;
    for await (const device of ctx.db
      .query("pushSubscriptions")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .order("desc")) {
      if (++walked > HISTORY_WALK_CAP || targets.length >= DEVICES_PER_PERSON)
        break;
      if (device.tenantId !== notice.tenantId || !live(device)) continue;
      if (device.authSubjectId !== person.authSubjectId) continue;
      targets.push({
        id: device._id,
        version: device.version,
        endpoint: device.endpoint,
        p256dh: device.p256dh,
        auth: device.auth,
      });
    }
    if (targets.length === 0) return null;
    const changed = notice.changedAt != null;
    return {
      targets,
      payload: {
        title: changed ? "Your schedule changed" : "Your schedule is ready",
        body: "Open Capsule to see your week and confirm it.",
        url: "/my",
        tag: `schedule:${String(notice._id)}`,
      },
    };
  },
});
