/** Use the same persisted identity as server commands, never a browser pick or name guess. */
export function resolveMyDayAccount<
  T extends {
    _id: string;
    tenantId?: string;
    authSubjectId?: string | null;
    status?: string;
    deletedAt?: number | null;
  },
>(
  people: readonly T[],
  auth:
    | {
        authenticated: boolean;
        personId?: string | null;
        tenantId?: string | null;
      }
    | undefined,
  subject: string | undefined,
): T | undefined {
  if (!subject || !auth?.authenticated || !auth.personId || !auth.tenantId)
    return undefined;
  return people.find(
    (person) =>
      person._id === auth.personId &&
      person.tenantId === auth.tenantId &&
      person.authSubjectId === subject &&
      person.status === "active" &&
      person.deletedAt == null,
  );
}
