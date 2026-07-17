import type {
  CatalogIngredient,
  IngredientMatchStatus,
  ParsedIngredientLine,
  ReviewIngredientLine,
} from "./RecipeImportTypes";

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((token) => token.length > 1);
}

/**
 * Resolves parsed ingredient names against the live Ingredient catalog.
 * Matching is client-side only — Capsule has no generated full-text search.
 */
export class IngredientCatalogMatcher {
  matchLine(
    line: ParsedIngredientLine,
    catalog: readonly CatalogIngredient[],
  ): ReviewIngredientLine {
    const active = catalog.filter((item) => item.deletedAt == null);
    const exact = active.find(
      (item) => normalize(item.name) === normalize(line.name),
    );
    if (exact) {
      return {
        ...line,
        matchStatus: "matched",
        matchedIngredientId: exact.id,
        matchedIngredientName: exact.name,
        createNew: false,
      };
    }

    const partial = this.findPartial(line.name, active);
    if (partial) {
      return {
        ...line,
        matchStatus: "partial",
        matchedIngredientId: partial.id,
        matchedIngredientName: partial.name,
        createNew: false,
      };
    }

    return {
      ...line,
      matchStatus: "new",
      createNew: true,
    };
  }

  matchAll(
    lines: readonly ParsedIngredientLine[],
    catalog: readonly CatalogIngredient[],
  ): ReviewIngredientLine[] {
    return lines.map((line) => this.matchLine(line, catalog));
  }

  private findPartial(
    name: string,
    catalog: readonly CatalogIngredient[],
  ): CatalogIngredient | undefined {
    const needle = normalize(name);
    const needleTokens = tokens(name);
    let best: { item: CatalogIngredient; score: number } | undefined;

    for (const item of catalog) {
      const hay = normalize(item.name);
      if (hay.includes(needle) || needle.includes(hay)) {
        const score = Math.min(hay.length, needle.length);
        if (!best || score > best.score) best = { item, score };
        continue;
      }
      const overlap = tokens(item.name).filter((token) =>
        needleTokens.includes(token),
      ).length;
      if (overlap >= 2) {
        const score = overlap * 10;
        if (!best || score > best.score) best = { item, score };
      }
    }

    return best?.item;
  }

  statusLabel(status: IngredientMatchStatus): string {
    switch (status) {
      case "matched":
        return "Matched";
      case "partial":
        return "Partial match";
      case "new":
        return "New";
    }
  }
}
