export const PRODUCTION_SECTIONS = [
  { key: "prep", label: "Prep board", path: "/kitchen/prep" },
  { key: "yield", label: "Yield variance", path: "/kitchen/yield" },
] as const;

export type ProductionSection = (typeof PRODUCTION_SECTIONS)[number]["key"];
