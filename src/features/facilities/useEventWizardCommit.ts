import {
  useCreateEvent,
  useCreateEventAssignment,
  useCreateEventDish,
} from "../../lib/manifest-convex-react";
import { eventPlanEngagementFormMapper } from "../events/EventPlanEngagementFormMapper";
import {
  eventWizardCreateErrors,
  eventWizardFingerprint,
  type EventWizardCommitEntry,
  type EventWizardCommitProgress,
  type EventWizardDraft,
} from "../events/eventCreateWizardModel";
import { setWorkingEvent } from "../events/workingEvent";

/** The same required payload builder used by the long event-create form. */
export function eventWizardEventArgs(
  draft: EventWizardDraft,
): Record<string, unknown> {
  return eventPlanEngagementFormMapper.toCommandArgs({
    clientId: draft.clientId,
    venueId: draft.venueId,
    venue: undefined,
    pickup: draft.pickup === true,
    title: draft.title,
    eventTypeRaw: draft.eventType,
    occasionId: "",
    serviceStyleId: draft.serviceStyleId ?? "",
    salespersonId: "",
    referralSourceId: "",
    startsAtRaw: draft.startsAt,
    endsAtRaw: draft.endsAt,
    expectedHeadcountRaw: draft.expectedHeadcount,
    primaryContactName: draft.primaryContactName,
    primaryContactEmail: "",
    primaryContactPhone: "",
    budgetAmountRaw: draft.budgetAmount,
    quotedPriceRaw: draft.quotedPrice,
    accessibilityNeedsRaw: "",
    serviceRequirements: "",
    operationalRequirements: "",
  });
}
export type EventWizardCommitPorts = {
  createEvent: (
    args: Record<string, unknown>,
  ) => Promise<{ docId?: string } | void>;
  createDish: (
    args: Record<string, unknown>,
  ) => Promise<{ docId?: string } | void>;
  createAssignment: (
    args: Record<string, unknown>,
  ) => Promise<{ docId?: string } | void>;
  setWorkingEvent: (eventId: string) => void;
};
const entryKey = (
  draft: EventWizardDraft,
  name: string,
  progress: EventWizardCommitProgress,
) => {
  const base = `${draft.draftKey}:${name}`,
    retry = progress.retryAttempts[name] ?? 0;
  return retry ? `${base}:a${retry}` : base;
};
const commandArgs = (args: Record<string, unknown>, key: string) => ({
  ...args,
  idempotencyKey: key,
});
const mismatch = (label: string): never => {
  throw new Error(
    `${label} may already be saved with different details. Open the event page to change saved work, then retry only unchanged wizard entries.`,
  );
};
function existingEntry(
  entry: EventWizardCommitEntry | undefined,
  fingerprint: string,
  label: string,
) {
  if (entry && entry.fingerprint !== fingerprint) mismatch(label);
  return entry;
}
function rejected(
  progress: EventWizardCommitProgress,
  kind: "event" | "dishes" | "staff",
  lineId?: string,
): EventWizardCommitProgress {
  const slot = lineId ? `${kind === "dishes" ? "dish" : kind}:${lineId}` : kind;
  return {
    ...progress,
    event: kind === "event" ? undefined : progress.event,
    dishes:
      kind === "dishes" && lineId
        ? Object.fromEntries(
            Object.entries(progress.dishes).filter(([key]) => key !== lineId),
          )
        : progress.dishes,
    staff:
      kind === "staff" && lineId
        ? Object.fromEntries(
            Object.entries(progress.staff).filter(([key]) => key !== lineId),
          )
        : progress.staff,
    retryAttempts: {
      ...progress.retryAttempts,
      [slot]: (progress.retryAttempts[slot] ?? 0) + 1,
    },
  };
}

type PreparedLine<T> = { line: T; args: Record<string, unknown> };

/**
 * Read every persisted entry before beginning a retry.  This deliberately has
 * no port or progress side effects: a later changed line must not leave a new
 * earlier row behind.
 */
function preflightEventWizard(draft: EventWizardDraft) {
  const progress = draft.commitProgress;
  const eventArgs = eventWizardEventArgs(draft);
  const eventFingerprint = eventWizardFingerprint(eventArgs);
  const problems: string[] = [];
  if (progress.event && progress.event.fingerprint !== eventFingerprint)
    problems.push("Event details may already be saved with different details.");
  const event = progress.event;
  const dishIds = new Set(draft.dishes.map((line) => line.lineId));
  const staffIds = new Set(draft.staff.map((line) => line.lineId));
  for (const lineId of Object.keys(progress.dishes))
    if (!dishIds.has(lineId))
      problems.push(`Saved dish '${lineId}' was removed.`);
  for (const lineId of Object.keys(progress.staff))
    if (!staffIds.has(lineId))
      problems.push(`Saved staff assignment '${lineId}' was removed.`);
  const savedEvent =
    event?.status === "saved" && event.docId ? event.docId : undefined;
  if (
    !savedEvent &&
    (Object.keys(progress.dishes).length || Object.keys(progress.staff).length)
  )
    problems.push(
      "Saved work is out of sync. Open the event page to change saved work.",
    );
  const dishes: PreparedLine<EventWizardDraft["dishes"][number]>[] = [];
  const staff: PreparedLine<EventWizardDraft["staff"][number]>[] = [];
  if (savedEvent) {
    for (const line of draft.dishes) {
      const args = {
        eventId: savedEvent,
        dishId: line.dishId,
        dishName: line.dishName,
        quantityServings: Number(draft.expectedHeadcount),
        headcountOverride: 0,
      };
      const entry = progress.dishes[line.lineId];
      if (entry && entry.fingerprint !== eventWizardFingerprint(args))
        problems.push(
          `Dish '${line.dishName}' may already be saved with different details.`,
        );
      dishes.push({ line, args });
    }
    for (const line of draft.staff) {
      const args = {
        eventId: savedEvent,
        personId: line.personId,
        role: line.role,
      };
      const entry = progress.staff[line.lineId];
      if (entry && entry.fingerprint !== eventWizardFingerprint(args))
        problems.push(
          `Staff assignment for '${line.personName}' may already be saved with different details.`,
        );
      staff.push({ line, args });
    }
  }
  if (problems.length)
    throw new Error(
      `${problems.join(" ")} Open the event page to change saved work, then retry only unchanged wizard entries.`,
    );
  return { eventArgs, eventFingerprint, event, dishes, staff };
}

export class EventWizardCreateValidationError extends Error {
  constructor(readonly errors: string[]) {
    super("Complete the required event details before creating the event.");
  }
}

export type EventWizardStorage = Pick<Storage, "removeItem">;

/** Pure, testable create orchestration: validate before any storage or port call. */
export async function runEventWizardCreate({
  draft,
  commit,
  storage,
  navigate,
  onProgress,
}: {
  draft: EventWizardDraft;
  commit: (
    draft: EventWizardDraft,
    onProgress: (next: EventWizardCommitProgress) => void,
  ) => Promise<string>;
  storage: EventWizardStorage;
  navigate: (eventId: string) => void;
  onProgress: (next: EventWizardCommitProgress) => void;
}) {
  const errors = eventWizardCreateErrors(draft);
  if (errors.length) throw new EventWizardCreateValidationError(errors);
  const eventId = await commit(draft, onProgress);
  storage.removeItem("capsule.event-create-wizard.active");
  navigate(eventId);
  return eventId;
}

/** Records every write before it starts, preventing a refresh/lost response from replaying changed data. */
export async function commitEventWizard(
  ports: EventWizardCommitPorts,
  draft: EventWizardDraft,
  onProgress: (next: EventWizardCommitProgress) => void,
) {
  let progress = draft.commitProgress;
  const prepared = preflightEventWizard(draft);
  const { eventArgs, eventFingerprint } = prepared;
  let event = prepared.event;
  if (!event || event.status === "attempted") {
    event ??= {
      key: entryKey(draft, "event", progress),
      fingerprint: eventFingerprint,
      status: "attempted",
    };
    progress = { ...progress, event };
    onProgress(progress);
    try {
      const created = await ports.createEvent(
        commandArgs(eventArgs, event.key),
      );
      if (!created?.docId)
        throw new Error("Could not confirm the event was saved.");
      event = { ...event, status: "saved", docId: created.docId };
      progress = { ...progress, event };
      onProgress(progress);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Could not confirm the event was saved."
      )
        throw error;
      progress = rejected(progress, "event");
      onProgress(progress);
      throw new Error(
        `Could not create event: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  if (!event.docId) throw new Error("Could not confirm the event was saved.");
  ports.setWorkingEvent(event.docId);
  const preparedDishes = prepared.dishes.length
    ? prepared.dishes
    : draft.dishes.map((line) => ({
        line,
        args: {
          eventId: event.docId!,
          dishId: line.dishId,
          dishName: line.dishName,
          quantityServings: Number(draft.expectedHeadcount),
          headcountOverride: 0,
        },
      }));
  for (const { line: dish, args } of preparedDishes) {
    const fingerprint = eventWizardFingerprint(args);
    let entry = existingEntry(
      progress.dishes[dish.lineId],
      fingerprint,
      `Dish '${dish.dishName}'`,
    );
    if (entry?.status === "saved") continue;
    entry ??= {
      key: entryKey(draft, `dish:${dish.lineId}`, progress),
      fingerprint,
      status: "attempted",
    };
    progress = {
      ...progress,
      dishes: { ...progress.dishes, [dish.lineId]: entry },
    };
    onProgress(progress);
    try {
      const created = await ports.createDish(commandArgs(args, entry.key));
      if (!created?.docId)
        throw new Error("Could not confirm the dish was saved.");
      progress = {
        ...progress,
        dishes: {
          ...progress.dishes,
          [dish.lineId]: { ...entry, status: "saved", docId: created.docId },
        },
      };
      onProgress(progress);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Could not confirm the dish was saved."
      )
        throw error;
      progress = rejected(progress, "dishes", dish.lineId);
      onProgress(progress);
      throw new Error(
        `Could not add dish '${dish.dishName}': ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  const preparedStaff = prepared.staff.length
    ? prepared.staff
    : draft.staff.map((line) => ({
        line,
        args: {
          eventId: event.docId!,
          personId: line.personId,
          role: line.role,
        },
      }));
  for (const { line: staff, args } of preparedStaff) {
    const fingerprint = eventWizardFingerprint(args);
    let entry = existingEntry(
      progress.staff[staff.lineId],
      fingerprint,
      `Staff assignment for '${staff.personName}'`,
    );
    if (entry?.status === "saved") continue;
    entry ??= {
      key: entryKey(draft, `staff:${staff.lineId}`, progress),
      fingerprint,
      status: "attempted",
    };
    progress = {
      ...progress,
      staff: { ...progress.staff, [staff.lineId]: entry },
    };
    onProgress(progress);
    try {
      const created = await ports.createAssignment(
        commandArgs(args, entry.key),
      );
      if (!created?.docId)
        throw new Error("Could not confirm the staff assignment was saved.");
      progress = {
        ...progress,
        staff: {
          ...progress.staff,
          [staff.lineId]: { ...entry, status: "saved", docId: created.docId },
        },
      };
      onProgress(progress);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Could not confirm the staff assignment was saved."
      )
        throw error;
      progress = rejected(progress, "staff", staff.lineId);
      onProgress(progress);
      throw new Error(
        `Could not add staff assignment for '${staff.personName}': ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  return event.docId;
}
export function useEventWizardCommit() {
  const createEvent = useCreateEvent(),
    createDish = useCreateEventDish(),
    createAssignment = useCreateEventAssignment();
  return (
    draft: EventWizardDraft,
    onProgress: (next: EventWizardCommitProgress) => void,
  ) =>
    commitEventWizard(
      { createEvent, createDish, createAssignment, setWorkingEvent },
      draft,
      onProgress,
    );
}
