/**
 * Run-of-show templates for the event battle board.
 * Ported from capsule-pro task-templates plus Mangia board patterns.
 */
export type BattleBoardTaskTemplate = {
  group: string;
  label: string;
  category: string;
  defaultTeam: string;
  defaultLocation: string;
  notes: string;
};

export const BATTLE_BOARD_TASK_TEMPLATES: BattleBoardTaskTemplate[] = [
  // PREP / SETUP
  {
    group: "PREP / SETUP",
    label: "Staff Huddle / Sign-In",
    category: "staff_arrival",
    defaultTeam: "Everyone",
    defaultLocation: "Truck",
    notes: "Review roles, badges, sign book.",
  },
  {
    group: "PREP / SETUP",
    label: "Unload & Stage",
    category: "load_in",
    defaultTeam: "Everyone",
    defaultLocation: "Staging",
    notes: "Unload vehicles; stage equipment by area.",
  },
  {
    group: "PREP / SETUP",
    label: "Build Field Kitchen",
    category: "kitchen_setup",
    defaultTeam: "BOH",
    defaultLocation: "Field kitchen",
    notes: "Tables, burners, staging per layout.",
  },
  {
    group: "PREP / SETUP",
    label: "Set up Scullery",
    category: "setup",
    defaultTeam: "FOH",
    defaultLocation: "Scullery",
    notes: "Trash, sanitization, dish return; bussing flow ready.",
  },
  {
    group: "PREP / SETUP",
    label: "Set Buffet Tables & Decor",
    category: "setup",
    defaultTeam: "FOH",
    defaultLocation: "Buffet",
    notes: "Decor, chafers, water pans; bleach bucket under table.",
  },
  {
    group: "PREP / SETUP",
    label: "Set Apps Table / Grazing Station",
    category: "setup",
    defaultTeam: "FOH",
    defaultLocation: "Apps",
    notes: "Decor & serveware; keep tidy.",
  },
  {
    group: "PREP / SETUP",
    label: "Set Dessert Station",
    category: "setup",
    defaultTeam: "FOH",
    defaultLocation: "Dessert",
    notes: "Cake/dessert space; sternos if needed.",
  },
  {
    group: "PREP / SETUP",
    label: "Bar Arrival & Setup",
    category: "bar_setup",
    defaultTeam: "Bar",
    defaultLocation: "Bar",
    notes: "Ice, tools, glassware; Fill-n-Chill if used.",
  },
  {
    group: "PREP / SETUP",
    label: "Erect Buffet Table / Set Linen",
    category: "setup",
    defaultTeam: "FOH",
    defaultLocation: "Buffet",
    notes: "Build buffet line per layout; set linen.",
  },
  // SERVICE
  {
    group: "SERVICE",
    label: "Ceremony Quiet Time",
    category: "guest_arrival",
    defaultTeam: "All",
    defaultLocation: "Venue",
    notes: "Quiet during ceremony; no setup noise.",
  },
  {
    group: "SERVICE",
    label: "Apps Huddle",
    category: "service",
    defaultTeam: "FOH/BOH",
    defaultLocation: "Field kitchen",
    notes: "Review apps & dietary notes.",
  },
  {
    group: "SERVICE",
    label: "Light Sternos & Fill Chafers",
    category: "service",
    defaultTeam: "BOH",
    defaultLocation: "Buffet",
    notes: "Light sternos; water in chafers; sani bucket.",
  },
  {
    group: "SERVICE",
    label: "Team Huddle / Diet Callouts",
    category: "service",
    defaultTeam: "BOH+FOH",
    defaultLocation: "Buffet",
    notes: "BOH lead reviews menu and dietary restrictions with FOH.",
  },
  {
    group: "SERVICE",
    label: "Land Food in Chafers",
    category: "service",
    defaultTeam: "BOH",
    defaultLocation: "Buffet",
    notes: "Stock buffet; check water levels.",
  },
  {
    group: "SERVICE",
    label: "Buffet Open",
    category: "service",
    defaultTeam: "FOH",
    defaultLocation: "Buffet",
    notes: "Open service; honor third-party vendor boundaries.",
  },
  {
    group: "SERVICE",
    label: "Buffet Service (Serve/Carve)",
    category: "service",
    defaultTeam: "FOH/BOH",
    defaultLocation: "Buffet",
    notes: "FOH serve; BOH run food.",
  },
  {
    group: "SERVICE",
    label: "Passed Apps Service",
    category: "service",
    defaultTeam: "FOH",
    defaultLocation: "Everywhere",
    notes: "Pass and buss laps as specified.",
  },
  {
    group: "SERVICE",
    label: "Water Table Service",
    category: "service",
    defaultTeam: "FOH",
    defaultLocation: "Dining",
    notes: "Fill goblets between runs as specified.",
  },
  // FLIP / DESSERT
  {
    group: "FLIP / DESSERT",
    label: "Flip Buffet for Dessert",
    category: "service",
    defaultTeam: "FOH",
    defaultLocation: "Buffet",
    notes: "Close buffet; reset/stock dessert.",
  },
  {
    group: "FLIP / DESSERT",
    label: "Dessert Service",
    category: "service",
    defaultTeam: "FOH",
    defaultLocation: "Dessert",
    notes: "Serve dessert; monitor station.",
  },
  // BREAKDOWN / CLOSEOUT
  {
    group: "BREAKDOWN / CLOSEOUT",
    label: "Buffet Close",
    category: "breakdown",
    defaultTeam: "FOH",
    defaultLocation: "Buffet",
    notes: "Strike buffet and decor; return as it arrived.",
  },
  {
    group: "BREAKDOWN / CLOSEOUT",
    label: "Final Bussing (Own Disposables)",
    category: "breakdown",
    defaultTeam: "FOH",
    defaultLocation: "Everywhere",
    notes: "Clear own disposables only; do not handle third-party items.",
  },
  {
    group: "BREAKDOWN / CLOSEOUT",
    label: "Final Pass / Walkthrough",
    category: "breakdown",
    defaultTeam: "FOH",
    defaultLocation: "Everywhere",
    notes: "Final pass; trash; check & sign-off.",
  },
  {
    group: "BREAKDOWN / CLOSEOUT",
    label: "Strike & Load Out",
    category: "load_out",
    defaultTeam: "FOH",
    defaultLocation: "Truck",
    notes: "Strike tables; load vehicles; wipe down.",
  },
  {
    group: "BREAKDOWN / CLOSEOUT",
    label: "Clock Out",
    category: "load_out",
    defaultTeam: "FOH",
    defaultLocation: "Venue",
    notes: "Check in with BOH lead; clock out.",
  },
  // BAR
  {
    group: "BAR",
    label: "Bar Closing",
    category: "breakdown",
    defaultTeam: "Bar",
    defaultLocation: "Bar",
    notes: "Last call; break down; reload mixers; assist glassware bussing.",
  },
  // VENUE / ADMIN
  {
    group: "VENUE / ADMIN",
    label: "Check-in with Cooks/Kitchen",
    category: "kitchen_setup",
    defaultTeam: "FOH",
    defaultLocation: "Field kitchen",
    notes: "Sync timing; confirm menu/changes.",
  },
  {
    group: "VENUE / ADMIN",
    label: "Venue Access / Send-Off / Lock-Up",
    category: "load_out",
    defaultTeam: "FOH Lead",
    defaultLocation: "Venue",
    notes: "Coordinate access, send-off, lock up; client cleanup boundaries.",
  },
];

export const BATTLE_BOARD_TASK_TEMPLATE_GROUPS = [
  ...new Set(BATTLE_BOARD_TASK_TEMPLATES.map((template) => template.group)),
];
