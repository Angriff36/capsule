import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatMoney } from "../../lib/format";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { SearchSelect } from "../../ui/SearchSelect";
import {
  InlineReferenceCreateSheet,
  useCanCreateInlineReference,
} from "../../ui/InlineReferenceCreateSheet";
import {
  useListClient,
  useListDish,
  useListMenu,
  useListMenuDish,
  useListPerson,
  useListServiceStyle,
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
  eventWizardStepInputs,
  eventWizardStepState,
  eventWizardUnlocks,
  parseEventWizardDraft,
  validateEventWizardStep,
  type EventWizardDraft,
  type EventWizardStep,
} from "./eventCreateWizardModel";
import { DateHoldCollisionNotice } from "../sales/DateHoldCollisionNotice";

const DRAFT_KEY = "capsule.event-create-wizard.active";
/** An explicitly saved draft survives closing the tab; the active key is per tab. */
const SAVED_DRAFT_KEY = "capsule.event-create-wizard.saved";
const lineId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const newDraftKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function storedDraft(
  storage: Pick<Storage, "getItem" | "removeItem"> = sessionStorage,
  saved: Pick<Storage, "getItem" | "removeItem"> | null = localStorage,
): EventWizardDraft {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (raw === null && saved) {
      const savedRaw = saved.getItem(SAVED_DRAFT_KEY);
      const parsedSaved =
        savedRaw === null ? null : parseEventWizardDraft(JSON.parse(savedRaw));
      if (parsedSaved) return parsedSaved;
      if (savedRaw !== null) saved.removeItem(SAVED_DRAFT_KEY);
    }
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
    [failure, setFailure] = useState(""),
    [savedAt, setSavedAt] = useState<Date | null>(null);
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
  const update = (changes: Partial<EventWizardDraft>) => {
    setSavedAt(null);
    saveDraft({ ...draftRef.current, ...changes });
  };
  const saveAsDraft = () => {
    try {
      localStorage.setItem(SAVED_DRAFT_KEY, JSON.stringify(draftRef.current));
      setSavedAt(new Date());
      setFailure("");
    } catch {
      setFailure(
        "The draft could not be saved in this browser. Keep this tab open to keep your work.",
      );
    }
  };
  const discardDraft = () => {
    try {
      localStorage.removeItem(SAVED_DRAFT_KEY);
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage is optional */
    }
    const fresh = createEventWizardDraft(newDraftKey());
    draftRef.current = fresh;
    setDraft(fresh);
    setSavedAt(null);
    setErrors([]);
    setFailure("");
    setStep(0);
  };
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
          try {
            localStorage.removeItem(SAVED_DRAFT_KEY);
          } catch {
            /* storage is optional */
          }
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
          {currentStep === "Basics" ? (
            <BasicsStep
              draft={draft}
              venues={activeVenues}
              update={update}
              locked={!!eventProgress}
            />
          ) : null}
          {currentStep === "Client & headcount" ? (
            <ClientHeadcountStep
              draft={draft}
              clients={activeClients}
              update={update}
              locked={!!eventProgress}
            />
          ) : null}
          {currentStep === "Menu & dishes" ? (
            <DishStep draft={draft} dishes={activeDishes} update={update} />
          ) : null}
          {currentStep === "Staffing" ? (
            <StaffStep draft={draft} people={activePeople} update={update} />
          ) : null}
          {currentStep !== "Review" ? (
            <StepUnlocks draft={draft} step={currentStep} />
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
            <div className="flex flex-wrap gap-2">
              <DraftControls
                savedAt={savedAt}
                onSave={saveAsDraft}
                onDiscard={discardDraft}
              />
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
          <div className="flex flex-wrap justify-between gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(3)}
            >
              Back
            </button>
            <div className="flex flex-wrap gap-2">
              <DraftControls
                savedAt={savedAt}
                onSave={saveAsDraft}
                onDiscard={discardDraft}
              />
            </div>
          </div>
        )}
      </fieldset>
    </section>
  );
}

function DraftControls({
  savedAt,
  onSave,
  onDiscard,
}: {
  savedAt: Date | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <>
      {savedAt ? (
        <span className="self-center text-sm text-success" role="status">
          Draft saved{" "}
          {new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
            savedAt,
          )}
        </span>
      ) : null}
      <button type="button" className="btn btn-ghost" onClick={onDiscard}>
        Start over
      </button>
      <button type="button" className="btn btn-secondary" onClick={onSave}>
        Save draft
      </button>
    </>
  );
}
function StepUnlocks({
  draft,
  step,
}: {
  draft: EventWizardDraft;
  step: EventWizardStep;
}) {
  const inputs = eventWizardStepInputs(step, draft);
  if (!inputs.length) return null;
  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="step-unlocks">
      <p className="text-sm font-semibold text-ink">What this step unlocks</p>
      <ul className="mt-2 space-y-1">
        {inputs.map((item) => (
          <li key={item.input} className="text-sm text-ink-2">
            <span className={item.filled ? "text-success" : "text-warning"}>
              {item.filled ? "Ready" : "Missing"}
            </span>{" "}
            · <span className="font-medium text-ink">{item.input}</span>:{" "}
            {item.unlocks}
          </li>
        ))}
      </ul>
    </div>
  );
}
function BasicsStep({
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
  const serviceStyles = useListServiceStyle();
  // A venue that is new to the book is made right here, not on another page.
  const canCreateVenue = useCanCreateInlineReference("venue");
  const [newVenueName, setNewVenueName] = useState<string | null>(null);
  const [madeVenue, setMadeVenue] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const venueOptions = [
    ...venues.map((venue) => ({ id: String(venue._id), label: venue.name })),
    ...(madeVenue && !venues.some((venue) => venue._id === madeVenue.id)
      ? [madeVenue]
      : []),
  ];
  const field = (label: string, key: keyof EventWizardDraft, type = "text") => (
    <label className="field-label">
      {label}
      <input
        className="field-input"
        type={type}
        value={draft[key] as string}
        disabled={locked}
        onChange={(event) => update({ [key]: event.target.value })}
      />
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field("Event title", "title")}
      {field("Event type", "eventType")}
      <label className="field-label">
        Start
        <BoundedDateTimeLocalInput
          className="field-input"
          value={draft.startsAt}
          disabled={locked}
          onChange={(event) => update({ startsAt: event.target.value })}
        />
      </label>
      <label className="field-label">
        End
        <BoundedDateTimeLocalInput
          className="field-input"
          value={draft.endsAt}
          naturalDateAnchor={draft.startsAt}
          disabled={locked}
          onChange={(event) => update({ endsAt: event.target.value })}
        />
      </label>
      <div className="sm:col-span-2">
        <DateHoldCollisionNotice dateKey={draft.startsAt.slice(0, 10)} />
      </div>
      <label className="field-label sm:col-span-2">
        Service style
        <select
          className="field-input"
          value={draft.serviceStyleId ?? ""}
          disabled={locked}
          onChange={(event) => update({ serviceStyleId: event.target.value })}
        >
          <option value="">Choose later</option>
          {(serviceStyles ?? [])
            .filter((style) => style.deletedAt == null)
            .map((style) => (
              <option key={style._id} value={style._id}>
                {style.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field-label sm:col-span-2">
        Venue
        <SearchSelect
          value={draft.venueId}
          disabled={locked}
          onChange={(id) => update({ venueId: id })}
          recentsKey="venue"
          placeholder="Search venues…"
          onCreate={canCreateVenue ? setNewVenueName : undefined}
          createLabel={(name) => `Create venue “${name}”`}
          options={venueOptions}
        />
      </label>
      {newVenueName != null ? (
        <InlineReferenceCreateSheet
          kind="venue"
          open
          initialName={newVenueName}
          existingOptions={venueOptions}
          onClose={() => setNewVenueName(null)}
          onUseExisting={(id) => {
            update({ venueId: id });
            setNewVenueName(null);
          }}
          onCreated={(record) => {
            setMadeVenue(record);
            update({ venueId: record.id });
            setNewVenueName(null);
          }}
        />
      ) : null}
    </div>
  );
}
function ClientHeadcountStep({
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
  // A client who is new is made right here, not on another page.
  const canCreateClient = useCanCreateInlineReference("client");
  const [newClientName, setNewClientName] = useState<string | null>(null);
  const [madeClient, setMadeClient] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const clientOptions = [
    ...clients.map((client) => ({
      id: String(client._id),
      label: clientName(client),
      hint: [client.email, client.phone].filter(Boolean).join(" · ") || null,
    })),
    ...(madeClient && !clients.some((client) => client._id === madeClient.id)
      ? [madeClient]
      : []),
  ];
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
      <label className="field-label sm:col-span-2">
        Client
        <SearchSelect
          value={draft.clientId}
          disabled={locked}
          onChange={(id) => {
            const client = clients.find((row) => row._id === id);
            // Start the day-of contact as the client; edit it if it differs.
            update({
              clientId: id,
              ...(!draft.primaryContactName && client
                ? { primaryContactName: clientName(client) }
                : {}),
            });
          }}
          recentsKey="client"
          placeholder="Search clients…"
          onCreate={canCreateClient ? setNewClientName : undefined}
          createLabel={(name) => `Create client “${name}”`}
          options={clientOptions}
        />
      </label>
      {newClientName != null ? (
        <InlineReferenceCreateSheet
          kind="client"
          open
          initialName={newClientName}
          existingOptions={clientOptions}
          onClose={() => setNewClientName(null)}
          onUseExisting={(id) => {
            update({ clientId: id });
            setNewClientName(null);
          }}
          onCreated={(record) => {
            setMadeClient(record);
            update({
              clientId: record.id,
              ...(!draft.primaryContactName
                ? { primaryContactName: record.label }
                : {}),
            });
            setNewClientName(null);
          }}
        />
      ) : null}
      {field("Primary contact", "primaryContactName")}
      {field("Headcount", "expectedHeadcount", "number", "1")}
      {field("Budget", "budgetAmount", "number", "0")}
      {field("Quoted price", "quotedPrice", "number", "0")}
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
  const menus = useListMenu();
  const menuDishes = useListMenuDish();
  const add = (id: string) => {
    const dish = dishes.find((item) => item._id === id);
    // Picking a dish that is already on the list does not add it twice.
    if (dish && !draft.dishes.some((line) => line.dishId === id))
      update({
        dishes: [
          ...draft.dishes,
          { lineId: lineId(), dishId: id, dishName: dish.name },
        ],
      });
  };
  // One pick brings in every dish on a menu, and a per-guest price when the
  // event has no quote yet. Dishes already on the event are not added twice.
  const publishedMenus = (menus ?? []).filter(
    (menu) => menu.deletedAt == null && String(menu.status) === "published",
  );
  const addMenu = (menuId: string) => {
    const menu = publishedMenus.find((item) => item._id === menuId);
    if (!menu) return;
    const have = new Set(draft.dishes.map((line) => line.dishId));
    const added = (menuDishes ?? [])
      .filter(
        (line) =>
          line.menuId === menuId &&
          line.deletedAt == null &&
          line.removedAt == null,
      )
      .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
      .map((line) => dishes.find((dish) => dish._id === line.dishId))
      .filter((dish) => dish != null && !have.has(dish._id))
      .map((dish) => ({
        lineId: lineId(),
        dishId: String(dish._id),
        dishName: String(dish.name),
      }));
    const headcount = Number(draft.expectedHeadcount);
    const perPerson = Number(menu.pricePerPerson ?? 0);
    const quote =
      Number(draft.quotedPrice) > 0 || !(headcount > 0) || !(perPerson > 0)
        ? {}
        : {
            quotedPrice: String(
              Number(menu.basePrice ?? 0) + perPerson * headcount,
            ),
          };
    update({ dishes: [...draft.dishes, ...added], ...quote });
  };
  return (
    <div className="space-y-3">
      {publishedMenus.length ? (
        <label className="field-label">
          Start from a menu
          <SearchSelect
            value=""
            onChange={(id) => addMenu(id)}
            recentsKey="menu"
            placeholder="Search menus…"
            options={publishedMenus.map((menu) => ({
              id: String(menu._id),
              label: String(menu.name),
              hint:
                Number(menu.pricePerPerson ?? 0) > 0
                  ? `${formatMoney(Number(menu.pricePerPerson))} per guest`
                  : null,
            }))}
          />
        </label>
      ) : null}
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
            Edit basics
          </button>
          <p className="text-sm text-ink-2">
            {draft.title || "Incomplete"} · {draft.eventType || "Incomplete"} ·{" "}
            {localDate(draft.startsAt)} – {localDate(draft.endsAt)} ·{" "}
            {venue?.name ?? "Incomplete"}
          </p>
        </div>
        <div>
          <button
            type="button"
            className="text-link"
            onClick={() => onGoToStep(1)}
          >
            Edit client & headcount
          </button>
          <p className="text-sm text-ink-2">
            {client ? clientName(client) : "Incomplete"} ·{" "}
            {draft.primaryContactName || "Incomplete"} ·{" "}
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
              const step = Math.max(
                0,
                EVENT_WIZARD_STEPS.findIndex((label) =>
                  error.startsWith(`${label}:`),
                ),
              );
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
