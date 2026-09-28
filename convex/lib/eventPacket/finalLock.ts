import { v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import { authorize } from "./commands";
import { readFinalLockInput } from "./finalLockInput";
import { canonicalJson } from "../../../src/lib/eventPacket/model";
import { evaluateFinalLock } from "../../../src/lib/eventPacket/finalLock/evaluate";
import { QUESTIONS } from "../../../src/lib/eventPacket/finalLock/policy";

const clean = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

/**
 * The event's Final Lock answers: each question's result, value, plain
 * explanation, sources, rule, override, resolver and field-work state,
 * plus the outcome and the sections a later change made stale.
 */
export const getFinalLock = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await authorize(ctx, eventId);
    const { input, overrides, printed } = await readFinalLockInput(
      ctx,
      auth.tenantId,
      eventId,
    );
    return clean(evaluateFinalLock(input, { overrides, printed }));
  },
});

/**
 * A manager's authorized decision on one office question, with the reason.
 * It holds only while the facts it saw stay the same; physical field work
 * is never decided from the office.
 */
export const overrideFinalLockAnswer = mutation({
  args: {
    eventId: v.id("events"),
    questionKey: v.string(),
    basedOn: v.string(),
    answer: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.eventId);
    const question = QUESTIONS.find((q) => q.key === args.questionKey);
    if (!question) throw new Error("That Final Lock question does not exist");
    if (question.form)
      throw new Error(
        "This is work done on the day; the person who does it confirms it",
      );
    const answer = args.answer.trim();
    const reason = args.reason.trim();
    if (!answer) throw new Error("Write the answer you are deciding");
    if (!reason) throw new Error("Say why this event is different");
    const { input, overrides, printed } = await readFinalLockInput(
      ctx,
      auth.tenantId,
      args.eventId,
    );
    const current = evaluateFinalLock(input, { overrides, printed }).answers.find(
      (a) => a.questionKey === args.questionKey,
    );
    if (!current || current.basis !== args.basedOn)
      throw new Error(
        "The facts behind this answer changed; look at it again before deciding",
      );
    const at = new Date().toISOString();
    const decisionId = `finallock:${args.questionKey}:${at}`;
    await ctx.db.insert("eventPacketResolutions", {
      tenantId: auth.tenantId,
      eventId: args.eventId,
      decisionId,
      issueKey: `finallock.${args.questionKey}`,
      actor: auth.id,
      decidedAt: Date.parse(at),
      decisionJson: canonicalJson({
        kind: "final_lock_override",
        questionKey: args.questionKey,
        basedOn: args.basedOn,
        value: { type: "text", text: answer },
        reason,
        actor: auth.id,
        at,
      }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { decisionId };
  },
});
