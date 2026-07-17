export const WORKFORCE_SECTIONS = [
  { key: "roster", label: "Roster", path: "/staff/roster" },
  { key: "time", label: "Time & availability", path: "/staff/time" },
  {
    key: "qualifications",
    label: "Qualifications",
    path: "/staff/qualifications",
  },
] as const;

export type WorkforceSection = (typeof WORKFORCE_SECTIONS)[number]["key"];
