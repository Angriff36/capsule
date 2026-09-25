/**
 * Shared helpers for the venue-notes runtime proof (AC-316). Extracted so the
 * proof file stays under the ~400-line rule. No assertion logic lives here.
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

export const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;
export const M = api.mutations;

export function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

export type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

export async function hireStaff(
  proof: ReturnType<typeof harness>,
  tenantId: string,
  label: string,
  personRole: "event_staff" | "event_manager" | "admin",
) {
  const authSubjectId = `user_${tenantId}_${label}`;
  // Linking an admin-role Person requires an adminAccess actor (the link
  // guard refuses linking into a role above the actor), so hire+link as admin.
  const manager = proof.asRole({
    subject: `workforce-${tenantId}-${label}`,
    role: personRole === "admin" ? "admin" : "workforce_manager",
    tenantId,
  });
  const person = (await proof.executeCommand(manager, M.Person_createViaHire, {
    givenName: "Riley",
    familyName: label,
    email: `riley-${label}-${tenantId}@proof.example`,
    role: personRole,
    employmentType: "full_time",
  })) as { docId: string };
  await proof.executeCommand(manager, M.Person_linkAccount, {
    docId: person.docId,
    authSubjectId,
  });
  return { personId: person.docId, authSubjectId };
}

export async function registerVenue(
  proof: ReturnType<typeof harness>,
  actor: Actor,
  name: string,
  capacity: number,
) {
  const venue = (await proof.executeCommand(actor, M.Venue_createViaRegister, {
    name,
    venueType: "other" as const,
    capacity,
  })) as { docId: string };
  return venue.docId;
}

/** Client + Event via plan engagement, so an optional note eventId is real. */
export async function createEvent(
  proof: ReturnType<typeof harness>,
  tenantId: string,
  title: string,
): Promise<string> {
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Venue note proof client ${tenantId} ${title}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey VenueNote",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return event.docId;
}

export async function postNote(
  proof: ReturnType<typeof harness>,
  actor: Actor,
  venueId: string,
  authorPersonId: string,
  authorName: string,
  content: string,
  extra?: {
    eventId?: string;
    category?: "logistics" | "access";
    visibility?: "public" | "internal" | "management_only";
  },
) {
  const created = (await proof.executeCommand(
    actor,
    M.VenueNote_createViaPost,
    {
      venueId,
      eventId: extra?.eventId,
      authorPersonId,
      authorName,
      category: extra?.category ?? ("other" as const),
      content,
      // The generated create does not apply the property default, so the
      // stored visibility must be passed explicitly on every post.
      visibility: extra?.visibility ?? ("internal" as const),
    },
  )) as { docId: string };
  return created.docId;
}

export type NoteRow = {
  _id: string;
  venueId: string;
  eventId: string | null;
  authorPersonId: string;
  authorName: string;
  category: string;
  content: string;
  visibility: string;
  isPinned: boolean;
  postedAt: number | null;
  deletedAt: number | null;
  version: number;
};

export async function readNote(actor: Actor, noteId: string): Promise<NoteRow> {
  const row = (await actor.query(api.queries.getVenueNote, {
    id: noteId,
  })) as NoteRow;
  // isPinned is stored only once set; absent reads as the false default.
  return {
    ...row,
    isPinned: row.isPinned ?? false,
    deletedAt: row.deletedAt ?? null,
  };
}

/** Raw row read: survives a soft delete where the read policy hides the note.
 * Optional fields a row never wrote come back undefined; normalize. */
export async function rawNote(actor: Actor, noteId: string): Promise<NoteRow> {
  const doc = (await actor.run(async (ctx) =>
    ctx.db.get(noteId as never),
  )) as NoteRow;
  return {
    ...doc,
    isPinned: doc.isPinned ?? false,
    deletedAt: doc.deletedAt ?? null,
    eventId: doc.eventId ?? null,
    postedAt: doc.postedAt ?? null,
  };
}

export type LedgerRow = { type: string; entityId: string };

export async function noteLedger(
  actor: Actor,
  noteId: string,
  type: string,
): Promise<LedgerRow[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as LedgerRow[];
  return rows.filter((row) => row.type === type && row.entityId === noteId);
}
