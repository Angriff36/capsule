/**
 * Plain-language page guides — every route gets a "What's this page?" answer.
 * Longest-prefix match, so detail pages inherit their section's guide unless
 * a more specific entry exists. Copy rule: caterer language only — no system
 * words (records, entities, commands, sync, manifest).
 */

export type PageGuide = {
  /** Route prefix this guide covers ("/" matches only the home page). */
  prefix: string;
  title: string;
  purpose: string;
  steps: string[];
};

export const PAGE_GUIDES: PageGuide[] = [
  {
    prefix: "/",
    title: "Home",
    purpose:
      "Your morning glance — upcoming events, money owed, low stock, and staffing gaps, all in one place.",
    steps: [
      "Scan the boards for anything red or flagged.",
      "Click any board to jump to the full page behind it.",
      "Use Customize widgets to pin only what you care about.",
    ],
  },
  {
    prefix: "/events",
    title: "Events",
    purpose:
      "Every booking from first quote to final payment lives here — this is the heart of the app.",
    steps: [
      "Use the stage tabs to see what's coming up or needs approval.",
      "Click an event to manage its menu, staff, timeline, and money.",
      "Use New event to book something new.",
    ],
  },
  {
    prefix: "/events/new",
    title: "New event",
    purpose: "Book a new event — only the Basics section is needed to start.",
    steps: [
      "Fill in the title, client, date, and headcount.",
      "Pick the client and venue in the side panel — create them right there if they're new.",
      "Open the other sections later; you can always come back.",
    ],
  },
  {
    prefix: "/events/templates",
    title: "Event templates",
    purpose:
      "Starting points for events you book again and again, so you never build the same thing twice.",
    steps: [
      "Create a template from your most common event shape.",
      "When booking, start from the template and adjust the details.",
    ],
  },
  {
    prefix: "/events/capacity",
    title: "Capacity planner",
    purpose:
      "See how full each day is so you know when you can safely take another booking.",
    steps: [
      "Look for crowded days before confirming a new event.",
      "Click a day to see what's already booked.",
    ],
  },
  {
    prefix: "/my",
    title: "My Day",
    purpose:
      "Your personal work page — clock in, see your shifts, and work through today's prep list.",
    steps: [
      "Clock in when you start.",
      "Claim a prep task, do it, mark it done.",
      "Check your upcoming shifts and request swaps or time off.",
    ],
  },
  {
    prefix: "/kitchen",
    title: "Kitchen",
    purpose:
      "Today's kitchen at a glance — what needs prepping, what's blocked, and what's ready.",
    steps: [
      "Check the prep board for today's tasks.",
      "Use the tabs to manage dishes, menus, and ingredients.",
    ],
  },
  {
    prefix: "/kitchen/components",
    title: "Recipes & components",
    purpose:
      "Your recipe book — the sauces, sides, and building blocks that dishes are made from.",
    steps: [
      "Create a component with its ingredients and yield.",
      "Publish it so dishes and prep lists can use it.",
    ],
  },
  {
    prefix: "/kitchen/dishes",
    title: "Dishes",
    purpose: "Everything you serve, with its ingredients, cost, and allergens.",
    steps: [
      "Open a dish to set its ingredients and portion size.",
      "Costs update automatically as ingredient prices change.",
    ],
  },
  {
    prefix: "/kitchen/menus",
    title: "Menus",
    purpose:
      "Group dishes into menus you can price, compare margins on, and attach to events.",
    steps: [
      "Build a menu from your dishes.",
      "Check the margin board to see which menus actually make money.",
    ],
  },
  {
    prefix: "/kitchen/ingredients",
    title: "Ingredients",
    purpose:
      "Every raw ingredient you buy, with cost per unit and allergen flags.",
    steps: [
      "Keep costs current — dish and menu pricing depends on them.",
      "Flag allergens here once and they follow the ingredient everywhere.",
    ],
  },
  {
    prefix: "/kitchen/prep",
    title: "Kitchen dashboard",
    purpose:
      "The command view for a service day — prep progress, blockers, and quality checks.",
    steps: [
      "Watch for blocked tasks and clear what's blocking them.",
      "Use it on a wall screen during busy days.",
    ],
  },
  {
    prefix: "/kitchen/display",
    title: "Kitchen display",
    purpose:
      "A big-screen ticket view for the line — what to fire and what's up next.",
    steps: ["Put this on the kitchen screen during service."],
  },
  {
    prefix: "/kitchen/allergen-matrix",
    title: "Allergen matrix",
    purpose:
      "One table showing every dish against every allergen — print it for staff or clients.",
    steps: [
      "Check it before events with allergy notes.",
      "Print or export for the service team.",
    ],
  },
  {
    prefix: "/kitchen/event-menu",
    title: "Event menu",
    purpose: "The dishes attached to a specific event, with quantities.",
    steps: ["Pick the event, then adjust dishes and portions for it."],
  },
  {
    prefix: "/inventory",
    title: "Inventory",
    purpose:
      "What's on the shelf, what's running low, and what's on order from vendors.",
    steps: [
      "Watch the Below PAR list — that's what to reorder.",
      "Use Purchasing to turn needs into vendor orders.",
    ],
  },
  {
    prefix: "/inventory/demand",
    title: "Demand",
    purpose:
      "What upcoming events will consume, so you can buy ahead instead of scrambling.",
    steps: [
      "Review upcoming needs by ingredient.",
      "Send shortfalls to Purchasing.",
    ],
  },
  {
    prefix: "/inventory/stock",
    title: "Stock book",
    purpose:
      "Current quantities of everything, by storage location, with reorder alerts.",
    steps: [
      "Adjust quantities when things come in or get used outside an event.",
      "Set PAR levels so low stock flags itself.",
    ],
  },
  {
    prefix: "/inventory/counts",
    title: "Counts",
    purpose:
      "Physical stock counts — walk the shelves, enter what's really there, and reconcile.",
    steps: [
      "Start a count session.",
      "Enter real quantities; differences get logged automatically.",
    ],
  },
  {
    prefix: "/inventory/audit",
    title: "Stock history",
    purpose:
      "Every stock movement and who made it — for when a number looks wrong.",
    steps: ["Search by ingredient to trace where stock went."],
  },
  {
    prefix: "/inventory/waste",
    title: "Waste",
    purpose:
      "Log spoilage and loss with reasons, and see what waste is costing you.",
    steps: [
      "Log waste as it happens with a reason.",
      "Review the cost report monthly to spot patterns.",
    ],
  },
  {
    prefix: "/inventory/traceability",
    title: "Lot trace",
    purpose:
      "Trace a supplier batch from delivery to the events it was used in — for recalls and complaints.",
    steps: ["Search the lot number to see everywhere it went."],
  },
  {
    prefix: "/inventory/purchasing",
    title: "Purchasing",
    purpose:
      "Weekly buying — draft orders build themselves from upcoming needs; you review and send.",
    steps: [
      "Review this week's draft order.",
      "Adjust quantities, pick vendors, and send.",
      "Mark orders received when deliveries arrive.",
    ],
  },
  {
    prefix: "/inventory/contracts",
    title: "Vendor contracts",
    purpose: "Negotiated pricing and terms with each supplier.",
    steps: ["Keep agreed prices here so orders use the right numbers."],
  },
  {
    prefix: "/logistics",
    title: "Logistics",
    purpose:
      "Getting food and equipment to events — pack lists, deliveries, drivers, and vehicles.",
    steps: [
      "Check the attention list for deliveries missing a driver.",
      "Follow each event from packing to loading to delivery.",
    ],
  },
  {
    prefix: "/logistics/packs",
    title: "Pack lists",
    purpose:
      "What to load for each event, checked off item by item as it's packed.",
    steps: [
      "Open the event's pack list.",
      "Check items off as they're packed, then mark the list packed.",
    ],
  },
  {
    prefix: "/logistics/pack-templates",
    title: "Pack templates",
    purpose:
      "Reusable load lists for event types you run often, so packing is never from memory.",
    steps: ["Build a template once; new pack lists start from it."],
  },
  {
    prefix: "/logistics/deliveries",
    title: "Deliveries",
    purpose:
      "Every delivery run — who's driving, what vehicle, and where it is right now.",
    steps: [
      "Assign a driver and vehicle to each run.",
      "Start transit when the van leaves; mark delivered on arrival.",
    ],
  },
  {
    prefix: "/logistics/schedule",
    title: "Vehicle schedule",
    purpose:
      "Which vehicle is committed where, and when — spot conflicts early.",
    steps: ["Check before promising a delivery window."],
  },
  {
    prefix: "/logistics/route",
    title: "Route planner",
    purpose: "Put the day's stops in a sensible driving order.",
    steps: ["Drag stops into order; hand the route to the driver."],
  },
  {
    prefix: "/logistics/fleet",
    title: "Fleet",
    purpose: "Your vehicles — capacity, status, and availability.",
    steps: ["Mark a vehicle out of service when it's in the shop."],
  },
  {
    prefix: "/logistics/maintenance",
    title: "Vehicle maintenance",
    purpose: "Service history and upcoming maintenance for each vehicle.",
    steps: ["Log service work so nothing gets missed."],
  },
  {
    prefix: "/staff",
    title: "Staff",
    purpose:
      "Your team — who's working when, who's asking for time off, and who needs confirming.",
    steps: [
      "Clear the attention list: confirm assignments, decide requests.",
      "Use Roster to schedule people onto events and shifts.",
    ],
  },
  {
    prefix: "/staff/roster",
    title: "Roster",
    purpose:
      "Assign people to events and build the weekly shift schedule, then publish it.",
    steps: [
      "Add assignments for upcoming events.",
      "Build the week's shifts, then publish so staff see them.",
    ],
  },
  {
    prefix: "/staff/swaps",
    title: "Shift swaps",
    purpose:
      "Staff arrange swaps between themselves; you give the final OK here.",
    steps: ["Approve or decline swaps both staff members already agreed to."],
  },
  {
    prefix: "/staff/time",
    title: "Time & availability",
    purpose: "Hours worked and when people say they're available.",
    steps: [
      "Fix clock mistakes here.",
      "Check availability before building the schedule.",
    ],
  },
  {
    prefix: "/staff/time-off",
    title: "Time off",
    purpose: "Requests for days off, waiting on your yes or no.",
    steps: ["Decide requests promptly — the schedule depends on it."],
  },
  {
    prefix: "/staff/messages",
    title: "Messages",
    purpose: "Announcements and direct messages to your team.",
    steps: ["Send schedule notes here instead of group texts."],
  },
  {
    prefix: "/staff/utilization",
    title: "Utilization",
    purpose: "Who's over-scheduled and who's under-used, week by week.",
    steps: ["Balance the load before burnout or dead payroll hours."],
  },
  {
    prefix: "/staff/qualifications",
    title: "Qualifications",
    purpose: "Certifications like food handler cards, with expiry dates.",
    steps: ["Add each person's certs; expiring ones flag themselves."],
  },
  {
    prefix: "/staff/training",
    title: "Training",
    purpose: "Completed trainings that unlock certain shift types.",
    steps: ["Record completions so people can be scheduled for those roles."],
  },
  {
    prefix: "/staff/reviews",
    title: "Performance reviews",
    purpose: "Run and track reviews across the team.",
    steps: ["Start a review, fill it in together, and file it."],
  },
  {
    prefix: "/staff/my-reviews",
    title: "My reviews",
    purpose: "Reviews written about you, in one place.",
    steps: ["Read and acknowledge your reviews."],
  },
  {
    prefix: "/staff/scorecards",
    title: "Role scorecards",
    purpose: 'What "good" looks like for each role, written down.',
    steps: ["Define the measurables per role; reviews use them."],
  },
  {
    prefix: "/staff/one-on-ones",
    title: "One-on-ones",
    purpose:
      "Recurring check-ins with each person, with notes and action items.",
    steps: ["Schedule the cadence; log notes each time."],
  },
  {
    prefix: "/staff/hiring",
    title: "Hiring",
    purpose: "Candidates moving through your hiring steps.",
    steps: ["Move candidates along; record interview outcomes."],
  },
  {
    prefix: "/clients",
    title: "Clients & CRM",
    purpose:
      "Everyone you cater for — their contacts, history, proposals, and contracts.",
    steps: [
      "Use Pipeline for people who haven't booked yet.",
      "Open a client to see their whole history with you.",
      "Send proposals from here; accepted ones become events.",
    ],
  },
  {
    prefix: "/clients/pipeline",
    title: "Lead pipeline",
    purpose:
      "New inquiries, moving from first contact to booked — don't let them go cold.",
    steps: [
      "Add every inquiry the moment it arrives.",
      "Move cards along as conversations progress.",
      "Convert to a client when they're ready to book.",
    ],
  },
  {
    prefix: "/clients/proposals",
    title: "Proposals",
    purpose:
      "Priced offers you send to clients — they accept or decline with one click.",
    steps: [
      "Draft a proposal with menu and pricing.",
      "Send it; the client gets a link to accept.",
      "When accepted, create the event from it.",
    ],
  },
  {
    prefix: "/clients/proposals/templates",
    title: "Proposal templates",
    purpose: "Reusable proposal shapes so quoting takes minutes, not hours.",
    steps: ["Save your standard offers; start new proposals from them."],
  },
  {
    prefix: "/clients/contracts",
    title: "Contracts",
    purpose: "Signed agreements for booked events.",
    steps: ["Draft from the event, send for signature, file the signed copy."],
  },
  {
    prefix: "/clients/retention",
    title: "Retention",
    purpose:
      "Clients who used to book and stopped — your easiest win-back revenue.",
    steps: ["Reach out to lapsed clients before the season starts."],
  },
  {
    prefix: "/clients/quote-requests",
    title: "Quote requests",
    purpose:
      "Quotes people submitted through your website, waiting for a response.",
    steps: ["Review each request and turn the good ones into proposals."],
  },
  {
    prefix: "/clients/inbox",
    title: "Inbox",
    purpose: "Messages from social and web channels, turned into leads.",
    steps: ["Reply, and convert real inquiries into pipeline leads."],
  },
  {
    prefix: "/finance",
    title: "Finance",
    purpose: "Money owed, money collected, and where to act next.",
    steps: [
      "Clear the attention list — that's what's owed to you.",
      "Use the tabs for invoices, payments, payroll, and reports.",
    ],
  },
  {
    prefix: "/finance/invoices",
    title: "Invoices",
    purpose: "Bill clients and track what's been paid.",
    steps: [
      "Issue the invoice from the event.",
      "Send it; record payments as they arrive.",
    ],
  },
  {
    prefix: "/finance/payments",
    title: "Payments",
    purpose: "Money received, matched against invoices.",
    steps: ["Record each payment and match it to its invoice."],
  },
  {
    prefix: "/finance/payment-methods",
    title: "Payment methods",
    purpose: "Client payment details kept on file.",
    steps: ["Store how each client pays to speed up settlement."],
  },
  {
    prefix: "/finance/closeout",
    title: "Closeout",
    purpose:
      "The financial wrap-up after each event — what it earned, what it cost.",
    steps: ["Close out each event within a few days while it's fresh."],
  },
  {
    prefix: "/finance/payroll",
    title: "Payroll",
    purpose: "Pay runs built from recorded hours.",
    steps: ["Prepare the run, check the hours, and export."],
  },
  {
    prefix: "/finance/tips",
    title: "Tips",
    purpose: "Collect event tips and split them fairly across the crew.",
    steps: ["Enter the tip pool; the split follows who worked."],
  },
  {
    prefix: "/finance/taxes",
    title: "Tax",
    purpose: "Tax rates by area and what you've collected.",
    steps: ["Keep rates current; invoices apply them automatically."],
  },
  {
    prefix: "/finance/commission-terms",
    title: "Commission terms",
    purpose: "What each venue takes, written down.",
    steps: ["Record each venue's cut so event profit is honest."],
  },
  {
    prefix: "/finance/attribution",
    title: "Attribution",
    purpose: "Which venue, salesperson, or referral earned each dollar.",
    steps: ["Review how revenue traces back to its source."],
  },
  {
    prefix: "/finance/revenue",
    title: "Revenue",
    purpose: "Revenue over time, sliced by event type, client, or venue.",
    steps: ["Compare periods; spot what's growing and what's fading."],
  },
  {
    prefix: "/finance/food-cost",
    title: "Food cost",
    purpose: "Ingredient spend measured against what you charge.",
    steps: ["Watch the percentage; investigate months that spike."],
  },
  {
    prefix: "/finance/profit-margins",
    title: "Profit margins",
    purpose: "What each event and service line actually makes.",
    steps: ["Find the low-margin work and reprice or drop it."],
  },
  {
    prefix: "/reports",
    title: "Reports",
    purpose: "The business dashboards — KPIs, scorecards, and trends.",
    steps: ["Pick a dashboard; each answers one owner-level question."],
  },
  {
    prefix: "/facilities",
    title: "Facilities",
    purpose: "Your venues, equipment, and the upkeep that keeps them ready.",
    steps: [
      "Keep venue details current — events pull from them.",
      "Watch maintenance-due so nothing fails on event day.",
    ],
  },
  {
    prefix: "/facilities/venues",
    title: "Venues",
    purpose:
      "Every place you serve — capacity, load-in notes, contacts, and rules.",
    steps: ["Fill in logistics notes once; every event there benefits."],
  },
  {
    prefix: "/facilities/equipment",
    title: "Equipment",
    purpose: "Chafers, tents, linens — what you own, its condition, and value.",
    steps: ["Log condition changes; flag anything needing repair."],
  },
  {
    prefix: "/facilities/vendor-relationships",
    title: "Venue vendors",
    purpose: "Which vendors each venue prefers, allows, or bans.",
    steps: ["Check before booking outside vendors at a venue."],
  },
  {
    prefix: "/admin",
    title: "Administration",
    purpose:
      "Setup and housekeeping — team roles, branding, integrations, and data imports.",
    steps: [
      "Most days you won't need this page.",
      "Come here to add team members or connect outside tools.",
    ],
  },
  {
    prefix: "/settings/email",
    title: "Email settings",
    purpose: "Which email notifications you get, and when.",
    steps: ["Turn off what you don't want; nothing else changes."],
  },
];

/** Longest-prefix match; "/" only matches home exactly. */
export function guideForPath(pathname: string): PageGuide | undefined {
  if (pathname === "/") return PAGE_GUIDES.find((g) => g.prefix === "/");
  let best: PageGuide | undefined;
  for (const guide of PAGE_GUIDES) {
    if (guide.prefix === "/") continue;
    if (pathname === guide.prefix || pathname.startsWith(`${guide.prefix}/`)) {
      if (!best || guide.prefix.length > best.prefix.length) best = guide;
    }
  }
  return best;
}
