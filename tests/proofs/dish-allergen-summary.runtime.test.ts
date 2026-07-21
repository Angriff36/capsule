/**
 * Focused proof: Dish.allergenSummary is a stored list maintained by
 * classifyAllergens (schema must include the field — orphan docs break Convex).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Dish.allergenSummary stored property", () => {
  it("is declared as a stored property in dish.manifest (not computed-only)", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/culinary/dish.manifest"),
      "utf8",
    );
    expect(source).toMatch(
      /property\s+allergenSummary:\s*list<AllergenCode>\s*=\s*\[\]/,
    );
    expect(source).toMatch(/command\s+classifyAllergens\s*\(/);
    expect(source).not.toMatch(/computed\s+allergenSummary:/);
  });

  it("projects allergenSummary into the Convex dishes table schema", () => {
    const schema = readFileSync(
      resolve(process.cwd(), "convex/schema.ts"),
      "utf8",
    );
    const dishesBlock = schema.match(
      /dishes:\s*defineTable\(\{[\s\S]*?\}\)\s*\n\s*\.index/,
    )?.[0];
    expect(dishesBlock).toBeTruthy();
    expect(dishesBlock).toMatch(/allergenSummary:/);
  });
});
