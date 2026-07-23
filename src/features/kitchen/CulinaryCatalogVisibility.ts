export type CulinaryCatalogRow = {
  deletedAt?: number | null;
  status?: string | null;
  mergedIntoDishId?: string | null;
  mergedIntoIngredientId?: string | null;
};

/**
 * Kitchen book index rows: hide soft-deleted, retired/discontinued, and merged
 * duplicates unless the operator explicitly asks for the junk drawer.
 */
export class CulinaryCatalogVisibility {
  isLive(row: CulinaryCatalogRow): boolean {
    if (row.deletedAt != null) return false;
    if (row.mergedIntoDishId != null || row.mergedIntoIngredientId != null) {
      return false;
    }
    const status = String(row.status ?? "");
    if (status === "retired" || status === "discontinued") return false;
    return true;
  }

  filterLive<T extends CulinaryCatalogRow>(rows: readonly T[]): T[] {
    return rows.filter((row) => this.isLive(row));
  }
}

export const culinaryCatalogVisibility = new CulinaryCatalogVisibility();
