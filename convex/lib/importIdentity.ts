/**
 * PL-SOURCE-IDENTITY: how an imported row is known, and when it looks like a
 * record Capsule already has.
 *
 * - A row with its own old-system id keeps that id (exact matches run
 *   automatically through the link key).
 * - A row with no id gets a stable id built from what the row says
 *   ("no-id:" + its name and contact details). It is never dressed up as an
 *   old-system id, and the same row gives the same id on every run.
 * - Same name or same email is never a match by itself: the new record is
 *   made on its own and waits for a person to say "same" or "different".
 */

/** Lowercase, trimmed, inner spaces collapsed; "" when empty. */
export function identityText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Stable id for a row with no old-system id, built from its own evidence. */
export function derivedSourceId(
  evidence: ReadonlyArray<string | null | undefined>,
): string {
  return `no-id:${evidence.map((part) => identityText(part).replace(/[~|]/g, " ")).join("~")}`;
}

export function isDerivedSourceId(externalId: string): boolean {
  return externalId.startsWith("no-id:");
}

/** A person's name as one comparable string ("maya chen"). */
export function personNameKey(
  givenName: string | null | undefined,
  familyName: string | null | undefined,
): string {
  return identityText([givenName, familyName].filter(Boolean).join(" "));
}

export type LookAlikeClient = {
  _id: string;
  clientType?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  companyName?: string | null;
  email?: string | null;
  status?: string | null;
  deletedAt?: number | null;
};

/**
 * Why a just-made client may be someone Capsule already has, or null. Only the
 * same full name or the same email counts; a merged or deleted client does
 * not.
 */
export function clientLookAlikeNote(
  made: LookAlikeClient,
  others: ReadonlyArray<LookAlikeClient>,
): string | null {
  const name =
    made.clientType === "company"
      ? identityText(made.companyName)
      : personNameKey(made.givenName, made.familyName);
  const email = identityText(made.email);
  const reasons: string[] = [];
  for (const other of others) {
    if (other._id === made._id) continue;
    if (other.deletedAt != null || other.status === "archived") continue;
    const otherName =
      other.clientType === "company"
        ? identityText(other.companyName)
        : personNameKey(other.givenName, other.familyName);
    const label =
      (other.clientType === "company"
        ? other.companyName
        : [other.givenName, other.familyName].filter(Boolean).join(" ")) ||
      "another client";
    if (name && otherName === name && other.clientType === made.clientType) {
      reasons.push(`Same name as ${label} (${other._id})`);
    } else if (email && identityText(other.email) === email) {
      reasons.push(`Same email as ${label} (${other._id})`);
    }
  }
  if (reasons.length === 0) return null;
  return `${reasons.slice(0, 5).join("; ")}. Check if this is the same client or a different one.`;
}

export type LookAlikeVenue = {
  _id: string;
  name?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  deletedAt?: number | null;
};

/**
 * Why a just-made venue may be one Capsule already has: the same name, or the
 * same street address under another name (a renamed venue).
 */
export function venueLookAlikeNote(
  made: LookAlikeVenue,
  others: ReadonlyArray<LookAlikeVenue>,
): string | null {
  const name = identityText(made.name);
  const address = identityText(made.addressLine1);
  const postal = identityText(made.postalCode);
  const reasons: string[] = [];
  for (const other of others) {
    if (other._id === made._id || other.deletedAt != null) continue;
    const label = other.name || "another venue";
    if (name && identityText(other.name) === name) {
      reasons.push(`Same name as ${label} (${other._id})`);
    } else if (
      address &&
      identityText(other.addressLine1) === address &&
      identityText(other.postalCode) === postal
    ) {
      reasons.push(`Same address as ${label} (${other._id})`);
    }
  }
  if (reasons.length === 0) return null;
  return `${reasons.slice(0, 5).join("; ")}. Check if this is the same venue or a different one.`;
}
