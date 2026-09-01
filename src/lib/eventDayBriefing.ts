/**
 * Event Day briefing hooks + row shapes (issue #258).
 *
 * Lives in src/lib (like useAuthStatus and sourceProvenance) so feature
 * roots stay free of direct convex/react hooks. The authored seam
 * convex/eventDayBriefing.ts is readable by EVERY tenant member with a
 * real role and ships only the day-of fields — these types are the
 * contract the Event Day feature builds on instead of full Doc<> rows.
 */
import { useQuery } from "convex/react";
import { api } from "./api";

export type EventDayEventSummary = {
  _id: string;
  title: string | null;
  startsAt: number | null;
  stage: string | null;
  venueName: string | null;
  expectedHeadcount: number | null;
};

export type EventDayEvent = {
  _id: string;
  deletedAt: number | null;
  title: string | null;
  eventType: string | null;
  startsAt: number | null;
  endsAt: number | null;
  stage: string | null;
  expectedHeadcount: number | null;
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  clientId: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
};

export type EventDayVenue = {
  _id: string;
  name: string | null;
  capacity: number | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  parkingAvailable: boolean | null;
  kitchenAccess: boolean | null;
  powerAvailable: boolean | null;
  waterAccess: boolean | null;
  hasFreightElevator: boolean | null;
  hasStairs: boolean | null;
  storageAvailable: boolean | null;
  loadInInstructions: string | null;
  accessNotes: string | null;
  cateringNotes: string | null;
  restrictions: string | null;
  contactName: string | null;
  contactPhone: string | null;
};

export type EventDayAssignment = {
  _id: string;
  eventId: string;
  deletedAt: number | null;
  status: string | null;
  startsAt: number | null;
  endsAt: number | null;
  personId: string | null;
  role: string | null;
};

export type EventDayStaffNeed = {
  _id: string;
  eventId: string;
  deletedAt: number | null;
  status: string | null;
  startsAt: number | null;
  endsAt: number | null;
  role: string | null;
  description: string | null;
};

export type EventDayActivity = {
  _id: string;
  eventId: string;
  deletedAt: number | null;
  scheduledAt: number | null;
  startsAt: number | null;
  sortOrder: number | null;
  name: string | null;
  siteNotes: string | null;
  assigneeTeams: string[];
  assigneePersonIds: string[];
  responsibleParty: string | null;
};

export type EventDayEventDish = {
  _id: string;
  eventId: string;
  deletedAt: number | null;
  removedAt: number | null;
  course: string | null;
  dishId: string | null;
  specialInstructions: string | null;
  quantityServings: number | null;
};

export type EventDayDish = {
  _id: string;
  deletedAt: number | null;
  name: string | null;
  allergenSummary: string[];
};

export type EventDayRecipeLine = {
  _id: string;
  deletedAt: number | null;
  dishId: string | null;
  componentId: string | null;
  ingredientId: string | null;
  ingredient: { name: string | null; allergens: string[] } | null;
};

export type EventDayDishComponent = {
  _id: string;
  deletedAt: number | null;
  dishId: string;
  componentId: string;
};

export type EventDayDelivery = {
  _id: string;
  eventId: string;
  deletedAt: number | null;
  status: string | null;
  vehicleId: string | null;
  driverId: string | null;
  windowStartsAt: number | null;
  windowEndsAt: number | null;
  destination: string | null;
};

export type EventDayVehicle = {
  _id: string;
  make: string | null;
  model: string | null;
};

export type EventDayLayoutSection = {
  _id: string;
  eventId: string;
  deletedAt: number | null;
  addedAt: number | null;
  sortOrder: number | null;
  type: string | null;
  instructions: string | null;
};

export type EventDayEquipmentReservation = {
  _id: string;
  eventId: string;
  deletedAt: number | null;
  status: string | null;
  quantity: number | null;
  equipmentId: string | null;
  startsAt: number | null;
  endsAt: number | null;
};

export type EventDayEquipment = {
  _id: string;
  name: string | null;
};

export type EventDayClientContact = {
  _id: string;
  deletedAt: number | null;
  clientId: string;
  status: string | null;
  isPrimary: boolean | null;
  givenName: string | null;
  familyName: string | null;
  title: string | null;
  phone: string | null;
  mobile: string | null;
};

export type EventDayPackList = {
  _id: string;
  eventId: string;
  deletedAt: number | null;
  status: string | null;
  name: string | null;
};

export type EventDayPackListItem = {
  _id: string;
  deletedAt: number | null;
  packListId: string;
  status: string | null;
  description: string | null;
  requiredQuantity: number | null;
  unit: string | null;
};

export type EventDayPerson = {
  _id: string;
  givenName: string | null;
  familyName: string | null;
};

export type EventDayBriefing = {
  event: EventDayEvent;
  venue: EventDayVenue | null;
  assignments: EventDayAssignment[];
  staffNeeds: EventDayStaffNeed[];
  activities: EventDayActivity[];
  eventDishes: EventDayEventDish[];
  dishes: EventDayDish[];
  dishIngredients: EventDayRecipeLine[];
  dishComponents: EventDayDishComponent[];
  componentIngredients: EventDayRecipeLine[];
  deliveries: EventDayDelivery[];
  vehicles: EventDayVehicle[];
  layoutSections: EventDayLayoutSection[];
  equipmentReservations: EventDayEquipmentReservation[];
  equipments: EventDayEquipment[];
  clientContacts: EventDayClientContact[];
  packLists: EventDayPackList[];
  packListItems: EventDayPackListItem[];
  people: EventDayPerson[];
};

/** undefined = loading; null = signed out / no role / no tenant. */
export function useEventDayEvents(): EventDayEventSummary[] | null | undefined {
  return useQuery(api.eventDayBriefing.listEvents, {}) as
    EventDayEventSummary[] | null | undefined;
}

/** undefined = loading; null = unauthorized, bad id, or event gone. */
export function useEventDayBriefing(
  eventId: string | undefined,
): EventDayBriefing | null | undefined {
  return useQuery(
    api.eventDayBriefing.getBriefing,
    eventId ? { eventId } : "skip",
  ) as EventDayBriefing | null | undefined;
}
