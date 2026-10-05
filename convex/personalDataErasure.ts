/**
 * AUTHOR SEAM - PL-RETENTION (AC-155, PR12-09): erase one person's details
 * on request, with the records and holds named before anything changes.
 *
 * - preview: what is erased, what is deleted, what is kept and why, and what
 *   stops the erase (a hold, a person still working, your own record).
 * - erase: admins only. Clears contact and home details and deletes personal
 *   scheduling preferences. Pay, hours, shifts, qualifications and food
 *   safety records are kept with the person's name, so employment and money
 *   history is never lost. One audit row says who did it, when and what.
 * - placeHold / releaseHold: an admin keeps everything about a person (for
 *   example a claim or dispute); erase refuses while the hold stands.
 *
 * There is no schedule: nothing is deleted by time. The owner has not set
 * retention periods (spec open question), so kept records stay until then.
 * Ordinary edits are not touched - this adds no approval to any other step.
 *
 * Holds and erasures live in the step ledger (manifestEvents), so no
 * Manifest entity is needed. Canonical port: none.
 */
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { insertStepEvent } from "./lib/commandAudit";

const ADMIN_ROLES = new Set(["admin", "owner", "system"]);
const subjectType = v.union(v.literal("client_contact"), v.literal("staff"));
type SubjectType = "client_contact" | "staff";

export const ERASURE_EVENT = {
  erased: "PersonalDataErased",
  holdPlaced: "PersonalDataHoldPlaced",
  holdReleased: "PersonalDataHoldReleased",
} as const;

const ENTITY: Record<SubjectType, string> = {
  staff: "Person",
  client_contact: "ClientContact",
};

export interface KeptGroup {
  label: string;
  count: number;
  reason: string;
}

export interface ErasurePreview {
  subjectType: SubjectType;
  subjectId: string;
  displayName: string;
  erasedAt: number | null;
  hold: { reason: string; placedAt: number } | null;
  fieldsErased: string[];
  namesKept: boolean;
  deleted: { label: string; count: number }[];
  kept: KeptGroup[];
  warnings: string[];
  blockers: string[];
}

async function requireAdmin(ctx: QueryCtx) {
  const auth = await getAuthContext(ctx);
  if (!ADMIN_ROLES.has(auth.role)) {
    throw new ConvexError(
      "Only an organization admin can erase personal details or place a hold.",
    );
  }
  return { tenantId: requireTenant(auth), personId: auth.personId ?? null };
}

/** Newest hold / erase rows for one subject in this company. */
async function ledgerState(ctx: QueryCtx, tenantId: string, entityId: string) {
  const rows = await ctx.db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", entityId))
    .collect();
  let hold: ErasurePreview["hold"] = null;
  let erasedAt: number | null = null;
  for (const row of rows.sort((a, b) => a.createdAt - b.createdAt)) {
    const payload = row.payload as { tenantId?: string; reason?: string };
    if (payload?.tenantId !== tenantId) continue;
    if (row.type === ERASURE_EVENT.holdPlaced) {
      hold = { reason: payload.reason ?? "", placedAt: row.createdAt };
    } else if (row.type === ERASURE_EVENT.holdReleased) {
      hold = null;
    } else if (row.type === ERASURE_EVENT.erased) {
      erasedAt = row.createdAt;
    }
  }
  return { hold, erasedAt };
}

function nameOf(given?: string | null, family?: string | null) {
  return [given, family].filter((part) => part?.trim()).join(" ") || "Unnamed";
}

async function staffPlan(
  ctx: QueryCtx,
  tenantId: string,
  personId: Id<"people">,
) {
  const own = <T extends { tenantId: string }>(rows: T[]) =>
    rows.filter((row) => row.tenantId === tenantId);
  const [
    availability,
    recurring,
    payroll,
    time,
    shifts,
    qualifications,
    assignments,
    allergenChecks,
    qualityChecks,
  ] = await Promise.all([
    ctx.db
      .query("availabilityWindows")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect()
      .then(own),
    ctx.db
      .query("recurringAvailabilities")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect()
      .then(own),
    ctx.db
      .query("payrollInputs")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect()
      .then(own),
    ctx.db
      .query("timeRecords")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect()
      .then(own),
    ctx.db
      .query("shifts")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect()
      .then(own),
    ctx.db
      .query("qualifications")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect()
      .then(own),
    ctx.db
      .query("eventAssignments")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect()
      .then(own),
    ctx.db
      .query("eventAllergenChecks")
      .withIndex("by_checkedById", (q) => q.eq("checkedById", personId))
      .collect(),
    ctx.db
      .query("qualityChecks")
      .withIndex("by_checkedById", (q) => q.eq("checkedById", personId))
      .collect(),
  ]);
  const kept: KeptGroup[] = [
    {
      label: "Pay and hours",
      count: payroll.length + time.length,
      reason: "Pay history is kept for the company's tax and wage records.",
    },
    {
      label: "Shifts and event work",
      count: shifts.length + assignments.length,
      reason: "Employment history shows who worked which event.",
    },
    {
      label: "Qualifications",
      count: qualifications.length,
      reason:
        "Food safety and training records are part of employment history.",
    },
    {
      label: "Food safety checks they signed",
      count: own(allergenChecks).length + own(qualityChecks).length,
      reason: "Allergen and quality checks must show who checked them.",
    },
  ].filter((group) => group.count > 0);
  return {
    deletedRows: [...availability, ...recurring].map((row) => row._id),
    deleted: [
      { label: "Availability notes", count: availability.length },
      { label: "Weekly availability", count: recurring.length },
    ].filter((group) => group.count > 0),
    kept,
  };
}

async function buildPreview(
  ctx: QueryCtx,
  tenantId: string,
  actorPersonId: string | null,
  type: SubjectType,
  subjectId: string,
) {
  const { hold, erasedAt } = await ledgerState(ctx, tenantId, subjectId);
  const blockers: string[] = [];
  if (hold) {
    blockers.push(
      `On hold: ${hold.reason}. Release the hold before erasing anything.`,
    );
  }
  if (erasedAt) blockers.push("These details were already erased.");

  if (type === "staff") {
    const personId = ctx.db.normalizeId("people", subjectId);
    const person = personId ? await ctx.db.get(personId) : null;
    if (!personId || !person || person.tenantId !== tenantId) return null;
    const plan = await staffPlan(ctx, tenantId, personId);
    const namesKept = plan.kept.length > 0;
    if (person.status === "active") {
      blockers.push(
        "This person still works here. Mark them inactive or ended before erasing their details.",
      );
    }
    if (actorPersonId === subjectId) {
      blockers.push("You cannot erase your own details.");
    }
    const preview: ErasurePreview = {
      subjectType: type,
      subjectId,
      displayName: nameOf(person.givenName, person.familyName),
      erasedAt,
      hold,
      fieldsErased: [
        ...(namesKept ? [] : ["Name"]),
        "Email",
        "Phone",
        "Home address",
        "Text alert choice",
        "Sign-in link",
      ],
      namesKept,
      deleted: plan.deleted,
      kept: plan.kept,
      warnings: namesKept
        ? [
            "The name stays on kept records so pay and work history still say who it was.",
          ]
        : [],
      blockers,
    };
    return { preview, person, personId, deletedRows: plan.deletedRows };
  }

  const contactId = ctx.db.normalizeId("clientContacts", subjectId);
  const contact = contactId ? await ctx.db.get(contactId) : null;
  if (!contactId || !contact || contact.tenantId !== tenantId) return null;
  const messages = (
    await ctx.db
      .query("clientCommunications")
      .withIndex("by_clientContactId", (q) =>
        q.eq("clientContactId", contactId),
      )
      .collect()
  ).filter((row) => row.tenantId === tenantId);
  const warnings: string[] = [];
  if (contact.status === "active" && contact.isPrimary) {
    warnings.push("The client will have no main contact until you add one.");
  }
  if (contact.status === "active" && contact.isBillingContact) {
    warnings.push("The client will have no billing contact until you add one.");
  }
  const preview: ErasurePreview = {
    subjectType: type,
    subjectId,
    displayName: nameOf(contact.givenName, contact.familyName),
    erasedAt,
    hold,
    fieldsErased: ["Name", "Job title", "Email", "Phone", "Mobile", "Notes"],
    namesKept: false,
    deleted: [],
    kept: messages.length
      ? [
          {
            label: "Messages with the client",
            count: messages.length,
            reason: "Messages are part of the client's sales and event record.",
          },
        ]
      : [],
    warnings,
    blockers,
  };
  return { preview, contact, contactId, deletedRows: [] };
}

export const preview = query({
  args: { subjectType, subjectId: v.string() },
  handler: async (ctx, args): Promise<ErasurePreview | null> => {
    const actor = await requireAdmin(ctx);
    const plan = await buildPreview(
      ctx,
      actor.tenantId,
      actor.personId,
      args.subjectType,
      args.subjectId,
    );
    return plan?.preview ?? null;
  },
});

export const erase = mutation({
  args: { subjectType, subjectId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const plan = await buildPreview(
      ctx,
      actor.tenantId,
      actor.personId,
      args.subjectType,
      args.subjectId,
    );
    if (!plan) {
      throw new ConvexError(
        "Capsule could not find this person. Refresh the page and choose them again.",
      );
    }
    if (plan.preview.blockers.length) {
      throw new ConvexError(plan.preview.blockers.join(" "));
    }
    const now = Date.now();
    if (plan.person && plan.personId) {
      const person = plan.person;
      await ctx.db.patch(plan.personId, {
        ...(plan.preview.namesKept
          ? {}
          : { givenName: "Former", familyName: "staff member" }),
        email: `erased-${plan.personId}@erased.invalid`,
        phone: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        smsAlertsOptIn: false,
        authSubjectId: null,
        version: (person.version ?? 0) + 1,
        updatedAt: now,
      });
    }
    if (plan.contact && plan.contactId) {
      await ctx.db.patch(plan.contactId, {
        givenName: "Removed contact",
        familyName: null,
        title: null,
        email: null,
        phone: null,
        mobile: null,
        notes: null,
        isPrimary: false,
        isBillingContact: false,
        status: "removed",
        removedAt: plan.contact.removedAt ?? now,
        version: (plan.contact.version ?? 0) + 1,
        updatedAt: now,
      });
    }
    for (const rowId of plan.deletedRows) await ctx.db.delete(rowId);
    await insertStepEvent(ctx, {
      type: ERASURE_EVENT.erased,
      entity: ENTITY[args.subjectType],
      entityId: args.subjectId,
      payload: {
        tenantId: actor.tenantId,
        byPersonId: actor.personId,
        subjectType: args.subjectType,
        fieldsErased: plan.preview.fieldsErased,
        deleted: plan.preview.deleted,
        kept: plan.preview.kept.map(({ label, count }) => ({ label, count })),
      },
      createdAt: now,
    });
    return { erasedAt: now };
  },
});

async function writeHold(
  ctx: MutationCtx,
  args: { subjectType: SubjectType; subjectId: string; reason?: string },
  placing: boolean,
) {
  const actor = await requireAdmin(ctx);
  const plan = await buildPreview(
    ctx,
    actor.tenantId,
    actor.personId,
    args.subjectType,
    args.subjectId,
  );
  if (!plan) {
    throw new ConvexError(
      "Capsule could not find this person. Refresh the page and choose them again.",
    );
  }
  const reason = args.reason?.trim() ?? "";
  if (placing && !reason) {
    throw new ConvexError("Say why everything about this person is kept.");
  }
  if (placing === Boolean(plan.preview.hold)) return { changed: false };
  await insertStepEvent(ctx, {
    type: placing ? ERASURE_EVENT.holdPlaced : ERASURE_EVENT.holdReleased,
    entity: ENTITY[args.subjectType],
    entityId: args.subjectId,
    payload: {
      tenantId: actor.tenantId,
      byPersonId: actor.personId,
      subjectType: args.subjectType,
      ...(placing ? { reason } : {}),
    },
    createdAt: Date.now(),
  });
  return { changed: true };
}

export const placeHold = mutation({
  args: { subjectType, subjectId: v.string(), reason: v.string() },
  handler: (ctx, args) => writeHold(ctx, args, true),
});

export const releaseHold = mutation({
  args: { subjectType, subjectId: v.string() },
  handler: (ctx, args) => writeHold(ctx, args, false),
});

/** Erasures and holds in this company, newest first, for the audit list. */
export const history = query({
  args: {},
  handler: async (ctx) => {
    const { tenantId } = await requireAdmin(ctx);
    const rows = (
      await Promise.all(
        Object.values(ERASURE_EVENT).map((type) =>
          ctx.db
            .query("manifestEvents")
            .withIndex("by_type", (q) => q.eq("type", type))
            .collect(),
        ),
      )
    )
      .flat()
      .filter(
        (row) => (row.payload as { tenantId?: string })?.tenantId === tenantId,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
    const names = new Map<string, string>();
    for (const row of rows) {
      const by = (row.payload as { byPersonId?: string | null }).byPersonId;
      if (!by || names.has(by)) continue;
      const id = ctx.db.normalizeId("people", by);
      const person = id ? await ctx.db.get(id) : null;
      names.set(
        by,
        person && person.tenantId === tenantId
          ? nameOf(person.givenName, person.familyName)
          : "An admin",
      );
    }
    return rows.map((row) => {
      const payload = row.payload as {
        byPersonId?: string | null;
        reason?: string;
        subjectType?: SubjectType;
      };
      return {
        id: String(row._id),
        type: row.type,
        subjectType: payload.subjectType ?? "staff",
        subjectId: row.entityId,
        at: row.createdAt,
        by: payload.byPersonId
          ? (names.get(payload.byPersonId) ?? "An admin")
          : "Capsule",
        reason: payload.reason ?? null,
      };
    });
  },
});
