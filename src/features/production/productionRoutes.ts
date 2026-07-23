export const PRODUCTION_SECTIONS = [
  { key: "prep", label: "Kitchen dashboard", path: "/kitchen/prep" },
  {
    key: "yield",
    label: "Dish yield (on dish detail)",
    path: "/kitchen/dishes",
  },
] as const;

export type ProductionSection = (typeof PRODUCTION_SECTIONS)[number]["key"];
