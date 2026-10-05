// One-tap starters for "Define module" on the Training page.
export const starterModules = [
  {
    name: "Food safety basics",
    category: "food_safety",
    passingScore: 80,
    description: "Safe handling, cross-contamination, and temperature control.",
  },
  {
    name: "Equipment operation",
    category: "equipment_operation",
    passingScore: 85,
    description: "Safe setup, operation, shutdown, and incident response.",
  },
  {
    name: "Service standards",
    category: "service_standards",
    passingScore: 80,
    description: "Guest care, service sequence, and event-floor expectations.",
  },
  // Warehouse areas of the Mangia utility skills matrix (10-24-22).
  {
    name: "Event packing",
    category: "other",
    passingScore: 80,
    description:
      "Pack an event from the binder: bins on pallets, items packed safely, bins numbered and colour coded.",
  },
  {
    name: "Event returns",
    category: "other",
    passingScore: 80,
    description:
      "Check returned items in, spot misuse or damage, service them and put them back in their spot.",
  },
  {
    name: "Book building",
    category: "other",
    passingScore: 80,
    description:
      "Build the event binder: print the documents and put each in its tab, spot what is missing.",
  },
  {
    name: "Rebuild kits",
    category: "other",
    passingScore: 80,
    description: "Clean, service and restock every kit; label what is missing.",
  },
  {
    name: "Vehicle upkeep",
    category: "equipment_operation",
    passingScore: 80,
    description:
      "Upkeep and cleaning of vehicles and trailers; notice damage and needed repairs.",
  },
  {
    name: "Propane",
    category: "equipment_operation",
    passingScore: 80,
    description:
      "Check propane tanks in and out, fill them, handle and store them safely.",
  },
  {
    name: "Design studio",
    category: "other",
    passingScore: 80,
    description:
      "Check decor items in and out, pack them safely, service and clean them.",
  },
  {
    name: "5S",
    category: "other",
    passingScore: 80,
    description:
      "Follow and explain the 5S, kanban and other tidy-work systems.",
  },
] as const;
