/**
 * Plain-language help for fields whose value feeds the demand math. Wording
 * follows convex/lib/culinaryModel/demand.ts and the Stock book shortfall.
 */
export type FieldHelpTerm =
  | "yield"
  | "dishYield"
  | "batchMultiplier"
  | "demand"
  | "supersedeDemand"
  | "parLevel"
  | "purchaseEligibility"
  | "yieldVariance"
  | "closeout";

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
  demand: {
    title: "Demand",
    body: "The ingredient amount an event requires. Capsule usually calculates it from dishes, guest count, recipe yield, and batch multiplier; staff can add uncovered items by hand. Confirmed demand feeds purchasing.",
    example:
      "A 100-guest event with dishes needing 20 lb of vegetables creates that ingredient demand before a buyer opens a purchase need.",
    link: {
      href: "/inventory/demand",
      label: "See the event-to-purchase cascade",
    },
  },
  supersedeDemand: {
    title: "Supersede demand",
    body: "Retire a calculated or confirmed demand line without deleting its history. It stops qualifying for new purchase work, requires a reason, and any purchase needs already created from it must be reviewed because Capsule does not silently rewrite them.",
    example:
      "After a menu change, supersede the old chicken demand with the regenerated line rather than deleting the original evidence.",
    link: {
      href: "/inventory/demand",
      label: "See the event-to-purchase cascade",
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
  yieldVariance: {
    title: "Yield variance",
    body: "Actual completed-batch output minus planned output. A negative result is under plan; a positive result is over. Different units stay separate.",
    example:
      "A batch planned for 10 gal that produces 8 gal has a -2 gal yield variance.",
    link: {
      href: "/kitchen/yield",
      label: "See the event-to-purchase cascade",
    },
  },
  closeout: {
    title: "Closeout",
    body: "An event's wrap-up after completion: close out the event, capture revenue, cost, and headcount from source records, then finalize the folio. Later changes require an audited correction.",
    example:
      "After the event is closed out, capture the recorded totals and finalize the folio when the reconciliation is ready.",
    link: {
      href: "/finance/closeout",
      label: "See the event-to-purchase cascade",
    },
  },
};
