import { ConvexError, v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { decrypt } from "./lib/encryption";

const ADMIN_ROLES = new Set(["admin", "owner", "system"]);
const subjectType = v.union(v.literal("client_contact"), v.literal("staff"));

async function requireExportAdmin(ctx: QueryCtx): Promise<string> {
  const auth = await getAuthContext(ctx);
  if (!ADMIN_ROLES.has(auth.role)) {
    throw new ConvexError(
      "Only an organization admin can prepare a personal data export.",
    );
  }
  return requireTenant(auth);
}

async function decryptFields<T extends Record<string, unknown>>(
  ctx: QueryCtx,
  entity: string,
  doc: T,
  fields: readonly string[],
): Promise<T> {
  const output: Record<string, unknown> = { ...doc };
  for (const property of fields) {
    const raw = output[property];
    if (typeof raw !== "string") continue;

    let envelope: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        envelope = parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }

    if (
      envelope?.v !== 1 ||
      typeof envelope.kid !== "string" ||
      typeof envelope.ct !== "string"
    ) {
      continue;
    }
    output[property] = await decrypt(envelope.ct, envelope.kid, {
      ctx,
      entity,
      property,
    });
  }
  return output as T;
}

function displayName(input: {
  givenName?: string | null;
  familyName?: string | null;
  email?: string | null;
}): string {
  const name = [input.givenName, input.familyName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();
  return name || input.email?.trim() || "Unnamed person";
}

function belongsToTenant<T extends { tenantId: string }>(
  rows: T[],
  tenantId: string,
): T[] {
  return rows.filter((row) => row.tenantId === tenantId);
}

export const listSubjects = query({
  args: {},
  handler: async (ctx) => {
    const tenantId = await requireExportAdmin(ctx);
    const [people, clientContacts] = await Promise.all([
      ctx.db
        .query("people")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("clientContacts")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
    ]);

    const [staff, contacts] = await Promise.all([
      Promise.all(
        people.map(async (person) => {
          const decrypted = await decryptFields(ctx, "Person", person, [
            "email",
          ]);
          return {
            id: String(decrypted._id),
            type: "staff" as const,
            displayName: displayName(decrypted),
            email: decrypted.email ?? null,
            status: decrypted.status,
            detail: decrypted.role.replaceAll("_", " "),
          };
        }),
      ),
      Promise.all(
        clientContacts.map(async (contact) => {
          const decrypted = await decryptFields(ctx, "ClientContact", contact, [
            "email",
          ]);
          return {
            id: String(decrypted._id),
            type: "client_contact" as const,
            displayName: displayName(decrypted),
            email: decrypted.email ?? null,
            status: decrypted.status,
            detail: decrypted.title?.trim() || "client contact",
          };
        }),
      ),
    ]);

    return [...staff, ...contacts].sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.type.localeCompare(right.type) ||
        left.id.localeCompare(right.id),
    );
  },
});

export const getSubjectPackage = query({
  args: { subjectType, subjectId: v.string() },
  handler: async (ctx, args) => {
    const tenantId = await requireExportAdmin(ctx);
    if (args.subjectType === "client_contact") {
      return exportClientContact(ctx, tenantId, args.subjectId);
    }
    return exportStaffPerson(ctx, tenantId, args.subjectId);
  },
});

async function exportClientContact(
  ctx: QueryCtx,
  tenantId: string,
  subjectId: string,
) {
  const contactId = ctx.db.normalizeId("clientContacts", subjectId);
  if (!contactId) return null;
  const contact = await ctx.db.get(contactId);
  if (!contact || contact.tenantId !== tenantId) return null;

  const [decryptedContact, communications] = await Promise.all([
    decryptFields(ctx, "ClientContact", contact, ["email", "phone", "mobile"]),
    ctx.db
      .query("clientCommunications")
      .withIndex("by_clientContactId", (q) =>
        q.eq("clientContactId", contactId),
      )
      .collect(),
  ]);

  return {
    schemaVersion: 1,
    organizationId: tenantId,
    subject: {
      id: String(contact._id),
      type: "client_contact" as const,
      displayName: displayName(decryptedContact),
      email: decryptedContact.email ?? null,
      status: contact.status,
      detail: decryptedContact.title?.trim() || "client contact",
    },
    records: {
      clientContact: [decryptedContact],
      clientCommunications: belongsToTenant(communications, tenantId),
    },
  };
}

async function exportStaffPerson(
  ctx: QueryCtx,
  tenantId: string,
  subjectId: string,
) {
  const personId = ctx.db.normalizeId("people", subjectId);
  if (!personId) return null;
  const person = await ctx.db.get(personId);
  if (!person || person.tenantId !== tenantId) return null;

  const [
    decryptedPerson,
    availabilityWindows,
    assignedClients,
    deliveries,
    assignedEvents,
    eventAllergenChecks,
    eventAssignments,
    payrollInputs,
    prepTasks,
    qualifications,
    qualityChecks,
    recurringAvailabilities,
    savedReports,
    shifts,
    timeRecords,
    clientCommunications,
    incidents,
    correctiveActions,
  ] = await Promise.all([
    decryptFields(ctx, "Person", person, ["email", "phone"]),
    ctx.db
      .query("availabilityWindows")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("clients")
      .withIndex("by_assignedToId", (q) => q.eq("assignedToId", personId))
      .collect(),
    ctx.db
      .query("deliveries")
      .withIndex("by_driverId", (q) => q.eq("driverId", personId))
      .collect(),
    ctx.db
      .query("events")
      .withIndex("by_assignedToId", (q) => q.eq("assignedToId", personId))
      .collect(),
    ctx.db
      .query("eventAllergenChecks")
      .withIndex("by_checkedById", (q) => q.eq("checkedById", personId))
      .collect(),
    ctx.db
      .query("eventAssignments")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("payrollInputs")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("prepTasks")
      .withIndex("by_assignedToId", (q) => q.eq("assignedToId", personId))
      .collect(),
    ctx.db
      .query("qualifications")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("qualityChecks")
      .withIndex("by_checkedById", (q) => q.eq("checkedById", personId))
      .collect(),
    ctx.db
      .query("recurringAvailabilities")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("savedReportDefinitions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
    ctx.db
      .query("shifts")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("timeRecords")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect(),
    ctx.db
      .query("clientCommunications")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
    ctx.db
      .query("incidents")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
    ctx.db
      .query("correctiveActions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
  ]);

  const actorIds = new Set(
    [String(person._id), person.authSubjectId]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim()),
  );
  const matchesActor = (value: string | null | undefined) =>
    typeof value === "string" && actorIds.has(value);

  return {
    schemaVersion: 1,
    organizationId: tenantId,
    subject: {
      id: String(person._id),
      type: "staff" as const,
      displayName: displayName(decryptedPerson),
      email: decryptedPerson.email ?? null,
      status: person.status,
      detail: person.role.replaceAll("_", " "),
    },
    records: {
      person: [decryptedPerson],
      availabilityWindows: belongsToTenant(availabilityWindows, tenantId),
      assignedClients: belongsToTenant(assignedClients, tenantId),
      deliveries: belongsToTenant(deliveries, tenantId),
      assignedEvents: belongsToTenant(assignedEvents, tenantId),
      eventAllergenChecks: belongsToTenant(eventAllergenChecks, tenantId),
      eventAssignments: belongsToTenant(eventAssignments, tenantId),
      payrollInputs: belongsToTenant(payrollInputs, tenantId),
      prepTasks: belongsToTenant(prepTasks, tenantId),
      qualifications: belongsToTenant(qualifications, tenantId),
      qualityChecks: belongsToTenant(qualityChecks, tenantId),
      recurringAvailabilities: belongsToTenant(
        recurringAvailabilities,
        tenantId,
      ),
      savedReports: savedReports.filter((row) => matchesActor(row.ownerId)),
      shifts: belongsToTenant(shifts, tenantId),
      timeRecords: belongsToTenant(timeRecords, tenantId),
      authoredClientCommunications: clientCommunications.filter((row) =>
        matchesActor(row.authorId),
      ),
      reportedIncidents: incidents.filter((row) =>
        matchesActor(row.reportedById),
      ),
      correctiveActions: correctiveActions.filter(
        (row) => matchesActor(row.openedById) || matchesActor(row.closedById),
      ),
    },
  };
}
