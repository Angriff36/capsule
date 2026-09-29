import { ConvexError } from "convex/values";
import { findApprovedTimeOffConflict } from "../../src/lib/timeOff";
import {
  parseTemplateLines,
  pickStaffingTemplate,
  qualificationMeets,
  templateLineCount,
  templateLineKey,
} from "../../src/lib/staffingTemplates";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthContext } from "./authContext";
import type { MutationCtx } from "../_generated/server";
import { readCrewWindow } from "./eventStaffingOperations";

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * CF-9.1 guards for NEW staffing (assign, post, claim, fill), run inside the
 * generated command's transaction so a refusal writes nothing:
 * - a cancelled event cannot be staffed;
 * - a finished event can only be staffed with a written reason (recording who
 *   worked after the fact) - only an assignment carries one;
 * - approved time off over the work window is refused, naming the person.
 * A double booking on another event is NOT refused; the roster shows it.
 */
export async function validateNewEventStaffing(
  ctx: MutationCtx,
  entity: "EventAssignment" | "EventStaffNeed",
  id: string,
  personId: Id<"people"> | undefined,
): Promise<void> {
  const row =
    entity === "EventAssignment"
      ? await ctx.db.get(id as Id<"eventAssignments">)
      : await ctx.db.get(id as Id<"eventStaffNeeds">);
  if (!row) return;
  const event = await ctx.db.get(row.eventId);
  if (!event) return;
  if (event.stage === "cancelled")
    throw new ConvexError(
      `${event.title} is cancelled, so no one can be staffed on it.`,
    );
  if (event.stage === "completed" || event.stage === "closed_out") {
    const reason =
      "overrideReason" in row ? row.overrideReason?.trim() : undefined;
    if (!reason)
      throw new ConvexError(
        `${event.title} has already finished. To record who worked it, give a reason.`,
      );
    return;
  }
  if (!personId) return;
  const follows =
    row.followsEventTiming ?? (row.startsAt == null && row.endsAt == null);
  const window = follows
    ? await readCrewWindow(ctx, row.eventId, row)
    : { startsAt: row.startsAt ?? null, endsAt: row.endsAt ?? null };
  if (entity === "EventStaffNeed")
    await assertNeedQualification(ctx, row as Doc<"eventStaffNeeds">, personId,
      window.endsAt ?? event.endsAt ?? null);
  if (window.startsAt == null || window.endsAt == null) return;
  const requests = await ctx.db
    .query("timeOffRequests")
    .withIndex("by_personId", (q) => q.eq("personId", personId))
    .collect();
  const away = findApprovedTimeOffConflict(
    requests.filter((request) => request.tenantId === row.tenantId),
    { personId, startsAt: window.startsAt, endsAt: window.endsAt },
  );
  if (!away) return;
  const person = await ctx.db.get(personId);
  const name = person
    ? `${person.givenName} ${person.familyName}`.trim()
    : "This person";
  throw new ConvexError(
    `${name} has approved time off from ${day.format(away.startsAt!)} through ${day.format(away.endsAt! - 1)}, during ${event.title}. Pick someone else or change the times.`,
  );
}

async function personName(ctx: MutationCtx, personId: Id<"people">) {
  const person = await ctx.db.get(personId);
  return person ? `${person.givenName} ${person.familyName}`.trim() : "This person";
}

/** A need that asks for a certificate is only claimed or filled by a holder. */
async function assertNeedQualification(
  ctx: MutationCtx,
  need: Doc<"eventStaffNeeds">,
  personId: Id<"people">,
  workEndsAt: number | null,
): Promise<void> {
  const name = need.qualificationName?.trim();
  if (!name) return;
  const held = await ctx.db.query("qualifications")
    .withIndex("by_personId", (q) => q.eq("personId", personId)).collect();
  if (held.some((row) => row.tenantId === need.tenantId && qualificationMeets(row,
    { name, certificationType: need.certificationType }, workEndsAt, Date.now()))) return;
  throw new ConvexError(
    `${await personName(ctx, personId)} needs a current ${name} certificate for this work. Pick someone who has one, or add it to their profile first.`,
  );
}

/** A certificate added to a need that someone already holds is checked too. */
export async function validateDescribedDemand(
  ctx: MutationCtx,
  needId: Id<"eventStaffNeeds">,
): Promise<void> {
  const need = await ctx.db.get(needId);
  const personId = need?.filledByPersonId ?? need?.claimedByPersonId;
  if (!need || !personId || need.status === "cancelled") return;
  const event = await ctx.db.get(need.eventId);
  const follows = need.followsEventTiming ?? (need.startsAt == null && need.endsAt == null);
  const window = follows
    ? await readCrewWindow(ctx, need.eventId, need)
    : { endsAt: need.endsAt ?? null };
  await assertNeedQualification(ctx, need, personId, window.endsAt ?? event?.endsAt ?? null);
}

/** One waiting entry per person per shift (AC-507). */
export async function validateWaitlistJoin(
  ctx: MutationCtx,
  entryId: Id<"staffNeedWaitlistEntries">,
): Promise<void> {
  const entry = await ctx.db.get(entryId);
  if (!entry) return;
  const others = await ctx.db.query("staffNeedWaitlistEntries")
    .withIndex("by_staffNeedId", (q) => q.eq("staffNeedId", entry.staffNeedId)).collect();
  if (others.some((row) => row._id !== entryId && row.tenantId === entry.tenantId &&
    row.deletedAt == null && row.personId === entry.personId && row.status === "waiting"))
    throw new ConvexError(
      `${await personName(ctx, entry.personId)} is already on the waiting list for this shift.`,
    );
}

const OPEN_CLOCK_IN_WINDOW_MS = 24 * 60 * 60_000;

/**
 * PL-TIME (AC-126): one open clock-in per person. A retried or doubled
 * clock-in while the person is still clocked in (including across midnight)
 * is refused, so no duplicate punch is made. An entry left open for more than
 * a day does not block a new shift; the time sheet flags it instead.
 */
export async function validateTimeRecordClockIn(
  ctx: MutationCtx,
  recordId: Id<"timeRecords">,
): Promise<void> {
  const record = await ctx.db.get(recordId);
  if (!record || record.clockInAt == null) return;
  const others = await ctx.db.query("timeRecords")
    .withIndex("by_personId", (q) => q.eq("personId", record.personId)).collect();
  const stillIn = others.find((row) => row._id !== recordId &&
    row.tenantId === record.tenantId && row.deletedAt == null &&
    row.status === "open" && row.clockOutAt == null && row.clockInAt != null &&
    record.clockInAt! - row.clockInAt < OPEN_CLOCK_IN_WINDOW_MS);
  if (stillIn)
    throw new ConvexError(
      `${await personName(ctx, record.personId)} is already clocked in. Clock out that time entry first.`,
    );
}

/** Taking or being given a spot takes the person off its waiting list. */
export async function placeFromWaitlist(
  ctx: MutationCtx,
  needId: Id<"eventStaffNeeds">,
  personId: Id<"people"> | undefined,
): Promise<void> {
  if (!personId) return;
  const need = await ctx.db.get(needId);
  if (!need) return;
  const entries = await ctx.db.query("staffNeedWaitlistEntries")
    .withIndex("by_staffNeedId", (q) => q.eq("staffNeedId", needId)).collect();
  for (const entry of entries) {
    if (entry.tenantId !== need.tenantId || entry.deletedAt != null ||
      entry.personId !== personId || entry.status !== "waiting") continue;
    await ctx.runMutation(api.mutations.StaffNeedWaitlistEntry_place, {
      docId: entry._id, version: entry.version,
    });
  }
}

/**
 * Crew template follow-through (AC-495/503): after approval, and after a
 * guest-count or style change while the event is approved or sales-locked,
 * the best matching active template's lines are posted as open needs. Runs
 * again safely: it adds missing slots, cancels only OPEN surplus slots (and
 * open slots of a template that no longer fits), and never touches claimed
 * or filled work. No template = nothing changes.
 */
export async function ensureTemplateStaffNeeds(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const auth = await getAuthContext(ctx);
  if (auth.disabledCapabilities.includes("workforce")) return;
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null) return;
  if (!["approved", "sales_lock"].includes(event.stage)) return;
  const templates = await ctx.db.query("staffingTemplates")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", event.tenantId)).collect();
  const template = pickStaffingTemplate(templates, {
    serviceStyleId: event.serviceStyleId ?? null,
    guests: event.expectedHeadcount ?? null,
  });
  const needs = (await ctx.db.query("eventStaffNeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect())
    .filter((row) => row.tenantId === event.tenantId && row.deletedAt == null &&
      row.staffingTemplateId != null && row.status !== "cancelled");
  const cancelOpen = async (row: Doc<"eventStaffNeeds">, reason: string) => {
    if (row.status !== "open") return;
    await ctx.runMutation(api.mutations.EventStaffNeed_cancel, {
      docId: row._id, version: row.version, reason,
    });
  };
  for (const row of needs.filter((row) => row.staffingTemplateId !== template?._id))
    await cancelOpen(row, "The crew template no longer fits this event");
  if (!template) return;
  const lines = parseTemplateLines(template.lines);
  const keys = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const key = templateLineKey(line, index);
    keys.add(key);
    const wanted = templateLineCount(line, event.expectedHeadcount ?? null);
    const current = needs.filter((row) => row.staffingTemplateId === template._id &&
      row.templateLineKey === key).sort((a, b) => (a.templateSlot ?? 0) - (b.templateSlot ?? 0));
    const used = new Set(current.map((row) => row.templateSlot ?? 0));
    let missing = wanted - current.length;
    for (let slot = 1; missing > 0; slot++) {
      if (used.has(slot)) continue;
      missing--;
      await ctx.runMutation(api.mutations.EventStaffNeed_createViaPostOpen, {
        eventId, role: line.role, staffingTemplateId: template._id, templateLineKey: key, templateSlot: slot,
        skills: line.skills, qualificationName: line.qualificationName, certificationType: line.certificationType,
        uniform: line.uniform, workLocation: line.workLocation, payBasis: line.payBasis,
        budgetHourlyRate: line.budgetHourlyRate,
      });
    }
    const surplus = current.length - wanted;
    if (surplus > 0) {
      const open = current.filter((row) => row.status === "open").reverse().slice(0, surplus);
      for (const row of open) await cancelOpen(row, "Fewer staff needed for this guest count");
    }
  }
  for (const row of needs.filter((row) => row.staffingTemplateId === template._id &&
    !keys.has(row.templateLineKey ?? "")))
    await cancelOpen(row, "The crew template no longer has this role");
}

/**
 * Cross-row scheduling check inside the generated command's transaction.
 *
 * Shift.schedule owns its prerequisites and writes. Until the projection can
 * hydrate nested time-off collections (#75), its event callback supplies this
 * read. Throwing rolls back the Shift, event receipt and idempotency receipt
 * for React, HTTP, MCP and nested generated-command callers alike.
 */
export async function validateScheduledShift(
  ctx: MutationCtx,
  shiftId: Id<"shifts">,
): Promise<void> {
  const shift = await validateShiftWindow(ctx, shiftId);
  const { personId, startsAt, endsAt } = shift;
  const requests = await ctx.db.query("timeOffRequests")
    .withIndex("by_personId", (q) => q.eq("personId", personId)).collect();
  if (findApprovedTimeOffConflict(
    requests.filter((row) => row.tenantId === shift.tenantId),
    { personId, startsAt: startsAt!, endsAt: endsAt! },
  )) {
    throw new ConvexError(
      "This shift overlaps approved time off. Choose another staff member or adjust the shift.",
    );
  }
  // A hand-made shift over the same person's other work is a double booking.
  // Event staffing across events is shown on the roster instead (CF-9.1).
  if (shift.eventStaffingSourceIds?.length) return;
  const others = await ctx.db.query("shifts")
    .withIndex("by_personId", (q) => q.eq("personId", personId)).collect();
  const clash = others.find((row) => row._id !== shift._id &&
    row.tenantId === shift.tenantId && row.deletedAt == null &&
    row.status !== "cancelled" && row.startsAt != null && row.endsAt != null &&
    row.startsAt < endsAt! && row.endsAt > startsAt!);
  if (clash) {
    const person = await ctx.db.get(personId);
    const name = person ? `${person.givenName} ${person.familyName}`.trim() : "This person";
    throw new ConvexError(
      `${name} already has a shift on ${day.format(clash.startsAt!)} that overlaps these times. Change the times or pick someone else.`,
    );
  }
}

/** Unknown planning dates are allowed; non-finite or reversed dates are not. */
export async function validateShiftWindow(
  ctx: MutationCtx,
  shiftId: Id<"shifts">,
  allowIncomplete = false,
) {
  const shift = await ctx.db.get(shiftId);
  if (!shift) throw new Error("Scheduled shift not found");
  const { startsAt, endsAt } = shift;
  if (
    (!allowIncomplete && (startsAt == null || endsAt == null)) ||
    (startsAt != null && !Number.isFinite(startsAt)) ||
    (endsAt != null && !Number.isFinite(endsAt)) ||
    (startsAt != null && endsAt != null && endsAt <= startsAt)
  ) {
    throw new ConvexError("Shift end must be after its start.");
  }
  return shift;
}
