export const PRODUCTION_SECTIONS = [
  { key: "prep", label: "Kitchen dashboard", path: "/kitchen/prep" },
  { key: "plan", label: "Production plan", path: "/kitchen/plan" },
] as const;

export type ProductionSection = (typeof PRODUCTION_SECTIONS)[number]["key"];
