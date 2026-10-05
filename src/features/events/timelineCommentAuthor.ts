type PersonName = {
  readonly _id: string;
  readonly givenName?: string | null;
  readonly familyName?: string | null;
};

/**
 * Name shown on a timeline comment: the author's staff profile (the server
 * records it from the sign-in), falling back to the name saved with the note.
 */
export function authorLabel(
  people: readonly PersonName[] | undefined,
  comment: { readonly authorPersonId: string; readonly authorName: string },
): string {
  const person = people?.find((row) => row._id === comment.authorPersonId);
  const name = [person?.givenName, person?.familyName]
    .filter(Boolean)
    .join(" ");
  return name || comment.authorName;
}
