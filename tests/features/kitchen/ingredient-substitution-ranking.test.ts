import { expect, it } from "vitest";
import {
  rankIngredientSubstitutions,
  type SubstitutionIngredient,
} from "../../../src/features/kitchen/IngredientSubstitution";

const base = { unit: "pound", status: "active", allergens: [] as string[] };
const ingredients: SubstitutionIngredient[] = [
  {
    ...base,
    id: "butter",
    name: "Butter",
    costPerUnit: 5,
    allergens: ["milk"],
    substituteIngredientIds: ["ghee", "margarine", "oil", "lard", "retired"],
  },
  { ...base, id: "ghee", name: "Ghee", costPerUnit: 9, allergens: ["milk"] },
  {
    ...base,
    id: "margarine",
    name: "Margarine",
    costPerUnit: 3,
    allergens: ["soy"],
  },
  { ...base, id: "oil", name: "Olive oil", costPerUnit: 7, unit: "liter" },
  { ...base, id: "lard", name: "Lard", costPerUnit: 4 },
  {
    ...base,
    id: "retired",
    name: "Old spread",
    costPerUnit: 1,
    status: "retired",
  },
  { ...base, id: "unlisted", name: "Shortening", costPerUnit: 2 },
];
const lot = (id: string, ingredientId: string, quantityOnHand: number) => ({
  id,
  ingredientId,
  quantityOnHand,
  unit: "pound",
  stockedAt: 1,
});

it("ranks only the saved, active, same-unit swaps with free stock: no new allergens first, then cheaper", () => {
  const ranked = rankIngredientSubstitutions({
    sourceIngredientId: "butter",
    shortageQuantity: 10,
    shortageUnit: "pound",
    ingredients,
    inventoryItems: [
      lot("a", "ghee", 4),
      lot("b", "margarine", 20),
      lot("c", "lard", 8),
      lot("d", "retired", 50),
      lot("e", "unlisted", 50),
    ],
    reservations: [{ inventoryItemId: "c", quantity: 8, status: "active" }],
  });
  // Lard has stock but all of it is held for other events.
  expect(ranked.map((row) => row.ingredientId)).toEqual(["ghee", "margarine"]);
  expect(ranked[0]).toMatchObject({
    allergenCompatible: true,
    coverageQuantity: 4,
    costDelta: 4,
  });
  expect(ranked[1]).toMatchObject({
    allergenCompatible: false,
    newAllergens: ["soy"],
    coverageQuantity: 10,
    costDelta: -2,
  });
});
