import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Doc } from "../../lib/api";
import { formatCountNoun } from "../../lib/format";
import { useRouteRecord } from "../../lib/routeRecord";
import {
  useCreateEvent,
  useGetEventTemplate,
  useGetProposal,
  useListClient,
  useListMenu,
  useListOccasion,
  useListPerson,
  useListProposalDishSelection,
  useListProposalEnhancement,
  useListReferralSource,
  useListServiceStyle,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { ArrowLeftIcon, ChevronRightIcon } from "../../ui/icons";
import { DraftRestoreBanner, useFormDraft } from "../../ui/formDraft";
import { FieldError, useFieldValidation } from "../../ui/formValidation";
import { PageHeader, Section, Skeleton } from "../../ui/primitives";
import { useCreateEventFromProposal } from "../clients/useCreateEventFromProposal";
import { CLIENTS_ROUTES } from "../clients/clientsRoutes";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { ProposalEventCarryoverPreview } from "./ProposalEventCarryoverPreview";
import { clientDisplayName } from "./clientName";
import { eventCreateDisabledReason } from "./eventCreateGuards";
import { useEnsureBuiltInServiceStyle } from "../../lib/eventCreateCatalogClient";
import { EventCreateServiceStyleField } from "./EventCreateServiceStyleField";
import { EventCreateStandardList } from "./EventCreateStandardList";
import { SERVICE_STYLE_CATALOG } from "./serviceStyleCatalog";
import { EventCreateServiceStyleResolver } from "./EventCreateServiceStyleResolver";
import { eventPlanEngagementFormMapper } from "./EventPlanEngagementFormMapper";
import { FailureBanner } from "./FailureBanner";
import {
  eventCreatePath,
  eventDetailPath,
  eventImportPath,
  eventsIndexPath,
} from "./eventRoutes";
import { proposalEventPrefill } from "./ProposalEventPrefill";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { addLocalDateTimeHours } from "../../ui/naturalDate";
import { SearchSelect } from "../../ui/SearchSelect";
import {
  InlineReferenceCreateSheet,
  useCanCreateInlineReference,
} from "../../ui/InlineReferenceCreateSheet";
import { venueSummary } from "./venuePickerSummary";
import { EventCreateWizard } from "./EventCreateWizard";
import { DateHoldCollisionNotice } from "../sales/DateHoldCollisionNotice";

// People who can be named as an event's salesperson/owner (Event.assignedToId).
const SALES_PERSON_ROLES = new Set(["sales_staff", "sales_manager", "owner"]);

const EVENT_DEFAULT_HOURS = 4;

function eventFieldRules(data: FormData): Record<string, string> {
  const start = String(data.get("startsAt") ?? "");
  const end = String(data.get("endsAt") ?? "");
  if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    return { endsAt: "This event's end time has to be after its start time." };
  }
  return {};
}

/** Proposal, client and template bookings retain their established long-form carryover. */
export function guidedEventCreateAvailable(params: {
  clientId: string;
  templateId: string;
  proposalId: string;
}): boolean {
  return !params.clientId && !params.templateId && !params.proposalId;
}

// Collapsible form block (native <details>) styled like Section. Uncontrolled:
// the `open` prop only sets the initial state, so user toggles and the
// imperative reveal-on-invalid below never fight React.
function FormSection({
  title,
  hint,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="card group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 select-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase">
            {title}
            <span className="ml-1.5 font-mono text-ink-3 normal-case">
              {count}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-ink-3">{hint}</span>
        </span>
        <ChevronRightIcon
          width={12}
          height={12}
          className="shrink-0 text-ink-3 transition-transform group-open:rotate-90"
        />
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}

// A field with a validation error must never stay hidden inside a collapsed
// section: open every <details> that contains an invalid field before the
// validation handler scrolls/focuses it. Synchronous DOM writes so the
// subsequent scrollIntoView/focus in useFieldValidation land on visible fields.
function revealInvalidSections(form: HTMLFormElement) {
  const crossFieldNames = new Set(
    Object.keys(eventFieldRules(new FormData(form))),
  );
  for (const el of Array.from(form.elements)) {
    if (
      !(
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) ||
      !el.name
    ) {
      continue;
    }
    const invalid =
      (el.willValidate && !el.checkValidity()) || crossFieldNames.has(el.name);
    if (invalid) el.closest("details")?.setAttribute("open", "");
  }
}

export function EventCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [creationMode, setCreationMode] = useState<"form" | "guided">(() => {
    try {
      return localStorage.getItem("capsule.event-create.mode") === "guided"
        ? "guided"
        : "form";
    } catch {
      return "form";
    }
  });
  const [wizardBusy, setWizardBusy] = useState(false);
  const prefillClientId = searchParams.get("clientId")?.trim() || "";
  const templateId = searchParams.get("templateId")?.trim() || "";
  // Accepted proposal to book (issue #141): pre-fills the form; when the
  // proposal is still unlinked, submit goes through the proposal-booking seam
  // so the new event is linked and the accepted menu copies onto it.
  const proposalId = searchParams.get("proposalId")?.trim() || "";
  const guidedAvailable = guidedEventCreateAvailable({
    clientId: prefillClientId,
    templateId,
    proposalId,
  });
  const proposal = useGetProposal(proposalId || "skip");
  const proposalDishSelections = useListProposalDishSelection();
  const proposalEnhancements = useListProposalEnhancement();
  const createEventFromProposal = useCreateEventFromProposal();
  const template = useRouteRecord(useGetEventTemplate, templateId || undefined);
  const menus = useListMenu();
  const templateMenuName = (menus ?? []).find(
    (menu) => menu._id === template?.menuId,
  )?.name;
  const clients = useListClient();
  const venues = useListVenue();
  const occasions = useListOccasion();
  const serviceStyles = useListServiceStyle();
  const people = useListPerson();
  const referralSources = useListReferralSource();
  const createEvent = useCreateEvent();
  const canCreateClient = useCanCreateInlineReference("client");
  const canCreateVenue = useCanCreateInlineReference("venue");
  const ensureBuiltInServiceStyle = useEnsureBuiltInServiceStyle();
  const [clientId, setClientId] = useState(prefillClientId);
  const [venueId, setVenueId] = useState("");
  const [inlineCreate, setInlineCreate] = useState<{
    kind: "client" | "venue";
    name: string;
  } | null>(null);
  const [temporaryClient, setTemporaryClient] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [temporaryVenue, setTemporaryVenue] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [busy, setBusy] = useState<"event" | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [occasionId, setOccasionId] = useState("");
  const [serviceStyleId, setServiceStyleId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [referralSourceId, setReferralSourceId] = useState("");
  const { errors, touched, formProps, handleSubmit } =
    useFieldValidation(eventFieldRules);
  const draftForm = useFormDraft("event-create");
  const proposalPrefill = proposalEventPrefill.values(proposal);
  const [startsAtValue, setStartsAtValue] = useState(
    proposalPrefill.startsAtLocal,
  );
  const [endsAtValue, setEndsAtValue] = useState(proposalPrefill.endsAtLocal);
  const [endWasEdited, setEndWasEdited] = useState(
    Boolean(proposalPrefill.endsAtLocal),
  );
  useEffect(() => {
    if (!startsAtValue && proposalPrefill.startsAtLocal) {
      setStartsAtValue(proposalPrefill.startsAtLocal);
    }
    if (!endsAtValue && proposalPrefill.endsAtLocal) {
      setEndsAtValue(proposalPrefill.endsAtLocal);
      setEndWasEdited(true);
    }
  }, [proposalPrefill.endsAtLocal, proposalPrefill.startsAtLocal]);
  const proposalLinkable = proposalEventPrefill.canLinkOnCreate(proposal);
  const proposalMenuCount = proposalId
    ? (proposalDishSelections ?? []).filter(
        (selection) =>
          selection.proposalId === proposalId && selection.deletedAt == null,
      ).length
    : 0;
  // Live enhancements (withdraw sets removedAt + deletedAt) — the rows the
  // event overview card will list once this event exists (C3).
  const proposalEnhancementCount = proposalId
    ? (proposalEnhancements ?? []).filter(
        (row) =>
          row.proposalId === proposalId &&
          row.deletedAt == null &&
          row.removedAt == null,
      ).length
    : 0;
  // Proposal deep links may arrive without ?clientId= — seed it once loaded.
  useEffect(() => {
    if (proposal?.clientId) {
      setClientId((current) => current || String(proposal.clientId));
    }
  }, [proposal?._id]);

  const activeClients = (clients ?? []).filter(
    (client) =>
      client.deletedAt == null &&
      client.status === "active" &&
      client.registeredAt != null,
  );
  const activeVenues = (venues ?? []).filter(
    (venue) =>
      venue.deletedAt == null &&
      venue.status === "active" &&
      venue.registeredAt != null,
  );
  const clientOptions = [
    ...activeClients.map((client) => ({
      id: client._id,
      label: clientDisplayName(client._id, activeClients),
      hint: [client.email, client.phone].filter(Boolean).join(" · ") || null,
    })),
    ...(temporaryClient &&
    !activeClients.some((client) => client._id === temporaryClient.id)
      ? [{ id: temporaryClient.id, label: temporaryClient.label }]
      : []),
  ];
  const venueOptions = [
    ...activeVenues.map((venue) => ({
      id: venue._id,
      label: venue.name,
      hint: venueSummary(venue),
    })),
    ...(temporaryVenue &&
    !activeVenues.some((venue) => venue._id === temporaryVenue.id)
      ? [{ id: temporaryVenue.id, label: temporaryVenue.label }]
      : []),
  ];
  const activeOccasions = (occasions ?? [])
    .filter((occasion) => occasion.status === "active")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  // Empty catalogs (B2): once the lists have loaded, an empty occasion list
  // gets a one-line fix-it hint under the select instead of a silent blank.
  const occasionsEmpty =
    occasions !== undefined && activeOccasions.length === 0;
  const salespeople = (people ?? [])
    .filter(
      (person) =>
        person.deletedAt == null &&
        person.status === "active" &&
        SALES_PERSON_ROLES.has(person.role),
    )
    .sort((a, b) =>
      `${a.givenName} ${a.familyName}`.localeCompare(
        `${b.givenName} ${b.familyName}`,
      ),
    );
  const activeReferralSources = (referralSources ?? [])
    .filter((source) => source.status === "active")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const selectedVenue = activeVenues.find((venue) => venue._id === venueId);
  // The proposal stores only a venue NAME; auto-select the matching saved
  // venue once venues load (once per proposal — the operator can change it).
  const [venueAutoFilledFor, setVenueAutoFilledFor] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (!proposal || venues === undefined) return;
    if (venueAutoFilledFor === proposal._id) return;
    setVenueAutoFilledFor(proposal._id);
    const match = proposalEventPrefill.matchVenue(proposal, activeVenues);
    if (match) setVenueId((current) => current || match._id);
  }, [proposal, venues]);
  // Issue #393: a proposal venue NAME can match several saved venues — the
  // form must say so instead of implying the proposal named exactly one.
  const proposalVenueMatches =
    proposal != null && proposalLinkable && proposal.venueName
      ? proposalEventPrefill.venueMatches(proposal, activeVenues)
      : [];

  const run = async (kind: "event", work: () => Promise<void>) => {
    setFailure(null);
    setBusy(kind);
    try {
      await work();
    } catch (error) {
      // Full Convex payload helps when the UI only shows "Server Error".
      console.error(`[event-create:${kind}]`, error);
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  // Restore puts text back into named fields; the relation pickers are React
  // state, so re-seed them from the same saved values (client, venue, occasion,
  // service style, salesperson, referral source were lost before — #368 item 4).
  const restoreDraft = () => {
    const saved = draftForm.restore();
    if (!saved) return;
    const pick = (key: string) => saved.values[key]?.trim() ?? "";
    if (pick("startsAt")) setStartsAtValue(pick("startsAt"));
    if (pick("endsAt")) {
      setEndsAtValue(pick("endsAt"));
      setEndWasEdited(true);
    }
    if (pick("clientId")) setClientId(pick("clientId"));
    if (pick("venueId")) setVenueId(pick("venueId"));
    if (pick("occasionId")) setOccasionId(pick("occasionId"));
    if (pick("serviceStyleId")) setServiceStyleId(pick("serviceStyleId"));
    if (pick("salespersonId")) setSalespersonId(pick("salespersonId"));
    if (pick("referralSourceId")) setReferralSourceId(pick("referralSourceId"));
  };

  const submitEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const venue = activeVenues.find((item) => item._id === venueId);
    // The selected style row (or built-in catalog name) goes onto the event as
    // the serviceStyleName snapshot, so a later catalog rename cannot rewrite
    // the booked style (same as venueName).
    const resolveServiceStyle = async () => {
      const id = await new EventCreateServiceStyleResolver(
        ensureBuiltInServiceStyle,
      ).resolve(serviceStyleId, serviceStyles);
      const name =
        (serviceStyles ?? []).find((style) => style._id === id)?.name ??
        SERVICE_STYLE_CATALOG.find((row) => row.code === serviceStyleId.trim())
          ?.name;
      return { id, name: name?.trim() || undefined };
    };
    const buildArgs = async () => {
      const serviceStyle = await resolveServiceStyle();
      // The selected occasion row goes onto the event as the occasionName
      // snapshot, so a later catalog rename cannot rewrite the booked occasion
      // (same as serviceStyleName).
      const occasion = activeOccasions.find((row) => row._id === occasionId);
      // The selected client row goes onto the event as the clientName
      // snapshot, so a later catalog edit cannot rewrite the booked client.
      const selectedClient = activeClients.find((row) => row._id === clientId);
      // The selected salesperson row goes onto the event as the ownerName
      // snapshot, so a later catalog rename cannot rewrite the booked owner
      // (same as occasionName).
      const selectedSalesperson = salespeople.find(
        (person) => person._id === salespersonId,
      );
      return eventPlanEngagementFormMapper.toCommandArgs({
        clientId,
        client: selectedClient
          ? { name: clientDisplayName(selectedClient._id, [selectedClient]) }
          : undefined,
        venueId,
        venue,
        title: String(data.get("title") ?? ""),
        eventTypeRaw: String(data.get("eventType") ?? ""),
        occasionId,
        occasion: occasion ? { name: occasion.name } : undefined,
        serviceStyleId: serviceStyle.id,
        serviceStyle: serviceStyle.name
          ? { name: serviceStyle.name }
          : undefined,
        salespersonId,
        salesperson: selectedSalesperson
          ? {
              name: [
                selectedSalesperson.givenName,
                selectedSalesperson.familyName,
              ]
                .filter(Boolean)
                .join(" "),
            }
          : undefined,
        referralSourceId,
        startsAtRaw: String(data.get("startsAt") ?? ""),
        endsAtRaw: String(data.get("endsAt") ?? ""),
        expectedHeadcountRaw: data.get("expectedHeadcount"),
        primaryContactName: String(data.get("primaryContactName") ?? ""),
        primaryContactEmail: String(data.get("primaryContactEmail") ?? ""),
        primaryContactPhone: String(data.get("primaryContactPhone") ?? ""),
        budgetAmountRaw: data.get("budgetAmount"),
        quotedPriceRaw: data.get("quotedPrice"),
        accessibilityNeedsRaw: String(data.get("accessibilityNeeds") ?? ""),
        serviceRequirements: String(data.get("serviceRequirements") ?? ""),
        operationalRequirements: String(
          data.get("operationalRequirements") ?? "",
        ),
      });
    };
    // A proposalId in the route NEVER falls through to generic unlinked
    // creation (issue #392): the canonical seam books an accepted, unlinked
    // proposal and returns the existing event when another booking won the
    // race (spec §7.1). Every other proposal state — loading, deleted,
    // not accepted, already linked — is read-only here: no generic write.
    if (proposalId) {
      if (!proposal) return;
      if (!proposalLinkable) {
        // A stale soft-deleted record is unavailable like a missing one — no
        // write and no exit into an event.
        if (proposal.deletedAt == null && proposal.eventId != null)
          navigate(eventDetailPath(String(proposal.eventId)));
        return;
      }
      void run("event", async () => {
        const created = await createEventFromProposal({
          proposalId: proposal._id,
          proposalVersion: proposal.version,
          event: await buildArgs(),
        });
        draftForm.clear();
        navigate(eventDetailPath(created.docId));
      });
      return;
    }
    // Standalone creation (no proposal in the route): the plain generated
    // create command, unchanged.
    void run("event", async () => {
      const created = await createEvent(await buildArgs());
      draftForm.clear();
      navigate(eventDetailPath(created.docId));
    });
  };

  const clientRequiredCopy = eventCreateDisabledReason({
    busy: busy !== null,
    clientId,
  });

  const switchCreationMode = (mode: "form" | "guided") => {
    setCreationMode(mode);
    try {
      localStorage.setItem("capsule.event-create.mode", mode);
    } catch {
      // The choice remains active for this page in private browsing.
    }
  };

  if (creationMode === "guided" && guidedAvailable) {
    return (
      <div className="space-y-4">
        <Link
          to={eventsIndexPath()}
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"
        >
          <ArrowLeftIcon width={12} height={12} /> All events
        </Link>
        <PageHeader
          title="New event"
          lead="Build a booking step by step, then create it once you have reviewed the operational consequences."
          actions={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={wizardBusy}
              onClick={() => switchCreationMode("form")}
            >
              Use long form
            </button>
          }
        />
        <EventCreateWizard onBusyChange={setWizardBusy} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to={eventsIndexPath()}
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"
      >
        <ArrowLeftIcon width={12} height={12} /> All events
      </Link>
      <PageHeader
        title="New event"
        lead="The essentials for a new booking — who it's for, where, when, and the budget."
        actions={
          <div className="flex flex-wrap gap-2">
            {guidedAvailable ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => switchCreationMode("guided")}
              >
                Use guided setup
              </button>
            ) : null}
            <Link to={eventImportPath()} className="btn btn-secondary btn-sm">
              Have a BEO? Import it instead
            </Link>
          </div>
        }
      />

      {!guidedAvailable ? (
        <p className="banner banner-warn">
          Guided setup isn't available when booking from a proposal or template.
        </p>
      ) : null}

      {failure ? <FailureBanner failure={failure} /> : null}

      <DraftRestoreBanner
        draft={draftForm.draft}
        onRestore={restoreDraft}
        onDiscard={draftForm.discard}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
        <form
          key={`${template?._id ?? "blank"}:${proposal?._id ?? "blank"}`}
          id="event-create-form"
          ref={draftForm.formRef}
          onSubmit={(event) => {
            revealInvalidSections(event.currentTarget);
            handleSubmit(submitEvent)(event);
          }}
          className="space-y-3"
          {...formProps}
        >
          <FormSection
            title="Basics"
            hint="Title, type, schedule, headcount, and the day-of contact."
            count={9}
            defaultOpen
          >
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <label className="field-label sm:col-span-2">
                Event title *
                <input
                  name="title"
                  className="input"
                  defaultValue={proposalPrefill.title}
                  required
                  autoFocus
                />
                <FieldError name="title" errors={errors} touched={touched} />
              </label>
              <label className="field-label sm:col-span-2">
                Event type *
                <input
                  name="eventType"
                  className="input"
                  placeholder="Wedding, corporate lunch, holiday dinner…"
                  defaultValue={
                    proposalPrefill.eventType ??
                    template?.eventType ??
                    undefined
                  }
                  required
                />
                <FieldError
                  name="eventType"
                  errors={errors}
                  touched={touched}
                />
              </label>
              <div>
                <label className="field-label">
                  Occasion
                  <select
                    name="occasionId"
                    value={occasionId}
                    onChange={(event) => setOccasionId(event.target.value)}
                    className="input"
                    form="event-create-form"
                  >
                    <option value="">Select an occasion</option>
                    {activeOccasions.map((occasion) => (
                      <option key={occasion._id} value={occasion._id}>
                        {occasion.name}
                      </option>
                    ))}
                  </select>
                </label>
                {occasionsEmpty ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-3">
                    No occasions yet — open{" "}
                    <Link
                      to="/admin/catalogs"
                      target="_blank"
                      rel="noopener"
                      className="underline font-medium"
                    >
                      Admin → Catalogs
                    </Link>{" "}
                    and click “Add the standard list” (Wedding, Corporate Event,
                    …). Opens in a new tab; this form stays put and the list
                    fills in here right away.
                  </p>
                ) : null}
                {occasionsEmpty ? (
                  <EventCreateStandardList
                    singular="occasion"
                    existing={occasions}
                  />
                ) : null}
              </div>
              <label className="field-label">
                Expected headcount *
                <input
                  name="expectedHeadcount"
                  type="number"
                  min={1}
                  max={100000}
                  defaultValue={
                    proposalPrefill.expectedHeadcount ??
                    template?.defaultHeadcount ??
                    1
                  }
                  className="input"
                  required
                />
                <FieldError
                  name="expectedHeadcount"
                  errors={errors}
                  touched={touched}
                />
              </label>
              <label className="field-label">
                Starts *
                <BoundedDateTimeLocalInput
                  name="startsAt"
                  value={startsAtValue}
                  className="input"
                  required
                  onResolvedValue={(next) => {
                    setStartsAtValue(next);
                    if (!endsAtValue || !endWasEdited) {
                      setEndsAtValue(
                        addLocalDateTimeHours(next, EVENT_DEFAULT_HOURS),
                      );
                    }
                  }}
                />
                <FieldError name="startsAt" errors={errors} touched={touched} />
              </label>
              <div className="sm:col-span-2">
                <DateHoldCollisionNotice
                  dateKey={(startsAtValue ?? "").slice(0, 10)}
                />
              </div>
              <label className="field-label">
                Ends *
                <BoundedDateTimeLocalInput
                  name="endsAt"
                  value={endsAtValue}
                  className="input"
                  required
                  naturalDateAnchor={startsAtValue}
                  onResolvedValue={(next) => {
                    setEndsAtValue(next);
                    setEndWasEdited(true);
                  }}
                />
                <FieldError name="endsAt" errors={errors} touched={touched} />
              </label>
              <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
                <p className="text-xs font-medium tracking-[0.08em] text-ink-3 uppercase sm:col-span-3">
                  Primary contact
                </p>
                <label className="field-label">
                  Name *
                  <input name="primaryContactName" className="input" required />
                  <FieldError
                    name="primaryContactName"
                    errors={errors}
                    touched={touched}
                  />
                </label>
                <label className="field-label">
                  Email
                  <input
                    name="primaryContactEmail"
                    type="email"
                    className="input"
                  />
                  <FieldError
                    name="primaryContactEmail"
                    errors={errors}
                    touched={touched}
                  />
                </label>
                <label className="field-label">
                  Phone
                  <input
                    name="primaryContactPhone"
                    type="tel"
                    className="input"
                  />
                </label>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Venue & logistics"
            hint="Service style and on-site requirements — pick the venue in the side panel."
            count={4}
          >
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <EventCreateServiceStyleField
                value={serviceStyleId}
                onChange={setServiceStyleId}
                rows={serviceStyles}
                form="event-create-form"
              />
              <label className="field-label sm:col-span-2">
                Accessibility needs
                <input
                  name="accessibilityNeeds"
                  className="input"
                  placeholder="Comma-separated"
                />
              </label>
              <label className="field-label">
                Service requirements
                <textarea
                  name="serviceRequirements"
                  className="input min-h-24 py-2"
                />
              </label>
              <label className="field-label">
                Operational requirements
                <textarea
                  name="operationalRequirements"
                  className="input min-h-24 py-2"
                />
              </label>
            </div>
          </FormSection>

          <FormSection
            title="Money"
            hint="Budget and quoted price for this event."
            count={2}
          >
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <label className="field-label">
                Budget amount *
                <input
                  name="budgetAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={0}
                  className="input"
                  required
                />
                <FieldError
                  name="budgetAmount"
                  errors={errors}
                  touched={touched}
                />
              </label>
              <label className="field-label">
                Quoted price *
                <input
                  name="quotedPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={proposalPrefill.quotedPrice ?? 0}
                  className="input"
                  required
                />
                <FieldError
                  name="quotedPrice"
                  errors={errors}
                  touched={touched}
                />
              </label>
            </div>
          </FormSection>

          <FormSection
            title="Details"
            hint="Who sold it and how the client found us."
            count={2}
          >
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <label className="field-label">
                Salesperson
                <SearchSelect
                  name="salespersonId"
                  value={salespersonId}
                  onChange={(id) => setSalespersonId(id)}
                  form="event-create-form"
                  recentsKey="staff"
                  placeholder="Search salespeople…"
                  options={salespeople.map((person) => ({
                    id: person._id,
                    label: [person.givenName, person.familyName]
                      .filter(Boolean)
                      .join(" "),
                  }))}
                />
                {people !== undefined && salespeople.length === 0 ? (
                  <span
                    className="field-hint"
                    data-testid="salesperson-empty-hint"
                  >
                    Nobody has a sales role yet. This list shows people whose
                    role is Sales staff, Sales manager or Owner — set that in{" "}
                    <Link
                      to="/admin"
                      target="_blank"
                      rel="noopener"
                      className="underline font-medium"
                    >
                      Admin → Team roles
                    </Link>{" "}
                    (new tab; this form stays put).
                  </span>
                ) : null}
              </label>
              <label className="field-label">
                Referral source
                <select
                  name="referralSourceId"
                  value={referralSourceId}
                  onChange={(event) => setReferralSourceId(event.target.value)}
                  className="input"
                  form="event-create-form"
                >
                  <option value="">Select a referral source</option>
                  {activeReferralSources.map((source) => (
                    <option key={source._id} value={source._id}>
                      {source.name}
                    </option>
                  ))}
                </select>
                {referralSources !== undefined &&
                activeReferralSources.length === 0 ? (
                  <span
                    className="field-hint"
                    data-testid="referral-empty-hint"
                  >
                    No referral sources yet. You can leave this blank, or add
                    them in{" "}
                    <Link
                      to="/admin/catalogs"
                      target="_blank"
                      rel="noopener"
                      className="underline font-medium"
                    >
                      Admin → Catalogs
                    </Link>{" "}
                    (new tab; this form stays put and the list fills in here).
                  </span>
                ) : null}
              </label>
              {referralSources !== undefined &&
              activeReferralSources.length === 0 ? (
                <EventCreateStandardList
                  singular="referral source"
                  existing={referralSources}
                />
              ) : null}
            </div>
          </FormSection>
        </form>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {proposalId ? (
            <Section title="Proposal">
              {proposal === undefined ? (
                <div className="p-3">
                  <Skeleton className="h-8" />
                </div>
              ) : proposal === null || proposal.deletedAt != null ? (
                <div className="space-y-2 p-3 text-sm text-ink-3">
                  <p role="status">This proposal no longer exists.</p>
                  <Link
                    to={eventCreatePath()}
                    className="btn btn-secondary btn-sm"
                  >
                    Start a standalone event
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5 p-3 text-sm text-ink-2">
                  <ProposalEventCarryoverPreview
                    preview={proposalEventPrefill.carryoverPreview({
                      proposal,
                      menuCount: proposalMenuCount,
                      enhancementCount: proposalEnhancementCount,
                    })}
                  />
                  {!proposalLinkable && proposal.eventId != null ? (
                    <div className="pt-1">
                      <Link
                        to={eventDetailPath(String(proposal.eventId))}
                        className="btn btn-primary min-h-[40px]"
                      >
                        Open event
                      </Link>
                    </div>
                  ) : !proposalLinkable ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link
                        to={CLIENTS_ROUTES.proposal(proposal._id)}
                        className="btn btn-secondary btn-sm"
                      >
                        Open proposal
                      </Link>
                      <Link
                        to={eventCreatePath()}
                        className="btn btn-ghost btn-sm"
                      >
                        Start a standalone event
                      </Link>
                    </div>
                  ) : null}
                  {proposalLinkable &&
                  proposal.venueName &&
                  venues !== undefined &&
                  !venueId ? (
                    proposalVenueMatches.length > 1 ? (
                      <p className="text-xs leading-relaxed text-ink-3">
                        {proposalVenueMatches.length} saved venues match “
                        {proposal.venueName}” — pick the right one in the Venue
                        panel.
                      </p>
                    ) : (
                      <p className="text-xs leading-relaxed text-ink-3">
                        No saved venue matched “{proposal.venueName}” — pick or
                        create it in the Venue panel.
                      </p>
                    )
                  ) : null}
                </div>
              )}
            </Section>
          ) : null}
          {templateId ? (
            <Section title="Template">
              {template === undefined ? (
                <div className="p-3">
                  <Skeleton className="h-8" />
                </div>
              ) : template === null ? (
                <p className="p-3 text-sm text-ink-3">
                  This template no longer exists.
                </p>
              ) : (
                <div className="space-y-1.5 p-3 text-sm text-ink-2">
                  <p className="font-medium text-ink">{template.name}</p>
                  <p>
                    {String(template.clientType)} client ·{" "}
                    {formatCountNoun(template.defaultHeadcount, "guest")}
                  </p>
                  {templateMenuName ? <p>Menu: {templateMenuName}</p> : null}
                  {template.defaultStaffRoles?.length ? (
                    <p>Staff: {template.defaultStaffRoles.join(", ")}</p>
                  ) : null}
                  {template.typicalEquipment?.length ? (
                    <p>Equipment: {template.typicalEquipment.join(", ")}</p>
                  ) : null}
                  {template.notes ? (
                    <p className="text-ink-3">{template.notes}</p>
                  ) : null}
                  <p className="pt-1 text-xs leading-relaxed text-ink-3">
                    Headcount is pre-filled from this template. Adjust anything
                    before creating.
                  </p>
                </div>
              )}
            </Section>
          ) : null}
          <Section title="Client">
            <div className="space-y-3 p-3">
              {clients === undefined ? (
                <Skeleton className="h-8" />
              ) : (
                <>
                  <label className="field-label">
                    Account *
                    <SearchSelect
                      name="clientId"
                      form="event-create-form"
                      value={clientId}
                      onChange={setClientId}
                      required
                      placeholder={`Search ${activeClients.length} clients by name or email…`}
                      emptyText={
                        canCreateClient
                          ? "No client matches - create one below."
                          : "No client matches."
                      }
                      onCreate={
                        canCreateClient
                          ? (name) => setInlineCreate({ kind: "client", name })
                          : undefined
                      }
                      createLabel={(name) => `Create client “${name}”`}
                      testId="event-create-client"
                      recentsKey="client"
                      options={clientOptions}
                    />
                  </label>
                  {activeClients.length === 0 ? (
                    <p className="text-sm text-ink-3">
                      No active client accounts are available.
                    </p>
                  ) : null}
                  {!clientId ? (
                    <p className="text-sm text-ink-3" role="status">
                      Pick a client for this event.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </Section>

          <Section title="Venue">
            <div className="space-y-3 p-3">
              {venues === undefined ? (
                <Skeleton className="h-8" />
              ) : (
                <>
                  <label className="field-label">
                    Place *
                    <SearchSelect
                      name="venueId"
                      form="event-create-form"
                      value={venueId}
                      onChange={setVenueId}
                      required
                      placeholder={`Search ${activeVenues.length} venues by name or address…`}
                      emptyText={
                        canCreateVenue
                          ? "No venue matches - create one below."
                          : "No venue matches."
                      }
                      onCreate={
                        canCreateVenue
                          ? (name) => setInlineCreate({ kind: "venue", name })
                          : undefined
                      }
                      createLabel={(name) => `Create venue “${name}”`}
                      testId="event-create-venue"
                      options={venueOptions}
                    />
                  </label>
                  {selectedVenue &&
                  Number(selectedVenue.capacity ?? 0) === 0 ? (
                    <p className="text-xs leading-relaxed text-ink-3">
                      This venue has no capacity on file — set it in Facilities
                      → Venues if it matters for this booking.
                    </p>
                  ) : null}
                  {activeVenues.length === 0 ? (
                    <p className="text-sm text-ink-3">
                      No active venues are available.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </Section>
          {inlineCreate ? (
            <InlineReferenceCreateSheet
              kind={inlineCreate.kind}
              open
              initialName={inlineCreate.name}
              existingOptions={
                inlineCreate.kind === "client"
                  ? [
                      ...activeClients.map((client) => ({
                        id: client._id,
                        label: clientDisplayName(client._id, activeClients),
                        email: client.email,
                      })),
                      ...(temporaryClient &&
                      !activeClients.some(
                        (client) => client._id === temporaryClient.id,
                      )
                        ? [temporaryClient]
                        : []),
                    ]
                  : [
                      ...activeVenues.map((venue) => ({
                        id: venue._id,
                        label: venue.name,
                      })),
                      ...(temporaryVenue &&
                      !activeVenues.some(
                        (venue) => venue._id === temporaryVenue.id,
                      )
                        ? [temporaryVenue]
                        : []),
                    ]
              }
              onClose={() => setInlineCreate(null)}
              onUseExisting={(id) => {
                if (inlineCreate.kind === "client") setClientId(id);
                else setVenueId(id);
                setInlineCreate(null);
              }}
              onCreated={(record) => {
                if (inlineCreate.kind === "client") {
                  setTemporaryClient(record);
                  setClientId(record.id);
                } else {
                  setTemporaryVenue(record);
                  setVenueId(record.id);
                }
                setInlineCreate(null);
              }}
            />
          ) : null}

          {proposalId && proposal === undefined ? (
            <p className="text-sm text-ink-3" role="status">
              Loading proposal…
            </p>
          ) : !proposalId || proposalLinkable ? (
            <>
              <button
                type="submit"
                form="event-create-form"
                disabled={busy !== null || !clientId || !venueId}
                className="btn btn-primary w-full"
              >
                {busy === "event" ? "Creating event…" : "Create event"}
              </button>
              {clientRequiredCopy ? (
                <p className="text-sm text-ink-3" role="status">
                  {clientRequiredCopy}
                </p>
              ) : null}
            </>
          ) : null}
          <p className="text-xs leading-relaxed text-ink-3">
            If something can't be created, the reason appears above. Fix it and
            try again.
          </p>
        </aside>
      </div>
    </div>
  );
}
