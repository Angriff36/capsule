import { describe, expect, it } from "vitest";
import {
  cateringBooks,
  cateringPackages,
  cateringRecipes,
  defaultCateringSelections,
} from "../src/data/cateringPackages";

describe("catering package catalog", () => {
  it("every package names a known book and only known dishes", () => {
    for (const pack of cateringPackages) {
      expect(cateringBooks[pack.book], pack.id).toBeTruthy();
      for (const group of pack.groups)
        for (const id of group.recipeIds)
          expect(cateringRecipes.has(id), `${pack.id}: ${id}`).toBe(true);
    }
    expect(new Set(cateringPackages.map((p) => p.id)).size).toBe(
      cateringPackages.length,
    );
  });

  it("offers the Drop Off / Limited Service menus from both Express books", () => {
    const names = (book: string) =>
      cateringPackages.filter((p) => p.book === book).map((p) => p.name);
    expect(names("express")).toEqual(
      expect.arrayContaining([
        "Breakfast",
        "Cold Lunch Salads",
        "Platters",
        "Deli Menu",
        "Idaho Baked Potato Bar",
        "BBQ Menu - Pulled Pork",
        "Italian Menu",
        "Traditional Menu - Turkey",
        "Mexican Menu",
      ]),
    );
    expect(names("wedding-express")).toEqual(
      expect.arrayContaining(["Post-Wedding Brunch", "Mexican Menu"]),
    );
    const brunch = cateringPackages.find(
      (p) => p.id === "wedding-express-post-wedding-brunch",
    )!;
    expect(
      brunch.groups[0].recipeIds.map((id) => cateringRecipes.get(id)!.name),
    ).toContain("Mini Quiche Breakfast Platter");
  });

  it("starts an Express menu with one choice per pick and the rest included", () => {
    const mexican = cateringPackages.find(
      (p) => p.id === "express-mexican-menu",
    )!;
    const picks = defaultCateringSelections(mexican, 30).map((line) => [
      cateringRecipes.get(line.recipeId)!.name,
      line.servings,
    ]);
    expect(picks).toEqual([
      ["Taco Bar", 30],
      ["Cilantro Lime Rice", 30],
      ["Black Beans", 30],
    ]);
  });
});
