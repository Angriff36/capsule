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

// Home carries no guide. Today's service says what it is by composition — the
// date, the title, the decisions, the schedule — so a standing paragraph only
// pushes the work down the page. (Its copy also still advertised "Customize
// widgets", a feature the screen no longer has.)
export const PAGE_GUIDES: PageGuide[] = [
  {
    prefix: "/events",
    title: "Events",
    purpose:
      "Every booking from first quote to final payment lives here — this is the heart of the app.",
    steps: [
      "Use the stage tabs to see what's coming up or needs approval.",
      "Click an event to manage its menu, staff, timeline, and money.",
      "Use New event to book something new, or Import from BEO / worksheet to paste the binder instead of typing it.",
    ],
  },
  {
    prefix: "/events/",
    title: "Event",
    purpose: "This booking — menu, staff, timeline, and money in one place.",
    steps: [
      "Review the menu, staff, and timeline.",
      "Update details as the booking firms up.",
      "Use the stage actions to move it forward.",
    ],
  },
  {
    prefix: "/events/import",
    title: "Import an event from its BEO",
    purpose:
      "Paste the BEO or worksheet text (or drop TPP CSVs) and Capsule drafts the event for you to review.",
    steps: [
      "Paste the printed binder text or drop the TPP files.",
      "Check the preview and pick existing client, venue, and dishes when they already exist.",
      "Create the event, then walk the tabs — notes, staffing, and pack list should already be there.",
    ],
  },
  {
    prefix: "/events/new",
    title: "New event",
    purpose: "Book a new event — only the Basics section is needed to start.",
    steps: [
      "Fill in the title, client, date, and headcount.",
      "Pick the client and venue — create them right there if they're new.",
      "Open the other sections later; you can always come back.",
    ],
  },
  {
    prefix: "/events/setup",
    title: "Event setup",
    purpose:
      "Starting points for events you book again and again, so you never build the same thing twice.",
    steps: [
      "Create a template from your most common event shape.",
      "When booking, start from the template and adjust the details.",
    ],
  },
  {
    prefix: "/events/tracker",
    title: "Event tracker",
    purpose:
      "One month as a sheet, one row for each event: event number, vehicles, trailers, driver, load, binder, and pack status.",
    steps: [
      "Pick a vehicle or trailer in the row to attach it to the event. Add as many as the event needs.",
      "Set the driver, tick Loaded when the load is in the vehicle, and set the binder status.",
      "Use the Two-week board view to drag an event to another day.",
    ],
  },
  {
    prefix: "/events/production",
    title: "Production board",
    purpose:
      "The production meeting, one event at a time: guests, crew, run of show, venue, food, tasks, vehicles and equipment.",
    steps: [
      "Pick the next event in the row at the top.",
      "Walk the board top to bottom; anything short is marked.",
      "Use Edit on a panel to change it on the event itself.",
    ],
  },
  {
    prefix: "/events/capacity",
    title: "Room sizes",
    purpose:
      "Guests who said yes, set against how many the venue holds, and rooms booked for two events at once.",
    steps: [
      "Look for full rooms and double bookings before you confirm a new event.",
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
    title: "Recipes",
    purpose:
      "Your recipe book — the sauces, sides, and building blocks that dishes are made from.",
    steps: [
      "Create a recipe with its ingredients and yield.",
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
      "The main view for a service day — prep progress, blockers, and quality checks.",
    steps: [
      "Watch for blocked tasks and clear what's blocking them.",
      "Use it on a wall screen during busy days.",
    ],
  },
  {
    prefix: "/kitchen/plan",
    title: "Production plan",
    purpose:
      "What the kitchen makes each day across all events, by station, recipe and batch.",
    steps: [
      "Read one day at a time; work for the same step is pooled and each event keeps its own amount.",
      "Check Make ahead and Waits for before you start a row.",
      "Set a step's make-ahead days on the dish's prep steps.",
      "Yield against plan shows planned vs. actual yield for completed production batches, grouped by recipe.",
      "Look for recipes that consistently under- or over-yield and fix the recipe or the prep.",
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
    prefix: "/inventory/stock",
    title: "Stock",
    purpose:
      "Current quantities of everything, by storage location, with reorder alerts.",
    steps: [
      "Adjust quantities when things come in or get used outside an event.",
      "Set PAR levels so low stock flags itself.",
      "Watch the Below reorder alerts — that's what to reorder.",
      "Use Purchasing to turn needs into vendor orders.",
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
    prefix: "/inventory/orders",
    title: "Purchasing",
    purpose:
      "A vendor order — review lines, send it, and mark it received when the delivery arrives.",
    steps: [
      "Check quantities and prices.",
      "Send the order to the vendor.",
      "Mark it received when the delivery arrives.",
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
    title: "Pack setup",
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
    prefix: "/logistics/fleet",
    title: "Fleet",
    purpose: "Your vehicles — capacity, status, and availability.",
    steps: ["Mark a vehicle out of service when it's in the shop."],
  },
  {
    prefix: "/staff/roster",
    title: "Roster",
    purpose: "Assign people to events and build the weekly shift schedule.",
    steps: [
      "Add assignments for upcoming events.",
      "Build the week's shifts, then publish so staff see them.",
    ],
  },
  {
    prefix: "/staff/time",
    title: "Time",
    purpose: "Hours worked and when people say they're available.",
    steps: [
      "Fix clock mistakes here.",
      "Check availability before building the schedule.",
    ],
  },
  {
    prefix: "/staff/messages",
    title: "Team chat",
    purpose:
      "Event channels and direct messages for your team. Share photos, files, and links to events and dishes.",
    steps: [
      "Each event has its own channel — open it here or from the event's Chat tab.",
      "Type @ to mention a teammate and # to link an event, dish, menu, or client.",
    ],
  },
  {
    prefix: "/staff/training",
    title: "Skills & training",
    purpose:
      "Completed trainings that unlock certain shift types, and each person's skill level per area.",
    steps: [
      "Note who's finished training so they can be scheduled for those roles.",
      "In the skills matrix, rate each person 0 to 4 per area; level 4 people are the trainers.",
      "Start training to keep the trainer, the dates and each step the trainer initials; finish it when the quiz is done.",
    ],
  },
  {
    prefix: "/staff/reviews",
    title: "Performance",
    purpose: "Run and track reviews across the team.",
    steps: ["Start a review, fill it in together, and file it."],
  },
  {
    prefix: "/staff/hiring",
    title: "Hiring",
    purpose: "Candidates moving through your hiring steps.",
    steps: ["Move candidates along; note each interview's outcome."],
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
    prefix: "/clients/contracts",
    title: "Contracts",
    purpose: "Signed agreements for booked events.",
    steps: ["Draft from the event, send for signature, file the signed copy."],
  },
  {
    prefix: "/clients/inbox",
    title: "Inbox",
    purpose: "Messages from social and web channels, turned into leads.",
    steps: ["Reply, and convert real inquiries into pipeline leads."],
  },
  {
    prefix: "/finance/invoices",
    title: "Invoices",
    purpose: "Bill clients and track what's been paid.",
    steps: [
      "Issue the invoice from the event.",
      "Send it, then log payments as they arrive.",
      "Clear the attention list at the top — that's what's owed to you.",
    ],
  },
  {
    prefix: "/finance/payments",
    title: "Payments",
    purpose: "Money received, matched against invoices.",
    steps: ["Log each payment and match it to its invoice."],
  },
  {
    prefix: "/finance/closeout",
    title: "Closeout",
    purpose:
      "The financial wrap-up after each event — what it earned, what it cost.",
    steps: [
      "Close out each event within a few days while it's fresh.",
      "Open Leftovers on the closeout to record food donated, returned to stock, or thrown out.",
    ],
  },
  {
    prefix: "/finance/donations",
    title: "Food donations",
    purpose:
      "A year of donated leftovers by recipient, for the tax file and Good Samaritan records.",
    steps: [
      "Pick the year and print the summary.",
      "Chase any donation that still has no receipt number.",
    ],
  },
  {
    prefix: "/finance/payroll",
    title: "Payroll",
    purpose: "Pay runs built from the hours on file.",
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
    prefix: "/finance/attribution",
    title: "Attribution",
    purpose: "Which venue, salesperson, or referral earned each dollar.",
    steps: ["Review how revenue traces back to its source."],
  },
  {
    prefix: "/finance/revenue",
    title: "Money reports",
    purpose: "Revenue over time, sliced by event type, client, or venue.",
    steps: ["Compare periods; spot what's growing and what's fading."],
  },
  {
    prefix: "/eos/vision",
    title: "Vision/Traction Organizer",
    purpose: "Where the company is going and how it gets there, on two pages.",
    steps: [
      "Click any part to write it; share the printed V/TO with everyone.",
    ],
  },
  {
    prefix: "/eos/people",
    title: "Who does each job",
    purpose:
      "The job chart first; scoring and handing work off after names are in.",
    steps: [
      "Put one person in each box.",
      "Scoring and handing work off appear after every box has a person.",
    ],
  },
  {
    prefix: "/eos/process",
    title: "Core processes",
    purpose:
      "The handful of ways Mangia works, written down and followed by all.",
    steps: [
      "Name each process, write its major steps, move it along the four stages.",
    ],
  },
  {
    prefix: "/eos/l10",
    title: "L10 meeting",
    purpose:
      "The weekly leadership meeting: scorecard, Rocks, headlines, to-dos and issues.",
    steps: ["Press Start meeting; Next moves through the agenda with a timer."],
  },
  {
    prefix: "/eos",
    title: "EOS",
    purpose:
      "Write where you are going, put names on the jobs, then run a weekly meeting.",
    steps: [
      "Type why Mangia exists in the box on Start here, then do the rest in order.",
    ],
  },
  {
    prefix: "/reports",
    title: "Reports",
    purpose: "The business dashboards — KPIs, scorecards, and trends.",
    steps: ["Pick a dashboard; each answers one owner-level question."],
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
    prefix: "/admin/reconcile",
    title: "Match leftover items",
    purpose:
      "Imported items that still need a check, a match or a skip before they leave this list.",
    steps: [
      "Match links an imported payment to a Capsule payment. The same id is safe; only the same amount is a guess, so check it first.",
      "Verify confirms a match is correct; the item is done and leaves this list.",
      "A client or venue with the same name or email waits here. Verify it if it is a different one; if it is the same, merge the two on the Clients page.",
      "Pick existing points the old row at a record you have; Add as new makes a new one. Later imports of the same row use your choice.",
      "Skip marks it done with a note; later imports leave it out.",
      "Items marked Conflict need to be sorted out before they leave this list.",
      "Select multiple items to Verify or Skip them together; you see every item it changes before it runs.",
    ],
  },
  {
    prefix: "/settings/email",
    title: "Email settings",
    purpose: "Which email notifications you get, and when.",
    steps: ["Turn off what you don't want; nothing else changes."],
  },
];

/** True when pathname is this guide's page or a nested path under it. */
function matchesGuidePrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  if (pathname === prefix) return true;
  if (pathname.startsWith(`${prefix}/`)) return true;
  // Trailing-slash prefixes (e.g. "/events/") cover record paths only.
  return prefix.endsWith("/") && pathname.startsWith(prefix);
}

/** Longest-prefix match; "/" only matches home exactly. */
export function guideForPath(pathname: string): PageGuide | undefined {
  if (pathname === "/") return PAGE_GUIDES.find((g) => g.prefix === "/");
  let best: PageGuide | undefined;
  for (const guide of PAGE_GUIDES) {
    if (guide.prefix === "/") continue;
    if (matchesGuidePrefix(pathname, guide.prefix)) {
      if (!best || guide.prefix.length > best.prefix.length) best = guide;
    }
  }
  return best;
}
