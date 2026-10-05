import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatMoney } from "../../lib/format";
import { SearchSelect } from "../../ui/SearchSelect";
import {
  useListClient,
  useListDish,
  useListPerson,
  useListVenue,
} from "../../lib/manifest-convex-react";
import {
  EventWizardCreateValidationError,
  runEventWizardCreate,
  useEventWizardCommit,
} from "../facilities/useEventWizardCommit";
import { eventDetailPath } from "./eventRoutes";
import {
  changeStepCompletion,
  createEventWizardDraft,
  EVENT_WIZARD_STEPS,
  eventWizardCreateErrors,
  eventWizardStepState,
  eventWizardUnlocks,
  parseEventWizardDraft,
  validateEventWizardStep,
  type EventWizardDraft,
} from "./eventCreateWizardModel";
import { DateHoldCollisionNotice } from "../sales/DateHoldCollisionNotice";

const DRAFT_KEY = "capsule.event-create-wizard.active";
const lineId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const newDraftKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function storedDraft(
  storage: Pick<Storage, "getItem" | "removeItem"> = sessionStorage,
): EventWizardDraft {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (raw === null) return createEventWizardDraft(newDraftKey());
    const parsed = parseEventWizardDraft(JSON.parse(raw));
    if (parsed) return parsed;
    storage.removeItem(DRAFT_KEY);
  } catch {
    try {
      storage.removeItem(DRAFT_KEY);
    } catch {
      /* storage is optional */
    }
  }
  return createEventWizardDraft(newDraftKey());
}
function personName(person: any) {
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ") ||
    person._id
  );
}
function clientName(client: any) {
  return client.companyName || personName(client);
}

export function EventCreateWizard({
  onBusyChange,
}: {
  onBusyChange?: (busy: boolean) => void;
}) {
  const navigate = useNavigate();
  const clients = useListClient(),
    venues = useListVenue(),
    dishes = useListDish(),
    people = useListPerson();
  const commit = useEventWizardCommit();
  const [draft, setDraft] = useState<EventWizardDraft>(storedDraft);
  const draftRef = useRef(draft);
  const finishedRef = useRef(false);
  const [step, setStep] = useState(0),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const activeClients = useMemo(
    () =>
      (clients ?? []).filter(
        (item) => item.deletedAt == null && item.status === "active",
      ),
    [clients],
  );
  const activeVenues = useMemo(
    () =>
      (venues ?? []).filter(
        (item) => item.deletedAt == null && item.status === "active",
      ),
    [venues],
  );
  const activeDishes = useMemo(
    () =>
      (dishes ?? []).filter(
        (item) => item.deletedAt == null && item.status === "active",
      ),
    [dishes],
  );
  const activePeople = useMemo(
    () =>
      (people ?? []).filter(
        (item) => item.deletedAt == null && item.status === "active",
      ),
    [people],
  );
  useEffect(
    () => () => {
      onBusyChange?.(false);
    },
    [onBusyChange],
  );
  const saveDraft = (next: EventWizardDraft) => {
    if (finishedRef.current) return;
    draftRef.current = next;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      /* memory remains usable */
    }
    setDraft(next);
  };
  const update = (changes: Partial<EventWizardDraft>) =>
    saveDraft({ ...draftRef.current, ...changes });
  const currentStep = EVENT_WIZARD_STEPS[step];
  const eventProgress = draft.commitProgress.event;
  const savedEvent =
    eventProgress?.status === "saved" ? eventProgress.docId : undefined;
  const next = () => {
    const issues = validateEventWizardStep(currentStep, draft);
    if (issues.length) {
      setErrors(issues);
      return;
    }
    saveDraft({
      ...draftRef.current,
      ...changeStepCompletion(draftRef.current, currentStep, true),
    });
    setErrors([]);
    setStep((current) => Math.min(current + 1, EVENT_WIZARD_STEPS.length - 1));
  };
  const skip = () => {
    saveDraft({
      ...draftRef.current,
      ...changeStepCompletion(draftRef.current, currentStep, false),
    });
    setErrors([]);
    setStep((current) => Math.min(current + 1, EVENT_WIZARD_STEPS.length - 1));
  };
  const create = async () => {
    setBusy(true);
    onBusyChange?.(true);
    setFailure("");
    try {
      await runEventWizardCreate({
        draft: draftRef.current,
        commit,
        storage: sessionStorage,
        onProgress: (commitProgress) =>
          saveDraft({ ...draftRef.current, commitProgress }),
        navigate: (eventId) => {
          finishedRef.current = true;
          navigate(eventDetailPath(eventId));
        },
      });
    } catch (error) {
      if (error instanceof EventWizardCreateValidationError)
        setErrors(error.errors);
      setFailure(
        error instanceof Error
          ? error.message
          : "The event could not be created. Fix the problem and retry; completed work will not be repeated.",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const unlocks = eventWizardUnlocks(draft);
  return (
    <section className="space-y-4" data-testid="event-create-wizard">
      <div className="card p-4">
        <p className="eyebrow">Guided setup</p>
        <ol
          className="mt-3 grid gap-2 sm:grid-cols-5"
          aria-label="Event setup steps"
        >
          {EVENT_WIZARD_STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                className="btn btn-ghost w-full text-left"
                disabled={busy}
                onClick={() => setStep(index)}
              >
                {index + 1}. {label}{" "}
                <span className="text-ink-3">
                  {eventWizardStepState(label, draft)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      {failure ? (
        <p className="banner banner-danger" role="alert">
          {failure}
        </p>
      ) : null}
      {errors.length ? (
        <div className="banner banner-warn" role="alert">
          <p className="font-semibold">Finish this step</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {eventProgress ? (
        <div className="banner banner-warn">
          <p>
            {eventProgress.status === "attempted"
              ? "This event may already be saved — choose Retry to confirm."
              : "This event was saved. Change its client and schedule details on the "}
            {savedEvent ? (
              <Link className="text-link" to={eventDetailPath(savedEvent)}>
                event page
              </Link>
            ) : null}
            {savedEvent ? "." : null}
          </p>
        </div>
      ) : null}
      {busy ? (
        <p className="banner banner-warn">
          Creating event — keep this page open.
        </p>
      ) : null}
      <fieldset disabled={busy} className="contents">
        <div className="card p-4">
          {currentStep === "Client" ? (
            <ClientStep
              draft={draft}
              clients={activeClients}
              update={update}
              locked={!!eventProgress}
            />
          ) : null}
          {currentStep === "Date, venue & headcount" ? (
            <ScheduleStep
              draft={draft}
              venues={activeVenues}
              update={update}
              locked={!!eventProgress}
            />
          ) : null}
          {currentStep === "Dishes" ? (
            <DishStep draft={draft} dishes={activeDishes} update={update} />
          ) : null}
          {currentStep === "Staff" ? (
            <StaffStep draft={draft} people={activePeople} update={update} />
          ) : null}
          {currentStep === "Review" ? (
            <ReviewStep
              draft={draft}
              clients={activeClients}
              venues={activeVenues}
              dishes={activeDishes}
              people={activePeople}
              unlocks={unlocks}
              onCreate={create}
              busy={busy}
              onGoToStep={setStep}
            />
          ) : null}
        </div>
        {currentStep !== "Review" ? (
          <div className="flex flex-wrap justify-between gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={step === 0}
              onClick={() => setStep((current) => current - 1)}
            >
              Back
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={skip}
              >
                Skip for now
              </button>
              <button type="button" className="btn btn-primary" onClick={next}>
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="flex">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(3)}
            >
              Back
            </button>
          </div>
        )}
      </fieldset>
    </section>
  );
}

function ClientStep({
  draft,
  clients,
  update,
  locked,
}: {
  draft: EventWizardDraft;
  clients: readonly any[];
  update: (changes: Partial<EventWizardDraft>) => void;
  locked: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="field-label sm:col-span-2">
        Client
        <SearchSelect
          value={draft.clientId}
          disabled={locked}
          onChange={(id) => update({ clientId: id })}
          recentsKey="client"
          placeholder="Search clients…"
          options={clients.map((client) => ({
            id: client._id,
            label: clientName(client),
          }))}
        />
      </label>
      <label className="field-label">
        Event title
        <input
          className="field-input"
          value={draft.title}
          disabled={locked}
          onChange={(event) => update({ title: event.target.value })}
        />
      </label>
      <label className="field-label">
        Primary contact
        <input
          className="field-input"
          value={draft.primaryContactName}
          disabled={locked}
          onChange={(event) =>
            update({ primaryContactName: event.target.value })
          }
        />
      </label>
      <p className="text-sm text-ink-3 sm:col-span-2">
        Unlocks the governed event plan for this client.
      </p>
    </div>
  );
}
function ScheduleStep({
  draft,
  venues,
  update,
  locked,
}: {
  draft: EventWizardDraft;
  venues: readonly any[];
  update: (changes: Partial<EventWizardDraft>) => void;
  locked: boolean;
}) {
  const field = (
    label: string,
    key: keyof EventWizardDraft,
    type = "text",
    min?: string,
  ) => (
    <label className="field-label">
      {label}
      <input
        className="field-input"
        type={type}
        min={min}
        value={draft[key] as string}
        disabled={locked}
        onChange={(event) => update({ [key]: event.target.value })}
      />
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="field-label">
        Venue
        <select
          className="field-input"
          value={draft.venueId}
          disabled={locked}
          onChange={(event) => update({ venueId: event.target.value })}
        >
          <option value="">Select a venue</option>
          {venues.map((venue) => (
            <option key={venue._id} value={venue._id}>
              {venue.name}
            </option>
          ))}
        </select>
      </label>
      {field("Event type", "eventType")}
      {field("Start", "startsAt", "datetime-local")}
      {field("End", "endsAt", "datetime-local")}
      <div className="sm:col-span-2">
        <DateHoldCollisionNotice dateKey={draft.startsAt.slice(0, 10)} />
      </div>
      {field("Headcount", "expectedHeadcount", "number", "1")}
      {field("Budget", "budgetAmount", "number", "0")}
      {field("Quoted price", "quotedPrice", "number", "0")}
      <p className="text-sm text-ink-3 sm:col-span-2">
        Unlocks logistics, Event Day context, and the date/headcount basis for
        demand planning.
      </p>
    </div>
  );
}
function DishStep({
  draft,
  dishes,
  update,
}: {
  draft: EventWizardDraft;
  dishes: readonly any[];
  update: (changes: Partial<EventWizardDraft>) => void;
}) {
  const add = (id: string) => {
    const dish = dishes.find((item) => item._id === id);
    if (dish)
      update({
        dishes: [
          ...draft.dishes,
          { lineId: lineId(), dishId: id, dishName: dish.name },
        ],
      });
  };
  return (
    <div className="space-y-3">
      <label className="field-label">
        Add a catalog dish
        <SearchSelect
          value=""
          onChange={(id) => add(id)}
          recentsKey="dish"
          placeholder="Search dishes…"
          options={dishes.map((dish) => ({
            id: dish._id,
            label: dish.name,
          }))}
        />
      </label>
      {draft.dishes.length ? (
        <ul className="divide-y divide-line">
          {draft.dishes.map((dish) => (
            <li
              key={dish.lineId}
              className="flex items-center justify-between py-2"
            >
              <span>
                {dish.dishName}{" "}
                {draft.commitProgress.dishes[dish.lineId] ? (
                  <span
                    className={
                      draft.commitProgress.dishes[dish.lineId].status ===
                      "saved"
                        ? "text-success"
                        : "text-warning"
                    }
                  >
                    {draft.commitProgress.dishes[dish.lineId].status === "saved"
                      ? "Saved"
                      : "May already be saved — choose Retry to confirm"}
                  </span>
                ) : null}
              </span>
              {draft.commitProgress.dishes[dish.lineId] ? null : (
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    update({
                      dishes: draft.dishes.filter(
                        (item) => item.lineId !== dish.lineId,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">
          No dishes selected. Choose Skip for now to mark this incomplete.
        </p>
      )}
      <p className="text-sm text-ink-3">
        Selected dishes use the event headcount, unlocking menu demand, prep,
        and allergen checks.
      </p>
    </div>
  );
}
function StaffStep({
  draft,
  people,
  update,
}: {
  draft: EventWizardDraft;
  people: readonly any[];
  update: (changes: Partial<EventWizardDraft>) => void;
}) {
  const [personId, setPersonId] = useState(""),
    [role, setRole] = useState(""),
    [addError, setAddError] = useState("");
  const add = () => {
    const person = people.find((item) => item._id === personId);
    if (!person || !role.trim()) {
      setAddError("Select a person and enter a role before adding staff.");
      return;
    }
    update({
      staff: [
        ...draft.staff,
        {
          lineId: lineId(),
          personId,
          personName: personName(person),
          role: role.trim(),
        },
      ],
    });
    setPersonId("");
    setRole("");
    setAddError("");
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="field-label">
          Person
          <SearchSelect
            value={personId}
            onChange={(id) => setPersonId(id)}
            recentsKey="staff"
            placeholder="Search people…"
            options={people.map((person) => ({
              id: person._id,
              label: personName(person),
            }))}
          />
        </label>
        <label className="field-label">
          Role
          <input
            className="field-input"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary self-end"
          onClick={add}
        >
          Add staff
        </button>
      </div>
      {addError ? (
        <p className="text-sm text-danger" role="alert">
          {addError}
        </p>
      ) : null}
      {draft.staff.length ? (
        <ul className="divide-y divide-line">
          {draft.staff.map((staff) => (
            <li
              key={staff.lineId}
              className="flex items-center justify-between py-2"
            >
              <span>
                {staff.personName} - {staff.role}{" "}
                {draft.commitProgress.staff[staff.lineId] ? (
                  <span
                    className={
                      draft.commitProgress.staff[staff.lineId].status ===
                      "saved"
                        ? "text-success"
                        : "text-warning"
                    }
                  >
                    {draft.commitProgress.staff[staff.lineId].status === "saved"
                      ? "Saved"
                      : "May already be saved — choose Retry to confirm"}
                  </span>
                ) : null}
              </span>
              {draft.commitProgress.staff[staff.lineId] ? null : (
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    update({
                      staff: draft.staff.filter(
                        (item) => item.lineId !== staff.lineId,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">
          No staff assigned. Choose Skip for now to mark this incomplete.
        </p>
      )}
      <p className="text-sm text-ink-3">
        Staff assignments unlock staffing and labor planning.
      </p>
    </div>
  );
}
function ReviewStep({
  draft,
  clients,
  venues,
  dishes,
  people,
  unlocks,
  onCreate,
  busy,
  onGoToStep,
}: {
  draft: EventWizardDraft;
  clients: readonly any[];
  venues: readonly any[];
  dishes: readonly any[];
  people: readonly any[];
  unlocks: ReturnType<typeof eventWizardUnlocks>;
  onCreate: () => void;
  busy: boolean;
  onGoToStep: (step: number) => void;
}) {
  const required = eventWizardCreateErrors(draft),
    client = clients.find((item) => item._id === draft.clientId),
    venue = venues.find((item) => item._id === draft.venueId);
  const localDate = (value: string) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "Incomplete";
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Review</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Ready to create</h2>
        <p className="mt-1 text-sm text-ink-3">
          Review the booking and the downstream work it can unlock.
        </p>
      </div>
      <div className="space-y-3">
        <div>
          <button
            type="button"
            className="text-link"
            onClick={() => onGoToStep(0)}
          >
            Edit client
          </button>
          <p className="text-sm text-ink-2">
            {client ? clientName(client) : "Incomplete"} ·{" "}
            {draft.title || "Incomplete"} ·{" "}
            {draft.primaryContactName || "Incomplete"}
          </p>
        </div>
        <div>
          <button
            type="button"
            className="text-link"
            onClick={() => onGoToStep(1)}
          >
            Edit event
          </button>
          <p className="text-sm text-ink-2">
            {venue?.name ?? "Incomplete"} · {draft.eventType || "Incomplete"} ·{" "}
            {localDate(draft.startsAt)} – {localDate(draft.endsAt)} ·{" "}
            {draft.expectedHeadcount || "Incomplete"} guests ·{" "}
            {formatMoney(Number(draft.budgetAmount))} budget ·{" "}
            {formatMoney(Number(draft.quotedPrice))} quoted
          </p>
        </div>
        <div>
          <button
            type="button"
            className="text-link"
            onClick={() => onGoToStep(2)}
          >
            Edit dishes
          </button>
          <p className="text-sm text-ink-2">
            {draft.dishes.length
              ? draft.dishes
                  .map(
                    (dish) =>
                      dishes.find((item) => item._id === dish.dishId)?.name ??
                      dish.dishName,
                  )
                  .join(", ") + ` (${draft.expectedHeadcount} servings each)`
              : "Incomplete: no dishes"}
          </p>
        </div>
        <div>
          <button
            type="button"
            className="text-link"
            onClick={() => onGoToStep(3)}
          >
            Edit staff
          </button>
          <p className="text-sm text-ink-2">
            {draft.staff.length
              ? draft.staff
                  .map(
                    (staff) =>
                      `${people.find((item) => item._id === staff.personId) ? personName(people.find((item) => item._id === staff.personId)) : staff.personName} — ${staff.role}`,
                  )
                  .join(", ")
              : "Incomplete: no staff"}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {EVENT_WIZARD_STEPS.slice(0, -1).map((item) => (
          <li key={item} className="flex justify-between py-2">
            <span>{item}</span>
            <span
              className={
                eventWizardStepState(item, draft) === "Complete"
                  ? "text-success"
                  : "text-warning"
              }
            >
              {eventWizardStepState(item, draft)}
            </span>
          </li>
        ))}
      </ul>
      <div>
        <p className="font-semibold text-ink">Downstream operations</p>
        <ul className="mt-2 space-y-2">
          {unlocks.map((unlock) => (
            <li key={unlock.automation} className="text-sm text-ink-2">
              {unlock.automation}:{" "}
              {unlock.unlocked ? (
                <span className="text-success">unlocked</span>
              ) : (
                <span className="text-warning">
                  locked - add {unlock.missing.join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {required.length ? (
        <div className="text-sm text-danger">
          <p>Create is blocked:</p>
          <ul className="mt-1 list-disc pl-5">
            {required.map((error) => {
              const step = error.startsWith("Client:")
                ? 0
                : error.startsWith("Date,")
                  ? 1
                  : error.startsWith("Dishes:")
                    ? 2
                    : 3;
              const label = EVENT_WIZARD_STEPS[step];
              return (
                <li key={error}>
                  {error}{" "}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => onGoToStep(step)}
                  >
                    Edit {label.toLowerCase()}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || required.length > 0}
        onClick={onCreate}
      >
        {busy
          ? "Creating event."
          : draft.commitProgress.event
            ? "Retry remaining work"
            : "Create event"}
      </button>
    </div>
  );
}
