export const EVENT_WIZARD_STEPS = [
  "Client",
  "Date, venue & headcount",
  "Dishes",
  "Staff",
  "Review",
] as const;
export type EventWizardStep = (typeof EVENT_WIZARD_STEPS)[number];
export type EventWizardDish = {
  lineId: string;
  dishId: string;
  dishName: string;
};
export type EventWizardStaff = {
  lineId: string;
  personId: string;
  personName: string;
  role: string;
};
export type EventWizardCommitEntry = {
  key: string;
  fingerprint: string;
  status: "attempted" | "saved";
  docId?: string;
};
export type EventWizardCommitProgress = {
  event?: EventWizardCommitEntry;
  dishes: Record<string, EventWizardCommitEntry>;
  staff: Record<string, EventWizardCommitEntry>;
  /** Counters ensure a confirmed rejected key is never reused. */
  retryAttempts: Record<string, number>;
};
export type EventWizardDraft = {
  version: 3;
  draftKey: string;
  clientId: string;
  title: string;
  primaryContactName: string;
  venueId: string;
  eventType: string;
  startsAt: string;
  endsAt: string;
  expectedHeadcount: string;
  budgetAmount: string;
  quotedPrice: string;
  dishes: EventWizardDish[];
  staff: EventWizardStaff[];
  skipped: EventWizardStep[];
  completed: EventWizardStep[];
  commitProgress: EventWizardCommitProgress;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isStep = (value: unknown): value is EventWizardStep =>
  typeof value === "string" &&
  EVENT_WIZARD_STEPS.includes(value as EventWizardStep);
const isCommitEntry = (value: unknown): value is EventWizardCommitEntry =>
  isRecord(value) &&
  typeof value.key === "string" &&
  typeof value.fingerprint === "string" &&
  (value.status === "attempted" || value.status === "saved") &&
  (value.docId === undefined || typeof value.docId === "string");
const isLine = (value: unknown, fields: readonly string[]) =>
  isRecord(value) && fields.every((field) => typeof value[field] === "string");

/** Reject malformed browser state before it can enter the controlled wizard. */
export function parseEventWizardDraft(value: unknown): EventWizardDraft | null {
  if (!isRecord(value) || value.version !== 3) return null;
  const strings = [
    "draftKey",
    "clientId",
    "title",
    "primaryContactName",
    "venueId",
    "eventType",
    "startsAt",
    "endsAt",
    "expectedHeadcount",
    "budgetAmount",
    "quotedPrice",
  ];
  if (!strings.every((field) => typeof value[field] === "string")) return null;
  if (
    !Array.isArray(value.dishes) ||
    !value.dishes.every((line) =>
      isLine(line, ["lineId", "dishId", "dishName"]),
    ) ||
    !Array.isArray(value.staff) ||
    !value.staff.every((line) =>
      isLine(line, ["lineId", "personId", "personName", "role"]),
    ) ||
    !Array.isArray(value.skipped) ||
    !value.skipped.every(isStep) ||
    !Array.isArray(value.completed) ||
    !value.completed.every(isStep) ||
    !isRecord(value.commitProgress)
  )
    return null;
  const { event, dishes, staff, retryAttempts } = value.commitProgress;
  if (
    (event !== undefined && !isCommitEntry(event)) ||
    !isRecord(dishes) ||
    !Object.values(dishes).every(isCommitEntry) ||
    !isRecord(staff) ||
    !Object.values(staff).every(isCommitEntry) ||
    !isRecord(retryAttempts) ||
    !Object.values(retryAttempts).every(
      (attempt) =>
        typeof attempt === "number" &&
        Number.isInteger(attempt) &&
        attempt >= 0,
    )
  )
    return null;
  return value as unknown as EventWizardDraft;
}

export function changeStepCompletion(
  draft: EventWizardDraft,
  step: EventWizardStep,
  complete: boolean,
): Pick<EventWizardDraft, "completed" | "skipped"> {
  return {
    completed: complete
      ? [...new Set([...draft.completed, step])]
      : draft.completed.filter((item) => item !== step),
    skipped: complete
      ? draft.skipped.filter((item) => item !== step)
      : [...new Set([...draft.skipped, step])],
  };
}
export function createEventWizardDraft(draftKey: string): EventWizardDraft {
  return {
    version: 3,
    draftKey,
    clientId: "",
    title: "",
    primaryContactName: "",
    venueId: "",
    eventType: "",
    startsAt: "",
    endsAt: "",
    expectedHeadcount: "",
    budgetAmount: "0",
    quotedPrice: "0",
    dishes: [],
    staff: [],
    skipped: [],
    completed: [],
    commitProgress: { dishes: {}, staff: {}, retryAttempts: {} },
  };
}
function clientErrors(draft: EventWizardDraft): string[] {
  return [
    !draft.clientId ? "Select a client." : "",
    !draft.title.trim() ? "Enter an event title." : "",
    !draft.primaryContactName.trim() ? "Enter a primary contact name." : "",
  ].filter(Boolean);
}
function scheduleErrors(draft: EventWizardDraft): string[] {
  const start = Date.parse(draft.startsAt),
    end = Date.parse(draft.endsAt),
    headcount = Number(draft.expectedHeadcount),
    budget = Number(draft.budgetAmount),
    price = Number(draft.quotedPrice);
  return [
    !draft.venueId ? "Select a venue." : "",
    !draft.eventType.trim() ? "Enter an event type." : "",
    !Number.isFinite(start) ? "Enter a start date and time." : "",
    !Number.isFinite(end) ? "Enter an end date and time." : "",
    Number.isFinite(start) && Number.isFinite(end) && end <= start
      ? "End must be after the start time."
      : "",
    !Number.isFinite(headcount) || headcount < 1 || headcount > 100000
      ? "Headcount must be between 1 and 100000."
      : "",
    !Number.isFinite(budget) || budget < 0
      ? "Budget must be zero or greater."
      : "",
    !Number.isFinite(price) || price < 0
      ? "Quoted price must be zero or greater."
      : "",
  ].filter(Boolean);
}
/** Populated lines must be valid even when their optional step was skipped. */
export function dishLineErrors(draft: EventWizardDraft): string[] {
  const ids = draft.dishes.map((dish) => dish.dishId);
  return [
    draft.dishes.some((dish) => !dish.dishId)
      ? "Each dish needs a catalog dish."
      : "",
    new Set(ids).size !== ids.length ? "Add each dish only once." : "",
  ].filter(Boolean);
}
/** Populated lines must be valid even when their optional step was skipped. */
export function staffLineErrors(draft: EventWizardDraft): string[] {
  const pairs = draft.staff.map(
    (staff) => `${staff.personId}:${staff.role.trim()}`,
  );
  return [
    draft.staff.some((staff) => !staff.personId || !staff.role.trim())
      ? "Each staff assignment needs a person and role."
      : "",
    new Set(pairs).size !== pairs.length
      ? "Add each person and role only once."
      : "",
  ].filter(Boolean);
}
export function validateEventWizardStep(
  step: EventWizardStep,
  draft: EventWizardDraft,
): string[] {
  if (step === "Client") return clientErrors(draft);
  if (step === "Date, venue & headcount") return scheduleErrors(draft);
  if (step === "Dishes")
    return [
      draft.dishes.length === 0
        ? "Add at least one dish, or choose Skip for now."
        : "",
      ...dishLineErrors(draft),
    ].filter(Boolean);
  if (step === "Staff")
    return [
      draft.staff.length === 0
        ? "Add at least one staff assignment, or choose Skip for now."
        : "",
      ...staffLineErrors(draft),
    ].filter(Boolean);
  return [];
}
/** Only client/schedule are mandatory; entered optional lines must still be valid. */
export function eventWizardCreateErrors(draft: EventWizardDraft): string[] {
  return [
    ...clientErrors(draft).map((error) => `Client: ${error}`),
    ...scheduleErrors(draft).map(
      (error) => `Date, venue & headcount: ${error}`,
    ),
    ...dishLineErrors(draft).map((error) => `Dishes: ${error}`),
    ...staffLineErrors(draft).map((error) => `Staff: ${error}`),
  ];
}
export const eventWizardRequiredErrors = eventWizardCreateErrors;
export function eventWizardStepState(
  step: EventWizardStep,
  draft: EventWizardDraft,
) {
  if (draft.skipped.includes(step)) return "Incomplete";
  if (draft.completed.includes(step))
    return validateEventWizardStep(step, draft).length === 0
      ? "Complete"
      : "Incomplete";
  return "Not started";
}
export type WizardAutomation = {
  automation: string;
  unlocked: boolean;
  missing: string[];
};
/** Operational dependencies are derived from the same persisted Event/Menu/Assignment inputs. */
export function eventWizardUnlocks(
  draft: EventWizardDraft,
): WizardAutomation[] {
  const headcount = Number(draft.expectedHeadcount);
  const schedule = [
    Number.isFinite(Date.parse(draft.startsAt)) ? "" : "date",
    Number.isFinite(headcount) && headcount >= 1 ? "" : "headcount",
  ].filter(Boolean);
  const venue = draft.venueId ? [] : ["venue"],
    dishes = draft.dishes.length ? [] : ["dishes"],
    staff = draft.staff.length ? [] : ["staff"];
  return [
    {
      automation: "Demand, prep, and allergen planning",
      unlocked: schedule.length === 0 && dishes.length === 0,
      missing: [...schedule, ...dishes],
    },
    {
      automation: "Event Day briefing",
      unlocked: schedule.length === 0 && venue.length === 0,
      missing: [...schedule, ...venue],
    },
    {
      automation: "Staffing and labor planning",
      unlocked: staff.length === 0 && schedule.length === 0,
      missing: [...staff, ...schedule],
    },
  ];
}
/** JSON with deterministic object-key order: safe to compare stored command payloads. */
export function eventWizardFingerprint(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, normalize(child)]),
      );
    return input;
  };
  return JSON.stringify(normalize(value));
}
