import type {
  CatalogIngredient,
  IngredientMatchStatus,
  ParsedIngredientLine,
  ReviewIngredientLine,
} from "./RecipeImportTypes";

const PLURAL_SUFFIXES = ["ies", "es", "s"];

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularForms(name: string): string[] {
  const base = normalize(name);
  const forms = new Set<string>([base]);
  for (const suffix of PLURAL_SUFFIXES) {
    if (base.endsWith(suffix)) {
      forms.add(base.slice(0, -suffix.length));
    }
  }
  if (base.endsWith("s")) forms.add(base.slice(0, -1));
  return [...forms];
}

function tokens(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((token) => token.length > 1);
}

/**
 * Resolves parsed ingredient names against the live Ingredient catalog.
 */
export class IngredientCatalogMatcher {
  matchLine(
    line: ParsedIngredientLine,
    catalog: readonly CatalogIngredient[],
  ): ReviewIngredientLine {
    const active = catalog.filter((item) => item.deletedAt == null);
    const exact = active.find((item) =>
      singularForms(item.name).some((form) =>
        singularForms(line.name).some((needle) => needle === form),
      ),
    );
    if (exact) {
      return {
        ...line,
        matchStatus: "exact",
        matchedIngredientId: exact.id,
        matchedIngredientName: exact.name,
        possibleMatchIds: [],
        possibleMatchNames: [],
        createNew: false,
      };
    }

    const possible = this.findPossible(line.name, active);
    if (possible.length === 1) {
      return {
        ...line,
        matchStatus: "possible",
        possibleMatchIds: [possible[0].id],
        possibleMatchNames: [possible[0].name],
        createNew: false,
      };
    }
    if (possible.length > 1) {
      return {
        ...line,
        matchStatus: "possible",
        possibleMatchIds: possible.map((item) => item.id),
        possibleMatchNames: possible.map((item) => item.name),
        createNew: false,
      };
    }

    return {
      ...line,
      matchStatus: "new",
      possibleMatchIds: [],
      possibleMatchNames: [],
      createNew: true,
    };
  }

  matchAll(
    lines: readonly ParsedIngredientLine[],
    catalog: readonly CatalogIngredient[],
  ): ReviewIngredientLine[] {
    return lines.map((line) => this.matchLine(line, catalog));
  }

  private findPossible(
    name: string,
    catalog: readonly CatalogIngredient[],
  ): CatalogIngredient[] {
    const needleForms = singularForms(name);
    const needleTokens = tokens(name);
    const matches: CatalogIngredient[] = [];

    for (const item of catalog) {
      const hay = normalize(item.name);
      const hayForms = singularForms(item.name);
      if (
        needleForms.some((form) => hay.includes(form) || form.includes(hay)) ||
        hayForms.some((form) => needleForms.some((needle) => needle.includes(form)))
      ) {
        matches.push(item);
        continue;
      }
      const overlap = tokens(item.name).filter((token) =>
        needleTokens.includes(token),
      ).length;
      if (overlap >= 2) matches.push(item);
    }

    return matches;
  }

  statusLabel(status: IngredientMatchStatus): string {
    switch (status) {
      case "exact":
        return "Exact match";
      case "possible":
        return "Possible match";
      case "new":
        return "New ingredient";
      case "confirmed_existing":
        return "Confirmed existing";
      case "confirmed_new":
        return "Confirmed new";
    }
  }
}
