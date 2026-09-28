import type { Section } from "../model";
import type { FinalLockGroup, Resolver } from "./types";

/**
 * The Final Lock training manual as versioned policy. Bump a question's
 * `ruleVersion` when its rule changes: answers printed under the old rule
 * turn stale, and only those. POLICY_VERSION names the whole catalogue.
 */
export const POLICY_VERSION = "final-lock-2026-09-28";

export interface Question {
  key: string;
  group: FinalLockGroup;
  section: Section;
  label: string;
  resolver: Resolver;
  ruleVersion: number;
  /** Field confirmations only: the physical form a person completes. */
  form?: string;
}

const q = (
  key: string,
  group: FinalLockGroup,
  section: Section,
  resolver: Resolver,
  label: string,
  form?: string,
): Question => ({ key, group, section, resolver, label, ruleVersion: 1, form });

export const QUESTIONS: readonly Question[] = [
  q("identity.service_style", "identity", "contacts", "Sales", "Service style"),
  q("identity.guest_count", "identity", "contacts", "Sales", "Guest count"),
  q("identity.venue", "identity", "venue", "Sales", "Venue"),
  q("identity.customer", "identity", "contacts", "Sales", "Customer"),
  q("identity.contact", "identity", "contacts", "Sales", "Day-of contact"),
  q("identity.event_number", "identity", "contacts", "Sales", "Event number"),
  q("identity.owner", "identity", "contacts", "Sales", "Event owner"),
  q("identity.billing", "identity", "contacts", "Sales", "Who pays"),
  q("menu.order", "menu", "menu", "Kitchen", "Menu order"),
  q("menu.servings", "menu", "menu", "Kitchen", "Servings for the guests"),
  q("menu.no_empty_shell", "menu", "menu", "Kitchen", "No empty menu lines"),
  q("menu.production_notes", "menu", "menu", "Kitchen", "Dish notes handled"),
  q("menu.service_fit", "menu", "menu", "Kitchen", "Dishes fit the service"),
  q("timeline.schedule", "timeline", "timeline", "Operations", "Day plan"),
  q("timeline.route", "timeline", "timeline", "Logistics", "Route"),
  q("setup.linen_tables", "setup", "layouts", "Operations", "Table linen"),
  q("setup.linen_baskets", "setup", "layouts", "Operations", "Basket linen"),
  q("setup.diagram", "setup", "layouts", "Operations", "Setup diagram"),
  q("setup.rain_plan", "setup", "layouts", "Operations", "Rain plan"),
  q("setup.venue_surface", "setup", "layouts", "Operations", "Ground surface"),
  q("setup.tent_flooring", "setup", "layouts", "Operations", "Tent and floor"),
  q("setup.handwashing", "setup", "layouts", "Operations", "Handwashing"),
  q(
    "setup.servingware_kit",
    "setup",
    "packlist",
    "Operations",
    "Servingware kit",
  ),
  q("setup.load_in", "setup", "venue", "Operations", "Load-in notes"),
  q(
    "servingware.source",
    "servingware",
    "packlist",
    "Operations",
    "Plates and china from",
  ),
  q(
    "rentals.return",
    "rentals",
    "equipment",
    "Logistics",
    "Rentals after the event",
  ),
  q(
    "room.guest_tables",
    "room",
    "layouts",
    "Operations",
    "Guest tables and chairs",
  ),
  q(
    "room.place_settings",
    "room",
    "layouts",
    "Operations",
    "Flatware and china on tables",
  ),
  q("room.water_goblets", "room", "layouts", "Operations", "Water goblets"),
  q("room.buffet_tables", "room", "layouts", "Operations", "Buffet tables"),
  q(
    "room.appetizer_tables",
    "room",
    "layouts",
    "Operations",
    "Appetizer tables",
  ),
  q("room.beverage_tables", "room", "layouts", "Operations", "Drinks table"),
  q(
    "food.appetizer_placement",
    "food",
    "layouts",
    "Operations",
    "Where appetizers go",
  ),
  q(
    "food.beverage_dispensers",
    "food",
    "equipment",
    "Operations",
    "Drink dispensers",
  ),
  q(
    "food.buffet_served",
    "food",
    "staffing",
    "Operations",
    "Buffet served or self-serve",
  ),
  q("bussing.plan", "bussing", "staffing", "Operations", "Clearing tables"),
  q("dessert.plan", "dessert", "menu", "Operations", "Dessert and coffee"),
  q("beverage.bar", "beverage", "menu", "Operations", "Bar and drinks"),
  q("buffet.arrangement", "buffet", "layouts", "Kitchen", "Buffet order"),
  q(
    "vehicles.assigned",
    "vehicles",
    "vehicles",
    "Logistics",
    "Trucks and equipment",
  ),
  q(
    "communication.channel",
    "communication",
    "staffing",
    "Operations",
    "Event chat",
  ),
  q(
    "readiness.dispatch",
    "readiness",
    "packlist",
    "Operations",
    "Ready to leave",
  ),
  q(
    "field.leaving-shop",
    "field",
    "vehicles",
    "Logistics",
    "Leaving the shop",
    "field.leaving-shop",
  ),
  q(
    "field.takeoff-readiness",
    "field",
    "vehicles",
    "Logistics",
    "Before takeoff (two people)",
    "field.takeoff-readiness",
  ),
  q(
    "field.arrival",
    "field",
    "venue",
    "Operations",
    "Event arrival",
    "field.arrival",
  ),
  q("field.muda", "field", "menu", "Kitchen", "Food waste count", "field.muda"),
  q("field.bins", "field", "packlist", "Logistics", "Bin sheet", "field.bins"),
  q(
    "field.after-event",
    "field",
    "staffing",
    "Operations",
    "After the event",
    "field.after-event",
  ),
  q(
    "field.return",
    "field",
    "vehicles",
    "Logistics",
    "Back at the shop",
    "field.return",
  ),
  q(
    "field.packing",
    "field",
    "packlist",
    "Logistics",
    "Packing checklist",
    "field.packing",
  ),
  q(
    "field.buffet-drawing",
    "field",
    "layouts",
    "Operations",
    "Buffet drawing",
    "field.buffet-drawing",
  ),
  q(
    "field.leaving-event",
    "field",
    "venue",
    "Operations",
    "Leaving the event",
    "field.leaving-event",
  ),
];

export const questionFor = (key: string, policy = QUESTIONS) => {
  const found = policy.find((item) => item.key === key);
  if (!found) throw new Error(`Unknown Final Lock question ${key}`);
  return found;
};

/** Service style names the shop uses (see Event.binderColor). */
export const isDropOff = (style: string | null) =>
  !!style && /drop[\s-]?off/i.test(style);
