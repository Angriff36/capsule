import type { FieldHelpTerm } from "../fieldHelpTerms";

export type FieldHelpCascadeStage =
  | "eventPlan"
  | "recipeMath"
  | "demand"
  | "stock"
  | "purchasing"
  | "production"
  | "closeout";

export const FIELD_HELP_CASCADE: ReadonlyArray<{
  id: FieldHelpCascadeStage;
  title: string;
  description: string;
}> = [
  { id: "eventPlan", title: "Event plan", description: "Menu and guest count" },
  {
    id: "recipeMath",
    title: "Recipe math",
    description: "Yield and batch multiplier",
  },
  {
    id: "demand",
    title: "Ingredient demand",
    description: "What the event needs",
  },
  {
    id: "stock",
    title: "Stock and PAR",
    description: "Available stock after reservations",
  },
  {
    id: "purchasing",
    title: "Purchasing",
    description: "Needs, orders, and receipts",
  },
  {
    id: "production",
    title: "Production actuals",
    description: "Completed batch yield",
  },
  {
    id: "closeout",
    title: "Event closeout",
    description: "Capture and finalize the folio",
  },
];

export const FIELD_HELP_STAGE: Record<FieldHelpTerm, FieldHelpCascadeStage> = {
  yield: "recipeMath",
  dishYield: "recipeMath",
  batchMultiplier: "recipeMath",
  demand: "demand",
  supersedeDemand: "demand",
  parLevel: "stock",
  purchaseEligibility: "purchasing",
  yieldVariance: "production",
  closeout: "closeout",
};
