export const WORKFORCE_SECTIONS = [
  { key: "roster", label: "Roster", path: "/staff/roster" },
  { key: "swaps", label: "Shift swaps", path: "/staff/swaps" },
  { key: "time", label: "Time & availability", path: "/staff/time" },
  { key: "time-off", label: "Time off", path: "/staff/time-off" },
  { key: "messages", label: "Messages", path: "/staff/messages" },
  { key: "utilization", label: "Utilization", path: "/staff/utilization" },
  {
    key: "qualifications",
    label: "Qualifications",
    path: "/staff/qualifications",
  },
  { key: "training", label: "Training", path: "/staff/training" },
  { key: "reviews", label: "Reviews", path: "/staff/reviews" },
] as const;

export type WorkforceSection = (typeof WORKFORCE_SECTIONS)[number]["key"];
