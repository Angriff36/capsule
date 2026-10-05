/**
 * Plain-language help for fields whose value feeds the demand math. Wording
 * follows convex/lib/culinaryModel/demand.ts and the Stock book shortfall.
 */
export type FieldHelpTerm =
  | "yield"
  | "dishYield"
  | "batchMultiplier"
  | "parLevel"
  | "purchaseEligibility";

export interface FieldHelpEntry {
  title: string;
  body: string;
  example: string;
  link: { href: string; label: string };
}

export const FIELD_HELP: Record<FieldHelpTerm, FieldHelpEntry> = {
  yield: {
    title: "Yield",
    body: "How much one batch of this recipe makes, in the yield unit. Ingredient amounts are per batch, so event demand divides what a dish needs by this number to count batches.",
    example:
      "A soup that makes 5 gal per batch: a dish that needs 10 gal asks for 2 batches, so every ingredient doubles. Enter 1 gal by mistake and it asks for 10 batches.",
    link: { href: "/inventory/demand", label: "See yield in a demand formula" },
  },
  dishYield: {
    title: "Yield on this dish",
    body: "How many guest portions the batch multiplier below covers. Event demand counts batches as guests ÷ this yield × batch multiplier. Leave 0 to use the subrecipe's own yield.",
    example:
      "Yield 50 with batch multiplier 1: a 100-guest event makes 2 batches of the subrecipe.",
    link: {
      href: "/inventory/demand",
      label: "See batches in a demand formula",
    },
  },
  batchMultiplier: {
    title: "Batch multiplier",
    body: "How many batches of the recipe one yield's worth of guests needs. Every ingredient amount scales by it, so it changes purchase quantities and food cost.",
    example:
      "Yield 50 portions with batch multiplier 2: a 100-guest event makes 4 batches. Use 1 unless one batch does not cover the yield.",
    link: {
      href: "/inventory/demand",
      label: "See the multiplier in a demand formula",
    },
  },
  parLevel: {
    title: "PAR level",
    body: "The amount you want on the shelf after event reservations. When available stock drops below PAR, the Stock book suggests buying the difference. 0 means no PAR target.",
    example:
      "PAR 20 lb with 12 lb available: the Stock book suggests buying 8 lb. Low-stock alerts use the reorder threshold, not PAR.",
    link: { href: "/inventory/stock", label: "See PAR in the Stock book" },
  },
  purchaseEligibility: {
    title: "Purchase",
    body: "A demand line can be bought only when its amount converts to the ingredient's buying unit. Approving the event turns buyable demand into purchase needs; until then this column says it opens on approval.",
    example:
      "2 cups of flour bought in lb needs a cup to lb conversion. Without it the line counts as 0 and shows as unresolved, so nothing is ordered for it.",
    link: {
      href: "/inventory/purchasing",
      label: "See open purchase needs",
    },
  },
};
