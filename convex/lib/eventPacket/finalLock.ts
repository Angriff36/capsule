import { v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import { getAuthContext, requireTenant } from "../authContext";
import { authorize, hasManagementAccess } from "./commands";
import { readFinalLockInput } from "./finalLockInput";
import { scopedEvent } from "./reconcileNative";
import { canonicalJson } from "../../../src/lib/eventPacket/model";
import {
  evaluateFinalLock,
  lineText,
  type FinalLockReport,
} from "../../../src/lib/eventPacket/finalLock/evaluate";
import type { FinalLockAnswer } from "../../../src/lib/eventPacket/finalLock/types";
import { QUESTIONS } from "../../../src/lib/eventPacket/finalLock/policy";

const clean = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

/**
 * Staff see who pays, not the price; the price stays with managers. The
 * billing answer and its printed line are both rewritten, so no part of the
 * reply carries the price.
 */
function withoutPrice(report: FinalLockReport): FinalLockReport {
  const answers = report.answers.map((a): FinalLockAnswer => {
    if (a.questionKey !== BILLING) return a;
    const billTo =
      a.value.type === "record" ? a.value.fields.billTo ?? null : null;
    return {
      ...a,
      value: billTo ? { type: "record", fields: { billTo } } : { type: "none" },
      explanation: billTo
        ? `${billTo} pays. Managers see the price.`
        : "Managers see who pays and the price.",
      missing: a.missing.length ? ["A manager needs to check who pays."] : [],
      override: a.override
        ? { ...a.override, value: { type: "none" }, reason: "Manager decision." }
        : null,
    };
  });
  const billing = answers.find((a) => a.questionKey === BILLING);
  return {
    ...report,
    answers,
    print: {
      ...report.print,
      lines: report.print.lines.map((line) =>
        line.questionKey === BILLING && billing
          ? { ...line, text: lineText(billing) }
          : line,
      ),
    },
  };
}
const BILLING = "identity.billing";

/**
 * The event's Final Lock answers: each question's result, value, plain
 * explanation, sources, rule, override, resolver and field-work state,
 * plus the outcome and the sections a later change made stale. Any staff
 * member of the event's workspace can read them; changing one is a
 * manager's decision.
 */
export const getFinalLock = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    await scopedEvent(ctx, tenantId, eventId);
    const { input, overrides, printed } = await readFinalLockInput(
      ctx,
      tenantId,
      eventId,
    );
    const report = evaluateFinalLock(input, { overrides, printed });
    return clean(hasManagementAccess(auth) ? report : withoutPrice(report));
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
