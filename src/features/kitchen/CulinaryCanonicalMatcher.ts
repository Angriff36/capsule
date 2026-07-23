export type CanonicalLike = {
  _id: string;
  name: string;
  deletedAt?: number | null;
  status?: string;
  canonicalDishId?: string | null;
  canonicalIngredientId?: string | null;
  mergedIntoDishId?: string | null;
  mergedIntoIngredientId?: string | null;
  editionNumber?: number | null;
};

/** Name-similarity helpers for dish/ingredient pickers (no hard uniqueness). */
export class CulinaryCanonicalMatcher {
  normalizeName(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }

  resolveCanonicalId(record: CanonicalLike): string {
    return record.canonicalDishId ?? record.canonicalIngredientId ?? record._id;
  }

  isMergedAway(record: CanonicalLike): boolean {
    return (
      record.mergedIntoDishId != null || record.mergedIntoIngredientId != null
    );
  }

  filterPickerCandidates<T extends CanonicalLike>(records: readonly T[]): T[] {
    return records.filter(
      (record) =>
        record.deletedAt == null &&
        !this.isMergedAway(record) &&
        record.status !== "retired" &&
        record.status !== "discontinued",
    );
  }

  findNameMatches<T extends CanonicalLike>(
    records: readonly T[],
    query: string,
    limit = 8,
  ): T[] {
    const needle = this.normalizeName(query);
    if (!needle) return [];
    const scored = this.filterPickerCandidates(records)
      .map((record) => {
        const name = this.normalizeName(record.name);
        let score = 0;
        if (name === needle) score = 100;
        else if (name.startsWith(needle)) score = 80;
        else if (name.includes(needle)) score = 50;
        else if (needle.includes(name) && name.length >= 3) score = 40;
        return { record, score };
      })
      .filter((row) => row.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.record.name.localeCompare(b.record.name),
      );
    return scored.slice(0, limit).map((row) => row.record);
  }

  likelyDuplicate<T extends CanonicalLike>(
    records: readonly T[],
    query: string,
  ): T | null {
    const matches = this.findNameMatches(records, query, 1);
    if (!matches[0]) return null;
    return this.normalizeName(matches[0].name) === this.normalizeName(query)
      ? matches[0]
      : null;
  }
}

export const culinaryCanonicalMatcher = new CulinaryCanonicalMatcher();
