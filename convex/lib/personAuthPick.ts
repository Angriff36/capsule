/**
 * AUTHOR-OWNED — not generated.
 *
 * When more than one live Person/staff row can claim a sign-in (same email
 * inside a workspace, or the same authSubjectId on two rows), pick one
 * deterministically so AuthGate can persist a link and the shell can load.
 * Team roles is not the only recovery path.
 *
 * Pick rule (first difference wins):
 *   1. Prefer a row in the hinted workspace (Clerk active org / JWT tenant).
 *   2. Prefer a row already linked to this sign-in (authSubjectId === subject).
 *   3. Prefer an Admin-capable role (admin / owner / system).
 *   4. Prefer the oldest live row (createdAt, else Convex _creationTime).
 *   5. Stable _id tie-break.
 */
export type LivePersonCandidate = {
  _id: { toString(): string } | string;
  tenantId?: string;
  role?: string;
  status?: string;
  deletedAt?: number | null;
  authSubjectId?: string | null;
  createdAt?: number | null;
  _creationTime?: number;
};

/** Roles that carry adminAccess in src/foundation/base.manifest. */
export const ADMIN_CAPABLE_ROLES = new Set(["admin", "owner", "system"]);

export function isLivePerson(row: LivePersonCandidate): boolean {
  return row.deletedAt == null && String(row.status) === "active";
}

export function tenantIdFromIdentityClaims(
  identity: Record<string, unknown> | null | undefined,
): string {
  if (!identity) return "";
  const org =
    typeof identity.o === "object" && identity.o !== null
      ? (identity.o as Record<string, unknown>)
      : undefined;
  if (typeof identity.tenantId === "string" && identity.tenantId) {
    return identity.tenantId;
  }
  if (typeof org?.id === "string" && org.id) return org.id;
  if (typeof identity.org_id === "string" && identity.org_id) {
    return identity.org_id;
  }
  return "";
}

function idKey(id: LivePersonCandidate["_id"]): string {
  return String(id);
}

function createdMs(row: LivePersonCandidate): number {
  if (typeof row.createdAt === "number" && Number.isFinite(row.createdAt)) {
    return row.createdAt;
  }
  if (
    typeof row._creationTime === "number" &&
    Number.isFinite(row._creationTime)
  ) {
    return row._creationTime;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function pickLivePerson<T extends LivePersonCandidate>(
  rows: readonly T[],
  opts: { subject?: string | null; tenantId?: string | null } = {},
): T | null {
  const live = rows.filter(isLivePerson);
  if (live.length === 0) return null;

  const tenantId = opts.tenantId?.trim() ?? "";
  const inTenant = tenantId
    ? live.filter((row) => row.tenantId === tenantId)
    : [];
  const pool = inTenant.length > 0 ? inTenant : live;
  const subject = opts.subject?.trim() ?? "";

  return [...pool].sort((a, b) => {
    const aSubject = subject && a.authSubjectId === subject ? 0 : 1;
    const bSubject = subject && b.authSubjectId === subject ? 0 : 1;
    if (aSubject !== bSubject) return aSubject - bSubject;

    const aAdmin = a.role && ADMIN_CAPABLE_ROLES.has(a.role) ? 0 : 1;
    const bAdmin = b.role && ADMIN_CAPABLE_ROLES.has(b.role) ? 0 : 1;
    if (aAdmin !== bAdmin) return aAdmin - bAdmin;

    const aAge = createdMs(a);
    const bAge = createdMs(b);
    if (aAge !== bAge) return aAge - bAge;

    return idKey(a._id).localeCompare(idKey(b._id));
  })[0]!;
}

export type PersonEmailLinkDecision<T extends LivePersonCandidate> =
  | { kind: "already"; person: T }
  | { kind: "persist"; person: T }
  | { kind: "ambiguous" };

/**
 * Persist policy around pickLivePerson.
 *
 * Unhinted cross-tenant picks must not write authSubjectId — ClaimGate stays
 * not-ready and workspace buttons remain the recovery. When a tenant hint is
 * present and does not match the already-linked pick, rematch onto a live
 * never-linked email row in the hinted tenant (caller clears the previous
 * subject).
 */
export function decidePersonEmailLink<T extends LivePersonCandidate>(opts: {
  subject: string;
  tenantId?: string | null;
  linkedLive: readonly T[];
  neverLinkedLiveMatches: readonly T[];
}): PersonEmailLinkDecision<T> {
  const hint = opts.tenantId?.trim() ?? "";
  const linked = opts.linkedLive.filter(isLivePerson);
  const neverLinked = opts.neverLinkedLiveMatches.filter(isLivePerson);
  const pool = [...linked, ...neverLinked];

  if (!hint) {
    const tenants = new Set(
      pool
        .map((row) => row.tenantId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    if (tenants.size > 1) return { kind: "ambiguous" };
    const person = pickLivePerson(pool, { subject: opts.subject });
    if (!person) return { kind: "ambiguous" };
    if (person.authSubjectId === opts.subject) {
      return { kind: "already", person };
    }
    return { kind: "persist", person };
  }

  const linkedPick = pickLivePerson(linked, {
    subject: opts.subject,
    tenantId: hint,
  });
  if (linkedPick && linkedPick.tenantId === hint) {
    return { kind: "already", person: linkedPick };
  }

  const rematch = pickLivePerson(neverLinked, {
    subject: opts.subject,
    tenantId: hint,
  });
  if (rematch && rematch.tenantId === hint) {
    return { kind: "persist", person: rematch };
  }

  return { kind: "ambiguous" };
}
