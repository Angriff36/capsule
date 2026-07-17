export const PRODUCTION_SECTIONS = [
  { key: "prep", label: "Prep board", path: "/kitchen/prep" },
] as const;

export type ProductionSection = (typeof PRODUCTION_SECTIONS)[number]["key"];
