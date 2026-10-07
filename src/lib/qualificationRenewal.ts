type QualificationRow = {
  _id: string;
  personId: unknown;
  name?: unknown;
  certificationType?: unknown;
  status?: unknown;
  expiresAt?: number | null;
  deletedAt?: unknown;
};

const key = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

/**
 * A card that runs out is not a worry once the same person holds a newer
 * active one of the same kind and name that lasts longer.
 */
export function isRenewed(
  row: QualificationRow,
  all: readonly QualificationRow[],
): boolean {
  if (row.expiresAt == null) return false;
  return all.some(
    (other) =>
      other._id !== row._id &&
      other.deletedAt == null &&
      other.status === "active" &&
      String(other.personId) === String(row.personId) &&
      key(other.certificationType) === key(row.certificationType) &&
      key(other.name) === key(row.name) &&
      (other.expiresAt == null || other.expiresAt > (row.expiresAt ?? 0)),
  );
}
