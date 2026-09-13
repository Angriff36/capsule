import type { ParsedEquipmentLine } from "./equipmentPackListParser";

/**
 * The standard off-premise catering kit, drawn from the Mangia pack lists
 * (Equipment / Rentals / Always Pack). One click on the Equipment catalog
 * registers whichever of these the tenant does not have yet, so the Event
 * Equipment tab has real items to reserve instead of a single QA record
 * (#368 item 16). Quantities are sensible starting counts — recount later.
 */
export const STANDARD_EQUIPMENT_CATALOG: readonly ParsedEquipmentLine[] = [
  // Cooking
  {
    name: "Big John Grill",
    quantity: 1,
    category: "Cooking",
    ownership: "owned",
  },
  {
    name: "Propane Tank (20 lb)",
    quantity: 4,
    category: "Cooking",
    ownership: "owned",
  },
  {
    name: "Propane Burner",
    quantity: 2,
    category: "Cooking",
    ownership: "owned",
  },
  { name: "Griddle Top", quantity: 1, category: "Cooking", ownership: "owned" },
  {
    name: "Cambro Hot Box",
    quantity: 4,
    category: "Holding",
    ownership: "owned",
  },
  {
    name: "Cambro Cold Box",
    quantity: 2,
    category: "Holding",
    ownership: "owned",
  },
  {
    name: "Cooler (large)",
    quantity: 4,
    category: "Holding",
    ownership: "owned",
  },
  {
    name: 'Hotel Pan (full, 2")',
    quantity: 24,
    category: "Holding",
    ownership: "owned",
  },
  {
    name: 'Hotel Pan (half, 2")',
    quantity: 24,
    category: "Holding",
    ownership: "owned",
  },
  {
    name: "Hotel Pan Lid",
    quantity: 24,
    category: "Holding",
    ownership: "owned",
  },
  {
    name: "Sheet Tray (full)",
    quantity: 12,
    category: "Holding",
    ownership: "owned",
  },
  // Serving
  {
    name: "Chafing Dish (full)",
    quantity: 8,
    category: "Serving",
    ownership: "owned",
  },
  {
    name: "Chafing Dish (half)",
    quantity: 4,
    category: "Serving",
    ownership: "owned",
  },
  {
    name: "Chafing Fuel (can)",
    quantity: 48,
    category: "Serving",
    ownership: "owned",
  },
  {
    name: "Serving Spoon",
    quantity: 24,
    category: "Serving",
    ownership: "owned",
  },
  {
    name: "Serving Tongs",
    quantity: 24,
    category: "Serving",
    ownership: "owned",
  },
  { name: "Ladle", quantity: 8, category: "Serving", ownership: "owned" },
  {
    name: "Platter (large)",
    quantity: 12,
    category: "Serving",
    ownership: "owned",
  },
  {
    name: "Bowl (serving)",
    quantity: 12,
    category: "Serving",
    ownership: "owned",
  },
  {
    name: "Beverage Dispenser",
    quantity: 4,
    category: "Serving",
    ownership: "owned",
  },
  { name: "Coffee Urn", quantity: 2, category: "Serving", ownership: "owned" },
  { name: "Riser Set", quantity: 2, category: "Serving", ownership: "owned" },
  {
    name: "Menu Card Holder",
    quantity: 24,
    category: "Serving",
    ownership: "owned",
  },
  // Furniture & linens
  {
    name: "Folding Table (6 ft)",
    quantity: 8,
    category: "Furniture",
    ownership: "owned",
  },
  {
    name: "Folding Table (8 ft)",
    quantity: 4,
    category: "Furniture",
    ownership: "owned",
  },
  {
    name: "Folding Chair",
    quantity: 40,
    category: "Furniture",
    ownership: "owned",
  },
  {
    name: "Tablecloth (90x132, white)",
    quantity: 20,
    category: "Linens",
    ownership: "owned",
  },
  {
    name: "Tablecloth (90x132, black)",
    quantity: 20,
    category: "Linens",
    ownership: "owned",
  },
  {
    name: "Napkin (cloth)",
    quantity: 200,
    category: "Linens",
    ownership: "owned",
  },
  { name: "Bar Towel", quantity: 48, category: "Linens", ownership: "owned" },
  { name: "Side Towel", quantity: 48, category: "Linens", ownership: "owned" },
  // Shelter & site
  {
    name: "Tent (10x10 pop-up)",
    quantity: 2,
    category: "Shelter",
    ownership: "owned",
  },
  { name: "Tent Weight", quantity: 8, category: "Shelter", ownership: "owned" },
  { name: "Tarp", quantity: 4, category: "Shelter", ownership: "owned" },
  {
    name: "Floor Mat (anti-fatigue)",
    quantity: 4,
    category: "Shelter",
    ownership: "owned",
  },
  {
    name: "Handwashing Station",
    quantity: 1,
    category: "Sanitation",
    ownership: "owned",
  },
  {
    name: "Water Jug (5 gal)",
    quantity: 2,
    category: "Sanitation",
    ownership: "owned",
  },
  {
    name: "Trash Can (32 gal)",
    quantity: 4,
    category: "Sanitation",
    ownership: "owned",
  },
  { name: "Bus Tub", quantity: 8, category: "Sanitation", ownership: "owned" },
  {
    name: "Sanitizer Bucket",
    quantity: 4,
    category: "Sanitation",
    ownership: "owned",
  },
  {
    name: "Fire Extinguisher",
    quantity: 1,
    category: "Safety",
    ownership: "owned",
  },
  {
    name: "First Aid Kit",
    quantity: 1,
    category: "Safety",
    ownership: "owned",
  },
  {
    name: "Extension Cord (50 ft)",
    quantity: 4,
    category: "Site",
    ownership: "owned",
  },
  { name: "Work Light", quantity: 2, category: "Site", ownership: "owned" },
  { name: "Generator", quantity: 1, category: "Site", ownership: "owned" },
  // Transport
  {
    name: "Hand Truck",
    quantity: 2,
    category: "Transport",
    ownership: "owned",
  },
  {
    name: "Folding Cart",
    quantity: 2,
    category: "Transport",
    ownership: "owned",
  },
  {
    name: "Speed Rack",
    quantity: 2,
    category: "Transport",
    ownership: "owned",
  },
  {
    name: "Milk Crate",
    quantity: 12,
    category: "Transport",
    ownership: "owned",
  },
  {
    name: "Bungee / Tie-down Set",
    quantity: 2,
    category: "Transport",
    ownership: "owned",
  },
  // Front of house
  {
    name: "Easel (welcome sign)",
    quantity: 1,
    category: "Front of House",
    ownership: "owned",
  },
  {
    name: "Cake Stand",
    quantity: 2,
    category: "Front of House",
    ownership: "owned",
  },
  {
    name: "Cake Knife & Server",
    quantity: 2,
    category: "Front of House",
    ownership: "owned",
  },
  {
    name: "Ice Bucket",
    quantity: 4,
    category: "Front of House",
    ownership: "owned",
  },
  {
    name: "Bar Kit",
    quantity: 2,
    category: "Front of House",
    ownership: "owned",
  },
];

/** Standard rows the tenant does not have yet, matched by name. */
export function missingStandardEquipment(
  existing: ReadonlyArray<{ name: string }> | undefined,
): ParsedEquipmentLine[] {
  const have = new Set(
    (existing ?? []).map((row) => row.name.trim().toLowerCase()),
  );
  return STANDARD_EQUIPMENT_CATALOG.filter(
    (row) => !have.has(row.name.toLowerCase()),
  );
}
