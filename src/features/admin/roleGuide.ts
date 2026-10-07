/**
 * What each Capsule role can do, in plain words. Mirrors the role list in
 * src/foundation/base.manifest; every role also has the staff basics (their
 * own shifts, time, messages and profile).
 */
export const ROLE_GUIDE: ReadonlyArray<readonly [string, string]> = [
  ["staff", "Their own shifts, hours, time off, training and messages."],
  [
    "kitchen staff",
    "Staff basics, plus recipes, prep lists and the kitchen screens.",
  ],
  [
    "kitchen lead",
    "Kitchen staff, plus running prep: batches, prep tasks and their notes.",
  ],
  [
    "kitchen manager",
    "Everything in the kitchen, plus changing ingredients, recipes, dishes and menus.",
  ],
  ["sales staff", "Staff basics, plus leads, clients, quotes and proposals."],
  [
    "sales manager",
    "Sales staff, plus revenue splits, referral sources and signature requests.",
  ],
  [
    "event staff",
    "Staff basics, plus working on events: menu, guests, timeline.",
  ],
  [
    "event manager",
    "Event staff, plus approving and running events, venues, equipment, rentals and close-out.",
  ],
  ["inventory staff", "Staff basics, plus stock counts, receiving and waste."],
  [
    "procurement staff",
    "Inventory staff, plus vendor orders and vendor contracts.",
  ],
  [
    "inventory manager",
    "Everything in stock and buying, plus storage places, vendors and vendor orders.",
  ],
  [
    "logistics staff",
    "Staff basics, plus pack lists, deliveries, trucks and returns.",
  ],
  ["driver", "Same as logistics staff: their delivery runs and the trucks."],
  [
    "logistics manager",
    "Logistics staff, plus managing deliveries, pack lists and equipment.",
  ],
  [
    "workforce staff",
    "Staff basics, plus the schedule, time sheets and staff records.",
  ],
  [
    "workforce manager",
    "Workforce staff, plus shifts, hiring, reviews, training and payroll hours.",
  ],
  ["finance staff", "Staff basics, plus invoices, payments and money reports."],
  [
    "finance manager",
    "Finance staff, plus event close-out and payroll inputs.",
  ],
  [
    "manager",
    "Staff basics, plus announcements, reports and data imports. Pick an area manager role for more.",
  ],
  ["admin", "Everything, plus team roles, settings and integrations."],
  ["owner", "Same as admin."],
];
