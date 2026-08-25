/**
 * Real TPP numbers for Mendenhall / Jarvis Wedding (invoice 6153).
 * Data only — product helpers must not import this file.
 *
 * Production quantities stay as written. Recipe lines are production / servings
 * so the event menu can roll cost and pans from encoded recipes.
 *
 * Garnish kit sliced radish 196 lb is a TPP unit bug. KEEP the number.
 */
export const TPP_EVENT = {
  name: "Mendenhall / Jarvis Wedding",
  date: "2026-08-22",
  guests: 98,
  clientName: "Shelby Jarvis",
  venue: "Blackwell Hotel 820 E Sherman CDA",
  salesPerson: "Tim Mitchell",
  invoiceNumber: "6153",
  serviceStyle: "Buffet-Bring Hot",
  stage: "planning",
  salesLock: true,
} as const;

export const TPP_SELL_LINES = [
  { name: "Menu Experience", servings: 98, unitSell: 34.0 },
  { name: "Guacamole and Salsa Bar", servings: 98, unitSell: 4.95 },
  { name: "Watermelon", servings: 98, unitSell: 2.0 },
  { name: "Shredded Lettuce", servings: 98, unitSell: 0.5 },
  { name: "Lemonade", servings: 98, unitSell: 0.0 },
  { name: "Infused Water", servings: 98, unitSell: 1.0 },
] as const;

export const TPP_INVOICE = {
  foodSubtotal: 4160.1,
  eventRents: 4366.6,
  eventLabor: 1540.0,
  charges: 10066.7,
  serviceRate: 0.21,
  serviceAmount: 2114.01,
  afterService: 12180.71,
  taxRate: 0.06,
  taxAmount: 730.84,
  invoiceTotal: 12911.55,
  perPerson: 131.75,
  payments: [
    { amount: 1000.0, date: "2025-11-07" },
    { amount: 11218.95, date: "2026-08-08" },
  ],
  applied: 12646.61,
  balanceDue: 692.6,
} as const;

export type TppUnit =
  | "each"
  | "pound"
  | "ounce"
  | "teaspoon"
  | "quart"
  | "gallon"
  | "batch"
  | "portion";

export type TppRecipeLine = {
  ingredient: string;
  productionQty: number;
  unit: TppUnit;
  sku?: string;
  vendor?: string;
  suspect?: boolean;
};

export type TppDish = {
  name: string;
  course: "Cocktail" | "Buffet" | "Sell";
  servings: number;
  unitSell?: number;
  finishAt?: "event" | "kitchen";
  recipes: readonly TppRecipeLine[];
  containers: readonly {
    name: string;
    servingsPerContainer: number;
    baseQuantity?: number;
    notes?: string;
  }[];
  prep: readonly {
    name: string;
    productionQty: number;
    unit: TppUnit;
    instructions: string;
  }[];
};

function line(
  ingredient: string,
  productionQty: number,
  unit: TppUnit,
  extra: Partial<TppRecipeLine> = {},
): TppRecipeLine {
  return { ingredient, productionQty, unit, ...extra };
}

export const TPP_DISHES: readonly TppDish[] = [
  {
    name: "Menu Experience",
    course: "Sell",
    servings: 98,
    unitSell: 34.0,
    recipes: [],
    containers: [],
    prep: [],
  },
  {
    name: "Guacamole and Salsa Bar",
    course: "Cocktail",
    servings: 98,
    unitSell: 4.95,
    finishAt: "event",
    recipes: [
      line("Cut chips", 18.38, "pound"),
      line("Guacamole", 1.53, "gallon"),
      line("Pico", 3.06, "quart"),
      line("Red salsa", 3.06, "quart"),
      line("Salsa verde", 3.06, "quart"),
      line("2oz cups", 98, "each"),
    ],
    containers: [{ name: "2oz cups", servingsPerContainer: 1 }],
    prep: [
      {
        name: "Guac bar",
        productionQty: 98,
        unit: "portion",
        instructions:
          "Apps — 18.38 lb cut chips + day-of fry; 1.53 gal guac; 3.06 qt pico; 3.06 qt red salsa; 3.06 qt salsa verde; 98 × 2oz cups",
      },
    ],
  },
  {
    name: "Watermelon",
    course: "Cocktail",
    servings: 98,
    unitSell: 2.0,
    finishAt: "event",
    recipes: [],
    containers: [{ name: "Cocktail plate", servingsPerContainer: 1 }],
    prep: [
      {
        name: "Watermelon",
        productionQty: 98,
        unit: "portion",
        instructions: "Finish at Event — serve wedges cocktail hour",
      },
    ],
  },
  {
    name: "Shredded Lettuce",
    course: "Buffet",
    servings: 98,
    unitSell: 0.5,
    recipes: [
      line("Lettuce", 4.59, "pound", { sku: "5332242", vendor: "US Foods" }),
    ],
    containers: [{ name: "Topping bowl", servingsPerContainer: 25 }],
    prep: [
      {
        name: "Lettuce",
        productionQty: 4.59,
        unit: "pound",
        instructions: "P:98 — 4.59 lb",
      },
    ],
  },
  {
    name: "Lemonade",
    course: "Buffet",
    servings: 98,
    unitSell: 0.0,
    recipes: [
      line("Lemonade", 9.8, "gallon"),
      line("Lemon", 58.8, "each"),
      line("Lemonade powder", 4.9, "each", { vendor: "US Foods" }),
    ],
    containers: [{ name: "Beverage dispenser", servingsPerContainer: 49 }],
    prep: [
      {
        name: "Lemonade",
        productionQty: 9.8,
        unit: "gallon",
        instructions: "P:98 — 9.80 gal; 58.80 lemons (3 per bev container)",
      },
    ],
  },
  {
    name: "Infused Water",
    course: "Buffet",
    servings: 98,
    unitSell: 1.0,
    recipes: [
      line("Infused Water Kit", 1.23, "batch", { vendor: "Mangia" }),
      line("Water", 6.13, "gallon"),
      line("Ice", 24.5, "pound"),
    ],
    containers: [{ name: "Beverage dispenser", servingsPerContainer: 49 }],
    prep: [
      {
        name: "Infused water",
        productionQty: 1.23,
        unit: "batch",
        instructions: "P:98 — 1.23 batch kit; 6.13 gal water; 24.50 lb ice",
      },
    ],
  },
  {
    name: "Pollo Asada",
    course: "Buffet",
    servings: 59,
    recipes: [line("Pollo Asada", 14.75, "pound", { vendor: "US Foods" })],
    containers: [{ name: "Chafer set", servingsPerContainer: 20 }],
    prep: [
      {
        name: "Pollo Asada",
        productionQty: 14.75,
        unit: "pound",
        instructions: "P:59 — 14.75 lb finished",
      },
    ],
  },
  {
    name: "Carne Asada",
    course: "Buffet",
    servings: 59,
    recipes: [
      line("Carne Asada", 14.75, "pound", { vendor: "US Foods" }),
      line("Johnny's", 29.5, "teaspoon", {
        sku: "7622573",
        vendor: "US Foods",
      }),
    ],
    containers: [{ name: "Chafer set", servingsPerContainer: 20 }],
    prep: [
      {
        name: "Carne Asada",
        productionQty: 14.75,
        unit: "pound",
        instructions: "P:59 — 14.75 lb finished; 29.50 tsp Johnny's",
      },
    ],
  },
  {
    name: "Grilled Fajita Veggies",
    course: "Buffet",
    servings: 5,
    recipes: [line("Fajita veggies", 1.65, "pound")],
    containers: [{ name: "Half pan", servingsPerContainer: 5 }],
    prep: [
      {
        name: "Fajita veggies",
        productionQty: 1.65,
        unit: "pound",
        instructions: "P:5 — 1.65 lb vegan only",
      },
    ],
  },
  {
    name: "Flour tortillas",
    course: "Buffet",
    servings: 58,
    recipes: [
      line("Flour tortillas", 174, "each", {
        sku: "2644748",
        vendor: "US Foods",
      }),
    ],
    containers: [{ name: "Tortilla basket", servingsPerContainer: 25 }],
    prep: [
      {
        name: "Flour tortillas",
        productionQty: 174,
        unit: "each",
        instructions: "P:58 — 174 each grill-mark wrap 25/foil",
      },
    ],
  },
  {
    name: "Corn tortillas",
    course: "Buffet",
    servings: 59,
    recipes: [line("Corn tortillas", 354, "each")],
    containers: [{ name: "GF tortilla vessel", servingsPerContainer: 25 }],
    prep: [
      {
        name: "Corn tortillas",
        productionQty: 354,
        unit: "each",
        instructions:
          "P:59 — SET IN OWN VESSEL LABEL GF; 354 each grill-mark wrap 25/foil",
      },
    ],
  },
  {
    name: "Black beans",
    course: "Buffet",
    servings: 58,
    recipes: [
      line("Black beans", 1.81, "gallon", {
        sku: "9332313",
        vendor: "US Foods",
      }),
    ],
    containers: [{ name: "Half pan", servingsPerContainer: 20 }],
    prep: [
      {
        name: "Black beans",
        productionQty: 1.81,
        unit: "gallon",
        instructions:
          "P:58 Finish at Kitchen — SET IN HALF PANS; 1.81 gal make black beans",
      },
    ],
  },
  {
    name: "Refried beans",
    course: "Buffet",
    servings: 59,
    recipes: [
      line("Refried beans", 24.58, "pound", {
        sku: "5531805",
        vendor: "US Foods",
      }),
    ],
    containers: [{ name: "Half pan", servingsPerContainer: 20 }],
    prep: [
      {
        name: "Refried",
        productionQty: 24.58,
        unit: "pound",
        instructions: "P:59 — SET IN HALF PANS",
      },
    ],
  },
  {
    name: "Mexican rice",
    course: "Buffet",
    servings: 58,
    recipes: [line("Mexican rice", 1.81, "gallon")],
    containers: [{ name: "Half pan", servingsPerContainer: 20 }],
    prep: [
      {
        name: "Mexican rice",
        productionQty: 1.81,
        unit: "gallon",
        instructions: "P:58 — HALF PANS; 1.81 gal",
      },
    ],
  },
  {
    name: "Cilantro lime rice",
    course: "Buffet",
    servings: 59,
    recipes: [
      line("Cilantro lime rice", 2.77, "quart", { vendor: "US Foods" }),
      line("Water", 1.38, "gallon"),
    ],
    containers: [{ name: "Half pan", servingsPerContainer: 20 }],
    prep: [
      {
        name: "Cilantro lime rice",
        productionQty: 2.77,
        unit: "quart",
        instructions:
          "P:59 — SET IN HALF PANS; 2.77 qt dry rice; 1.38 gal water day-of",
      },
    ],
  },
  {
    name: "Pico",
    course: "Buffet",
    servings: 117,
    recipes: [line("Pico", 1.83, "gallon", { vendor: "US Foods" })],
    containers: [{ name: "Topping bowl", servingsPerContainer: 25 }],
    prep: [
      {
        name: "Pico",
        productionQty: 1.83,
        unit: "gallon",
        instructions: "P:117 — 1.83 gal",
      },
    ],
  },
  {
    name: "Sour cream",
    course: "Buffet",
    servings: 117,
    recipes: [
      line("Sour cream", 1.83, "gallon", {
        sku: "7060429",
        vendor: "US Foods",
      }),
    ],
    containers: [{ name: "Topping bowl", servingsPerContainer: 25 }],
    prep: [
      {
        name: "Sour cream",
        productionQty: 1.83,
        unit: "gallon",
        instructions: "P:117 — 1.83 gal",
      },
    ],
  },
  {
    name: "Cotija",
    course: "Buffet",
    servings: 117,
    recipes: [line("Cotija", 2.56, "pound")],
    containers: [{ name: "Topping bowl", servingsPerContainer: 25 }],
    prep: [
      {
        name: "Cotija",
        productionQty: 2.56,
        unit: "pound",
        instructions: "P:117 — 2.56 lb",
      },
    ],
  },
  {
    name: "Cilantro",
    course: "Buffet",
    servings: 117,
    recipes: [
      line("Cilantro", 7.31, "pound", { sku: "7912380", vendor: "US Foods" }),
    ],
    containers: [{ name: "Topping bowl", servingsPerContainer: 25 }],
    prep: [
      {
        name: "Cilantro",
        productionQty: 7.31,
        unit: "pound",
        instructions: "P:117 — 7.31 lb portion and chop",
      },
    ],
  },
  {
    name: "Diced onions",
    course: "Buffet",
    servings: 117,
    recipes: [line("Diced onions", 7.31, "pound")],
    containers: [{ name: "Topping bowl", servingsPerContainer: 25 }],
    prep: [
      {
        name: "Diced onions",
        productionQty: 7.31,
        unit: "pound",
        instructions: "P:117 — 7.31 lb",
      },
    ],
  },
  {
    name: "Garnish kit",
    course: "Buffet",
    servings: 98,
    recipes: [
      line("Garnish kit", 98, "each"),
      // KEEP 196 lb — TPP unit bug. Flag in UI, do not convert.
      line("Sliced radish", 196, "pound", { suspect: true }),
      line("Cilantro", 49, "pound"),
    ],
    containers: [{ name: "Garnish kit", servingsPerContainer: 1 }],
    prep: [
      {
        name: "Garnish kit",
        productionQty: 98,
        unit: "each",
        instructions:
          "P:98 — 98 kits; 196 lb sliced radish; 49 lb cilantro (radish 196 lb is a TPP unit bug — KEEP the number)",
      },
    ],
  },
];

export const TPP_PACK = {
  chaferSets: 7,
  sterno: 12,
  beverageDispensers: 2,
  twoOzCups: 98,
  cocktailPlates: 200,
  cocktailNapkins: 200,
  nineOzCups: 215.6,
  proteinLb: 14.75,
  flourTortillas: 174,
  cornTortillas: 354,
} as const;

export const TPP_PO_LINES = [
  {
    vendor: "Unassigned",
    name: "Guacamole",
    qty: 18.38,
    unit: "quart" as TppUnit,
  },
  { vendor: "Unassigned", name: "Lemon", qty: 58.8, unit: "each" as TppUnit },
  { vendor: "Unassigned", name: "Oil", qty: 0.03, unit: "gallon" as TppUnit },
  {
    vendor: "Unassigned",
    name: "Shredded Jack",
    qty: 1.23,
    unit: "pound" as TppUnit,
  },
  {
    vendor: "Unassigned",
    name: "Sliced radish",
    qty: 196,
    unit: "pound" as TppUnit,
  },
  {
    vendor: "Event Rents",
    name: "Event Rents",
    qty: 1,
    unit: "each" as TppUnit,
  },
  {
    vendor: "Mangia",
    name: "Infused Water Kit",
    qty: 1.23,
    unit: "batch" as TppUnit,
  },
  {
    vendor: "US Foods",
    name: "Flour tortillas",
    qty: 174,
    unit: "each" as TppUnit,
    sku: "2644748",
  },
  {
    vendor: "US Foods",
    name: "Chicken base",
    qty: 0.31,
    unit: "pound" as TppUnit,
    sku: "3012341",
  },
  {
    vendor: "US Foods",
    name: "Black beans",
    qty: 464,
    unit: "ounce" as TppUnit,
    sku: "9332313",
  },
  {
    vendor: "US Foods",
    name: "Carne Asada",
    qty: 14.75,
    unit: "pound" as TppUnit,
  },
  {
    vendor: "US Foods",
    name: "Cilantro",
    qty: 784,
    unit: "ounce" as TppUnit,
    sku: "7912380",
  },
  {
    vendor: "US Foods",
    name: "Cilantro lime rice",
    qty: 59,
    unit: "quart" as TppUnit,
  },
  {
    vendor: "US Foods",
    name: "EVOO",
    qty: 0.03,
    unit: "gallon" as TppUnit,
    sku: "1333970",
  },
  { vendor: "US Foods", name: "Garlic", qty: 0.16, unit: "pound" as TppUnit },
  { vendor: "US Foods", name: "Pepper", qty: 0.04, unit: "pound" as TppUnit },
  {
    vendor: "US Foods",
    name: "Johnny's",
    qty: 1.84,
    unit: "pound" as TppUnit,
    sku: "7622573",
  },
  {
    vendor: "US Foods",
    name: "Kosher salt",
    qty: 0.04,
    unit: "pound" as TppUnit,
  },
  {
    vendor: "US Foods",
    name: "Lemon juice",
    qty: 0.12,
    unit: "gallon" as TppUnit,
  },
  {
    vendor: "US Foods",
    name: "Lemonade powder",
    qty: 4.9,
    unit: "each" as TppUnit,
  },
  { vendor: "US Foods", name: "Pico", qty: 10.38, unit: "quart" as TppUnit },
  {
    vendor: "US Foods",
    name: "Pollo Asada",
    qty: 14.75,
    unit: "pound" as TppUnit,
  },
  {
    vendor: "US Foods",
    name: "Red salsa",
    qty: 3.06,
    unit: "quart" as TppUnit,
  },
  {
    vendor: "US Foods",
    name: "Refried beans",
    qty: 24.58,
    unit: "pound" as TppUnit,
    sku: "5531805",
  },
  {
    vendor: "US Foods",
    name: "White rice",
    qty: 4.25,
    unit: "pound" as TppUnit,
    sku: "9419433",
  },
  {
    vendor: "US Foods",
    name: "Medium salsa",
    qty: 0.31,
    unit: "gallon" as TppUnit,
  },
  {
    vendor: "US Foods",
    name: "Lettuce",
    qty: 4.59,
    unit: "pound" as TppUnit,
    sku: "5332242",
  },
  {
    vendor: "US Foods",
    name: "Sour cream",
    qty: 7.31,
    unit: "quart" as TppUnit,
    sku: "7060429",
  },
  {
    vendor: "US Foods",
    name: "White onion",
    qty: 1.23,
    unit: "pound" as TppUnit,
  },
  {
    vendor: "US Foods",
    name: "Whole milk",
    qty: 0.15,
    unit: "gallon" as TppUnit,
  },
] as const;

/** Per-serving recipe quantity so UI * servings = TPP production qty. */
export function tppPerServingQty(
  productionQty: number,
  servings: number,
): number {
  if (!(servings > 0)) return 0;
  return Number((productionQty / servings).toFixed(6));
}

export function tppFoodSellTotal(): number {
  return Number(
    TPP_SELL_LINES.reduce(
      (sum, line) => sum + line.servings * line.unitSell,
      0,
    ).toFixed(2),
  );
}
