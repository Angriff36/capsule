import { v } from "convex/values";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { getAuthContext, requireTenant } from "../authContext";
import { storageNotOwnedElsewhere } from "../../fileStorage";
import { authorize, hasManagementAccess } from "./commands";
import {
  eventFieldForms,
  personNames,
  readFinalLockInput,
} from "./finalLockInput";
import { eventRows, scopedEvent } from "./reconcileNative";
import { planFieldForms } from "../../../src/lib/eventPacket/finalLock/fieldForms";
import { canonicalJson } from "../../../src/lib/eventPacket/model";
import {
  evaluateFinalLock,
  lineText,
  type FinalLockReport,
} from "../../../src/lib/eventPacket/finalLock/evaluate";
import type {
  FinalLockAnswer,
  FinalLockValue,
} from "../../../src/lib/eventPacket/finalLock/types";
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
        ? {
            ...a.override,
            value: billTo
              ? { type: "record", fields: { billTo } }
              : { type: "none" },
            reason: "Manager decision.",
          }
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
    /** For who pays: the payer goes in `answer`, the price here. */
    price: v.optional(v.number()),
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
    if (args.price != null && !(Number.isFinite(args.price) && args.price >= 0))
      throw new Error("Enter the price as a number, 0 or more");
    // Who pays keeps the payer and the price apart, so staff who may not
    // see the price still see the payer.
    const value: FinalLockValue =
      args.questionKey === BILLING
        ? {
            type: "record",
            fields: { billTo: answer, quotedPrice: args.price ?? null },
          }
        : { type: "text", text: answer };
    const at = new Date().toISOString();
    const decisionId = `finallock:${args.questionKey}:${at}`;
    await ctx.db.insert("eventPacketResolutions", {
      tenantId: auth.tenantId,
      eventId: args.eventId,
      decisionId,
      version: 1,
      issueKey: `finallock.${args.questionKey}`,
      actor: auth.id,
      decidedAt: Date.parse(at),
      decisionJson: canonicalJson({
        kind: "final_lock_override",
        questionKey: args.questionKey,
        basedOn: args.basedOn,
        value,
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

/** An event's day-of forms as people see them: names, times and proof. */
async function fieldFormRows(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
  eventId: Id<"events">,
) {
  const rows = await eventFieldForms(ctx, tenantId, eventId);
  const names = await personNames(
    ctx,
    tenantId,
    rows.flatMap((f) => [
      f.responsiblePersonId,
      f.secondPersonId,
      f.formCompletedById,
      f.formCheckedById,
      f.formEscalatedById,
    ]),
  );
  const name = (id: unknown) =>
    typeof id === "string" ? (names.get(id) ?? "A staff member") : null;
  const out = [];
  for (const f of rows)
    out.push({
      id: f._id as Id<"fieldConfirmations">,
      version: typeof f.version === "number" ? f.version : null,
      eventId: String(f.eventId),
      formKey: String(f.formKey),
      label: String(f.label),
      status: f.status as "open" | "first_signed" | "done",
      needsTwoPeople: !!f.needsTwoPeople,
      evidence: f.evidence as "none" | "note" | "photo",
      dueAt: typeof f.dueAt === "number" ? f.dueAt : null,
      responsiblePersonId: (f.responsiblePersonId as string | undefined) ?? null,
      responsible: name(f.responsiblePersonId),
      secondPersonId: (f.secondPersonId as string | undefined) ?? null,
      second: name(f.secondPersonId),
      instructions: (f.instructions as string | undefined) ?? null,
      expectedItems: (f.expectedItems as string | undefined) ?? null,
      completedBy: name(f.formCompletedById),
      completedById: (f.formCompletedById as string | undefined) ?? null,
      observedAt: typeof f.observedAt === "number" ? f.observedAt : null,
      outcome: (f.outcome as "all_good" | "problem" | undefined) ?? null,
      note: (f.note as string | undefined) ?? null,
      // The form only stores the id it was given: show the photo only when
      // no other company or private chat owns that file.
      photoUrl:
        f.photoStorageId &&
        (await storageNotOwnedElsewhere(
          ctx,
          tenantId,
          f.photoStorageId as string,
        ))
          ? await ctx.storage.getUrl(f.photoStorageId as Id<"_storage">)
          : null,
      checkedBy: name(f.formCheckedById),
      secondObservedAt:
        typeof f.secondObservedAt === "number" ? f.secondObservedAt : null,
      secondNote: (f.secondNote as string | undefined) ?? null,
      escalatedAt: typeof f.escalatedAt === "number" ? f.escalatedAt : null,
      escalatedBy: name(f.formEscalatedById),
      escalationNote: (f.escalationNote as string | undefined) ?? null,
    });
  return out;
}

export type FieldFormRow = Awaited<ReturnType<typeof fieldFormRows>>[number];

/**
 * Sets up the event's missing day-of forms: who does each, when, what to
 * check and what proof to leave. Nothing is marked done; the people on the
 * day fill them in. Forms already set up are left as they are.
 */
export const prepareFieldForms = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    await scopedEvent(ctx, tenantId, eventId);
    const { input } = await readFinalLockInput(ctx, tenantId, eventId);
    const existing = new Set(
      (await eventFieldForms(ctx, tenantId, eventId)).map((f) =>
        String(f.formKey),
      ),
    );
    const crew = (await eventRows(ctx, "eventAssignments", tenantId, eventId))
      .filter((a) => a.status !== "unassigned" && a.declinedAt == null)
      .map((a) => ({
        personId: String(a.personId),
        role: String(a.role ?? ""),
      }));
    const driverIds = input.vehicles
      .map((r) => r.driverId)
      .filter((id): id is string => !!id);
    const planned = planFieldForms(input, crew, driverIds, existing);
    for (const form of planned)
      await ctx.runMutation(api.mutations.FieldConfirmation_createViaPrepare, {
        eventId,
        formKey: form.formKey,
        label: form.label,
        needsTwoPeople: form.needsTwoPeople,
        evidence: form.evidence,
        dueAt: form.dueAt ?? undefined,
        responsiblePersonId: form.responsiblePersonId ?? undefined,
        secondPersonId: form.secondPersonId ?? undefined,
        instructions: form.instructions,
        expectedItems: form.expectedItems ?? undefined,
      });
    return { prepared: planned.length };
  },
});

/** One event's day-of forms, for anyone on its workspace's staff. */
export const listEventFieldForms = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    await scopedEvent(ctx, tenantId, eventId);
    return clean(await fieldFormRows(ctx, tenantId, eventId));
  },
});

/**
 * The signed-in person's day-of forms: every form on events they work (so a
 * stand-in can do one), open ones first. Finished events drop off a day later.
 */
export const myFieldForms = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !auth.personId) return [];
    const tenantId = auth.tenantId;
    const personId = auth.personId;
    const eventIds = new Set<string>();
    const assignments = await (ctx.db as any)
      .query("eventAssignments")
      .withIndex("by_personId", (q: any) => q.eq("personId", personId))
      .collect();
    for (const a of assignments)
      if (
        a.tenantId === tenantId &&
        a.deletedAt == null &&
        a.status !== "unassigned" &&
        a.declinedAt == null
      )
        eventIds.add(String(a.eventId));
    for (const [index, field] of [
      ["by_responsiblePersonId", "responsiblePersonId"],
      ["by_secondPersonId", "secondPersonId"],
    ] as const)
      for (const f of await (ctx.db as any)
        .query("fieldConfirmations")
        .withIndex(index, (q: any) => q.eq(field, personId))
        .collect())
        if (f.tenantId === tenantId && f.deletedAt == null)
          eventIds.add(String(f.eventId));
    const dayAgo = Date.now() - 24 * 60 * 60_000;
    const out = [];
    for (const id of eventIds) {
      const eventId = ctx.db.normalizeId("events", id);
      const event: any = eventId ? await ctx.db.get(eventId) : null;
      if (
        !eventId ||
        !event ||
        event.tenantId !== tenantId ||
        event.deletedAt != null ||
        event.stage === "cancelled" ||
        (typeof event.endsAt === "number" && event.endsAt < dayAgo)
      )
        continue;
      for (const row of await fieldFormRows(ctx, tenantId, eventId))
        out.push({ ...row, eventTitle: String(event.title ?? "") });
    }
    return clean(
      out.sort(
        (a, b) =>
          Number(a.status === "done") - Number(b.status === "done") ||
          (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity),
      ),
    );
  },
});
