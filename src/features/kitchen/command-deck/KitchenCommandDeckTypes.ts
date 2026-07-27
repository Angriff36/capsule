export type CommandDeckFilter =
  "all" | "kitchen" | "event" | "unassigned" | "blocked" | "mine";

export type PrepTaskLike = {
  _id: string;
  version: number;
  eventId: string;
  eventDishId: string;
  dishId?: string | null;
  name: string;
  status: string;
  quantity: number;
  unit: string;
  category?: string | null;
  station?: string | null;
  assignedToId?: string | null;
  specialInstructions?: string | null;
  notes?: string | null;
  dueAt?: number | null;
  componentId?: string | null;
  deletedAt?: number | null;
};

export type EventLike = {
  _id: string;
  title: string;
  startsAt: number;
  endsAt?: number | null;
  expectedHeadcount?: number | null;
  venueId?: string | null;
  deletedAt?: number | null;
};

export type EventDishLike = {
  _id: string;
  eventId: string;
  dishId: string;
  quantityServings: number;
  deletedAt?: number | null;
};

export type DishLike = {
  _id: string;
  name: string;
  primaryComponentId?: string | null;
  primaryImageStorageId?: string | null;
  allergenSummary?: string[] | null;
  deletedAt?: number | null;
};

export type PersonLike = {
  _id: string;
  givenName?: string | null;
  familyName?: string | null;
  deletedAt?: number | null;
};

export type CrewLoadRow = {
  person: PersonLike;
  open: number;
  claimed: number;
  inProgress: number;
  completed: number;
  load: number;
};

export type EventProgress = {
  total: number;
  completed: number;
  pct: number;
};
