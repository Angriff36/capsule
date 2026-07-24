export const LOGISTICS_SECTIONS = [
  { key: "packs", label: "Pack lists", path: "/logistics/packs" },
  { key: "deliveries", label: "Deliveries", path: "/logistics/deliveries" },
  { key: "schedule", label: "Vehicle schedule", path: "/logistics/schedule" },
  { key: "route", label: "Route planner", path: "/logistics/route" },
  { key: "fleet", label: "Fleet", path: "/logistics/fleet" },
  { key: "maintenance", label: "Maintenance", path: "/logistics/maintenance" },
] as const;

export type LogisticsSection = (typeof LOGISTICS_SECTIONS)[number]["key"];
