// One-tap starters for "Define module" on the Training page. Steps and quiz
// of the warehouse areas come from the Mangia Training Docs (2-1-23).

const eventPackingSteps = `Show overall event packing flow
- Location of bins, location of items in warehouse, event spaces, etc
Explain usage of warehouse event spaces
- How items are put in them, how to use multiple
Explain paperwork in binders
- Packing checklists, bin numbers, pack lists. Show how to fill out pack lists
- Show the yellow sheets and go over their use
Demonstrate usage of bins
- Different sizes and uses. Labeling bins with stickers. Numbers on bins
- How to safely pack items in bins with bubble wrap and cushioning
Go through an event packing with trainee
- Pack list in the binder, gathering items, packing into bins, bins onto pallets, filling event spaces
Show how to handle equipment, tables, etc for events
- What is done on the day of. How to tell what is needed for staff
Have trainee pack 3 additional events
- A range of events: full cook onsite, pizza, bring hot`;

const eventPackingQuiz = `Q: Demonstrate the flow of packing for an event.
A: Grab the binder and look over the event, gather bins on pallets in the packing area, pack items from the pack list safely into bins, cover all bins and put them in the event space.
Q: Explain the bin numbers and how to tell bins apart for events.
A: The numbers show which bins are for which areas on the binder's bin sheet, so the crew onsite gets items to the right spot. No labels on bins unless it is a special or multi-station event.
Q: What should you do if you cannot find an item on the pack list?
A: Skip it and come back to it. If it goes in a bin with other items, leave that bin on top with the lid off. If the item is at another event, label it to be packed when that event returns.
Q: Trainee packs 2 events correctly, without your input.`;

const bookBuildingSteps = `Use a built binder to show the trainee what it is and how it works
- Show the parts of the book
- All documents in the book and what they are used for
Show where to get book documents from
- On the computer, where to find documents for one event
- On the computer, where to find general and blank documents
Show what items are needed for every event and event type
- Drop off clipboards and books
- Cook onsite books
- Bring hot books
Build a couple of books with the trainee watching
- Build a drop off binder
- Build a cook onsite book
- Build a bring hot book`;

const bookBuildingQuiz = `Q: Where would you find the buffet layout in the book?
A: Points to the serving section of the book.
Q: Where do Design Studio documents go in the book?
A: The decor section for standard decor rentals, and the section for extra rental items.
Q: What items need to be checked, but not restocked, on most events?
A: The last section with the forms and phone number documents.
Q: Trainee builds 2 event books correctly, without your input.`;

const kitSteps = `Go over all kits
- What is a kit
- Why we use kits
- Different types of kits
Show all storage spots for kits
- How we know where they go
- What goes where for kits
- All kits have an exact spot
Kit process for going out to events
- How we grab and send kits for events
- Green magnets to red
Kit process when returning
- Kits on the shelves
- Lids loose on the kits
- Red magnets
How to clean and service kits
- What items are cleaned and serviced in the different kits
- Where to restock items and refill them from
How to treat unfinished kits
- Label the items that are missing
- Turn to yellow
Have them watch as you restock 1-2 kits of 2-3 kinds`;

const kitQuiz = `Q: Show me 5 different kits that are in use.
A: Shows 5 kits and explains what they are used for.
Q: What do the red magnets mean?
A: The kit came back from an event and needs a full service.
Q: What do the green magnets mean?
A: The kit is fully serviced and ready for an event.
Q: What do the yellow magnets mean?
A: An item is missing from the kit, and they can tell you what is missing.
Q: Show how to refill and restock a catering kit, chafer kit and emergency kit correctly, without input.`;

const designStudioSteps = `Explain what the design studio is
- What we use it for and what is in there
Tour of the design studio
- What the numbers mean on the shelves
- The general layout of things on the shelves
Computer in the design studio
- Goodshuffle overview
- How to look up events
- Basics of checking items out on the computer
Packing
- How items are packed safely
- Different packing materials
- Packing methods and smaller packing bins
Event spaces
- What they are used for
- How to use them and the signs
Pack 2 events with the trainee
- Go through the whole packing process with the trainee
Explain the return process
- Returning items for one event and for many events
- Check items for damage
- Log items back in on the computer and complete the order
Service and clean items
- What cleaners to use on items
- What needs cleaning on items, in general`;

const designStudioQuiz = `Q: What do the numbers mean on the shelves?
A: Each number is a storage spot. Every item has its own spot.
Q: Show how to clean 3 items of your choosing.
A: Shows which cleaners to use and how each item is cleaned.
Q: Can you quickly grab an item for an event and skip the checkout?
A: No.
Q: Trainee packs 2 events correctly, without your input.`;

export interface StarterModule {
  name: string;
  category:
    "food_safety" | "equipment_operation" | "service_standards" | "other";
  passingScore: number;
  description: string;
  steps?: string;
  quiz?: string;
}

export const starterModules: readonly StarterModule[] = [
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
    steps: eventPackingSteps,
    quiz: eventPackingQuiz,
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
    steps: bookBuildingSteps,
    quiz: bookBuildingQuiz,
  },
  {
    name: "Rebuild kits",
    category: "other",
    passingScore: 80,
    description: "Clean, service and restock every kit; label what is missing.",
    steps: kitSteps,
    quiz: kitQuiz,
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
    steps: designStudioSteps,
    quiz: designStudioQuiz,
  },
  {
    name: "5S",
    category: "other",
    passingScore: 80,
    description:
      "Follow and explain the 5S, kanban and other tidy-work systems.",
  },
];
