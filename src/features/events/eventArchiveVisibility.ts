/**
 * Which events a list shows. Archived events stay out of the ledger unless the
 * operator asks for them — an archive must hide an event without deleting it
 * or moving its stage. Kept pure (no convex/react) so the rule is testable on
 * its own and the list page stays a view over it.
 */
export type ArchiveVisibilityRow = {
  readonly deletedAt?: number | null;
  readonly archivedAt?: number | null;
};

export class EventArchiveVisibility {
  /** An event is archived when an archive timestamp was recorded. */
  static isArchived(event: ArchiveVisibilityRow): boolean {
    return (
      typeof event.archivedAt === "number" && Number.isFinite(event.archivedAt)
    );
  }

  /**
   * Rows the ledger shows: never deleted rows, and archived rows only when
   * "Show archived" is on.
   */
  static visibleRows<Row extends ArchiveVisibilityRow>(
    events: readonly Row[] | undefined,
    options: { showArchived: boolean },
  ): Row[] {
    const rows = events ?? [];
    return rows.filter((row) => {
      if (row.deletedAt != null) return false;
      return options.showArchived || !EventArchiveVisibility.isArchived(row);
    });
  }
}
