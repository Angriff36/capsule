export const WORKFORCE_SECTIONS = [
  { key: "roster", label: "Roster", path: "/staff/roster" },
  { key: "time", label: "Time", path: "/staff/time" },
  { key: "messages", label: "Team chat", path: "/staff/messages" },
  { key: "training", label: "Skills & training", path: "/staff/training" },
  { key: "reviews", label: "Performance", path: "/staff/reviews" },
  { key: "hiring", label: "Hiring", path: "/staff/hiring" },
] as const;

export type WorkforceSection = (typeof WORKFORCE_SECTIONS)[number]["key"];
