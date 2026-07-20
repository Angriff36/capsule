export const LOGISTICS_SECTIONS = [
  { key: "packs", label: "Pack lists", path: "/logistics/packs" },
  { key: "deliveries", label: "Deliveries", path: "/logistics/deliveries" },
] as const;

export type LogisticsSection = (typeof LOGISTICS_SECTIONS)[number]["key"];
