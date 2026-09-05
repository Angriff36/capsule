import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Doc } from "../../lib/api";
import { formatCountNoun } from "../../lib/format";
import { useRouteRecord } from "../../lib/routeRecord";
import {
  useCreateClient,
  useCreateEvent,
  useCreateVenue,
  useGetEventTemplate,
  useGetProposal,
  useListClient,
  useListMenu,
  useListOccasion,
  useListPerson,
  useListProposalDishSelection,
  useListReferralSource,
  useListServiceStyle,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { ArrowLeftIcon, ChevronRightIcon } from "../../ui/icons";
import { DraftRestoreBanner, useFormDraft } from "../../ui/formDraft";
import { FieldError, useFieldValidation } from "../../ui/formValidation";
import { PageHeader, Section, Skeleton } from "../../ui/primitives";
import { useCreateEventFromProposal } from "../clients/useCreateEventFromProposal";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { cleanCommandArgs } from "./CleanCommandArgs";
import { clientDisplayName } from "./clientName";
import { eventCreateDisabledReason } from "./eventCreateGuards";
import {
  persistableServiceStyleId,
  serviceStyleSelectOptions,
  usingBuiltInServiceStyles,
} from "./serviceStyleCatalog";
import { eventPlanEngagementFormMapper } from "./EventPlanEngagementFormMapper";
import { FailureBanner } from "./FailureBanner";
import { eventDetailPath, eventsIndexPath } from "./eventRoutes";
import { proposalEventPrefill } from "./ProposalEventPrefill";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";

const VENUE_TYPES = [
  ["client_site", "Client site"],
  ["banquet_hall", "Banquet hall"],
  ["outdoor", "Outdoor"],
  ["office", "Office"],
  ["private_home", "Private home"],
  ["other", "Other"],
] as const;

// People who can be named as an event's salesperson/owner (Event.assignedToId).
const SALES_PERSON_ROLES = new Set(["sales_staff", "sales_manager", "owner"]);

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function eventFieldRules(data: FormData): Record<string, string> {
  const start = String(data.get("startsAt") ?? "");
  const end = String(data.get("endsAt") ?? "");
  if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    return { endsAt: "End must be after the start time." };
  }
  return {};
}

function venueAddress(venue: Doc<"venues"> | undefined): string | undefined {
  if (!venue) return undefined;
  return (
    [
      venue.addressLine1,
      venue.addressLine2,
      venue.city,
      venue.region,
      venue.postalCode,
    ]
      .filter(Boolean)
      .join(", ") || undefined
  );
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
  const prefillClientId = searchParams.get("clientId")?.trim() || "";
  const templateId = searchParams.get("templateId")?.trim() || "";
  // Accepted proposal to book (issue #141): pre-fills the form; when the
  // proposal is still unlinked, submit goes through the proposal-booking seam
  // so the new event is linked and the accepted menu copies onto it.
  const proposalId = searchParams.get("proposalId")?.trim() || "";
  const proposal = useGetProposal(proposalId || "skip");
  const proposalDishSelections = useListProposalDishSelection();
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
  const createClient = useCreateClient();
  const createVenue = useCreateVenue();
  const createEvent = useCreateEvent();
  const [clientId, setClientId] = useState(prefillClientId);
  const [venueId, setVenueId] = useState("");
  const [showClient, setShowClient] = useState(false);
  const [showVenue, setShowVenue] = useState(false);
  const [busy, setBusy] = useState<"client" | "venue" | "event" | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [occasionId, setOccasionId] = useState("");
  const [serviceStyleId, setServiceStyleId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [referralSourceId, setReferralSourceId] = useState("");
  const { errors, touched, formProps, handleSubmit } =
    useFieldValidation(eventFieldRules);
  const draftForm = useFormDraft("event-create");
  const proposalPrefill = proposalEventPrefill.values(proposal);
  const proposalLinkable = proposalEventPrefill.canLinkOnCreate(proposal);
  const proposalMenuCount = proposalId
    ? (proposalDishSelections ?? []).filter(
        (selection) =>
          selection.proposalId === proposalId && selection.deletedAt == null,
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
  const activeOccasions = (occasions ?? [])
    .filter((occasion) => occasion.status === "active")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const serviceStyleOptions = serviceStyleSelectOptions(serviceStyles);
  // Empty catalogs (B2): once the lists have loaded, an empty occasion list and
  // the built-in service-style fallback each get a one-line fix-it hint under
  // the select instead of a silent blank dropdown.
  const occasionsEmpty =
    occasions !== undefined && activeOccasions.length === 0;
  const builtInServiceStyles = usingBuiltInServiceStyles(serviceStyles);
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

  const run = async (
    kind: "client" | "venue" | "event",
    work: () => Promise<void>,
  ) => {
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

  const submitClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const clientType = String(data.get("clientType")) as "company" | "person";
    void run("client", async () => {
      const args = cleanCommandArgs.from({
        clientType,
        companyName: optional(String(data.get("companyName") ?? "")),
        givenName: optional(String(data.get("givenName") ?? "")),
        familyName: optional(String(data.get("familyName") ?? "")),
        email: optional(String(data.get("email") ?? "")),
        phone: optional(String(data.get("phone") ?? "")),
        paymentTermsDays: 30,
        taxExempt: false,
      });
      const created = await createClient(args);
      setClientId(created.docId);
      setShowClient(false);
    });
  };

  const submitVenue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run("venue", async () => {
      const capacity = Number(data.get("capacity"));
      if (!Number.isFinite(capacity) || capacity < 0) {
        throw new Error("Venue capacity must be zero or greater.");
      }
      const args = cleanCommandArgs.from({
        name: String(data.get("name") ?? "").trim(),
        venueType: String(
          data.get("venueType"),
        ) as (typeof VENUE_TYPES)[number][0],
        capacity,
        addressLine1: optional(String(data.get("addressLine1") ?? "")),
        city: optional(String(data.get("city") ?? "")),
        region: optional(String(data.get("region") ?? "")),
        postalCode: optional(String(data.get("postalCode") ?? "")),
      });
      const created = await createVenue(args);
      setVenueId(created.docId);
      setShowVenue(false);
    });
  };

  const submitEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const venue = activeVenues.find((item) => item._id === venueId);
    void run("event", async () => {
      const args = eventPlanEngagementFormMapper.toCommandArgs({
        clientId,
        venueId,
        venue,
        title: String(data.get("title") ?? ""),
        eventTypeRaw: String(data.get("eventType") ?? ""),
        occasionId,
        serviceStyleId: persistableServiceStyleId(serviceStyleId),
        salespersonId,
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
      // An accepted, still-unlinked proposal books through the seam: one
      // transaction that creates the event, copies the proposal's menu
      // selections, and links Proposal.eventId (issue #141). Everything else
      // uses the plain generated create command, unchanged.
      const created =
        proposalLinkable && proposal
          ? await createEventFromProposal({
              proposalId: proposal._id,
              proposalVersion: proposal.version,
              event: args,
            })
          : await createEvent(args);
      draftForm.clear();
      navigate(eventDetailPath(created.docId));
    });
  };

  const clientRequiredCopy = eventCreateDisabledReason({
    busy: busy !== null,
    clientId,
  });

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
      />

      {failure ? <FailureBanner failure={failure} /> : null}

      <DraftRestoreBanner
        draft={draftForm.draft}
        onRestore={draftForm.restore}
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
                    No occasions yet — add them in{" "}
                    <Link
                      to="/admin/catalogs"
                      className="underline font-medium"
                    >
                      Admin → Catalogs
                    </Link>
                    .
                  </p>
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
                  defaultValue={proposalPrefill.startsAtLocal}
                  className="input"
                  required
                />
                <FieldError name="startsAt" errors={errors} touched={touched} />
              </label>
              <label className="field-label">
                Ends *
                <BoundedDateTimeLocalInput
                  name="endsAt"
                  className="input"
                  required
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
              <div>
                <label className="field-label">
                  Service style
                  <select
                    value={serviceStyleId}
                    onChange={(event) => setServiceStyleId(event.target.value)}
                    className="input"
                    form="event-create-form"
                  >
                    <option value="">Select a service style</option>
                    {serviceStyleOptions.map((serviceStyle) => (
                      <option key={serviceStyle.id} value={serviceStyle.id}>
                        {serviceStyle.name}
                      </option>
                    ))}
                  </select>
                </label>
                {builtInServiceStyles ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-3">
                    Showing the four built-in service styles — add your own in{" "}
                    <Link
                      to="/admin/catalogs"
                      className="underline font-medium"
                    >
                      Admin → Catalogs
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
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
            hint="Budget and quoted price for the engagement."
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
            hint="Sales attribution — salesperson and referral source."
            count={2}
          >
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <label className="field-label">
                Salesperson
                <select
                  value={salespersonId}
                  onChange={(event) => setSalespersonId(event.target.value)}
                  className="input"
                  form="event-create-form"
                >
                  <option value="">Select a salesperson</option>
                  {salespeople.map((person) => (
                    <option key={person._id} value={person._id}>
                      {[person.givenName, person.familyName]
                        .filter(Boolean)
                        .join(" ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Referral source
                <select
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
              </label>
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
              ) : proposal === null ? (
                <p className="p-3 text-sm text-ink-3">
                  This proposal no longer exists.
                </p>
              ) : (
                <div className="space-y-1.5 p-3 text-sm text-ink-2">
                  <p className="font-medium text-ink">{proposal.title}</p>
                  <p>
                    {proposal.eventType ? `${proposal.eventType} · ` : ""}
                    {Number(proposal.guestCount ?? 0)} guests ·{" "}
                    {formatMoneyExact(Number(proposal.total ?? 0))}
                  </p>
                  {proposal.venueName ? (
                    <p>
                      Venue: {proposal.venueName}
                      {proposal.venueAddress
                        ? ` — ${proposal.venueAddress}`
                        : ""}
                    </p>
                  ) : null}
                  {proposalLinkable ? (
                    <p className="pt-1 text-xs leading-relaxed text-ink-3">
                      {proposalMenuCount > 0
                        ? `Creating this event links it to the proposal and copies its ${proposalMenuCount} menu selection${proposalMenuCount === 1 ? "" : "s"} onto the event.`
                        : "Creating this event links it to the proposal. It has no menu selections to copy."}
                    </p>
                  ) : proposal.eventId ? (
                    <p className="pt-1 text-xs leading-relaxed text-ink-3">
                      Already booked — this proposal is linked to an event.
                      Creating another event here will not copy its menu.
                    </p>
                  ) : (
                    <p className="pt-1 text-xs leading-relaxed text-ink-3">
                      This proposal is {String(proposal.status)} — the event
                      will be created without linking it.
                    </p>
                  )}
                  {proposal.venueName && venues !== undefined && !venueId ? (
                    <p className="text-xs leading-relaxed text-ink-3">
                      No saved venue matched “{proposal.venueName}” — pick or
                      create it in the Venue panel.
                    </p>
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
                    <select
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      className="input"
                      required
                      form="event-create-form"
                    >
                      <option value="">Select a client</option>
                      {activeClients.map((client) => (
                        <option key={client._id} value={client._id}>
                          {clientDisplayName(client._id, activeClients)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {activeClients.length === 0 ? (
                    <p className="text-sm text-ink-3">
                      No active client accounts are available.
                    </p>
                  ) : null}
                  {!clientId ? (
                    <p className="text-sm text-ink-3" role="status">
                      Client is required
                    </p>
                  ) : null}
                </>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowClient((value) => !value)}
              >
                {showClient ? "Dismiss client form" : "Create client inline"}
              </button>
            </div>
            {showClient ? (
              <InlineClientForm
                busy={busy === "client"}
                onSubmit={submitClient}
              />
            ) : null}
          </Section>

          <Section title="Venue">
            <div className="space-y-3 p-3">
              {venues === undefined ? (
                <Skeleton className="h-8" />
              ) : (
                <>
                  <label className="field-label">
                    Place *
                    <select
                      value={venueId}
                      onChange={(event) => setVenueId(event.target.value)}
                      className="input"
                      required
                      form="event-create-form"
                    >
                      <option value="">Select a venue</option>
                      {activeVenues.map((venue) => (
                        <option key={venue._id} value={venue._id}>
                          {venue.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedVenue ? (
                    <p className="text-xs leading-relaxed text-ink-3">
                      {venueAddress(selectedVenue) ?? "No address recorded"} ·
                      capacity {selectedVenue.capacity}
                    </p>
                  ) : null}
                  {activeVenues.length === 0 ? (
                    <p className="text-sm text-ink-3">
                      No active venues are available.
                    </p>
                  ) : null}
                </>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowVenue((value) => !value)}
              >
                {showVenue ? "Dismiss venue form" : "Create venue inline"}
              </button>
            </div>
            {showVenue ? (
              <InlineVenueForm busy={busy === "venue"} onSubmit={submitVenue} />
            ) : null}
          </Section>

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
          <p className="text-xs leading-relaxed text-ink-3">
            Creation is policy-checked by the generated Client, Venue, and Event
            commands. Any denial or guard failure appears above.
          </p>
        </aside>
      </div>
    </div>
  );
}

function InlineClientForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [type, setType] = useState<"company" | "person">("company");
  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-line p-3">
      <label className="field-label">
        Type
        <select
          name="clientType"
          value={type}
          onChange={(event) =>
            setType(event.target.value as "company" | "person")
          }
          className="input"
        >
          <option value="company">Company</option>
          <option value="person">Person</option>
        </select>
      </label>
      {type === "company" ? (
        <label className="field-label">
          Company name
          <input name="companyName" className="input" required />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="field-label">
            Given name
            <input name="givenName" className="input" required />
          </label>
          <label className="field-label">
            Family name
            <input name="familyName" className="input" />
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="field-label">
          Email
          <input name="email" type="email" className="input" />
        </label>
        <label className="field-label">
          Phone
          <input name="phone" type="tel" className="input" />
        </label>
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy}>
        {busy ? "Creating…" : "Create and select client"}
      </button>
    </form>
  );
}

function InlineVenueForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-line p-3">
      <label className="field-label">
        Venue name
        <input name="name" className="input" required />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="field-label">
          Type
          <select name="venueType" className="input">
            {VENUE_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Capacity
          <input
            name="capacity"
            type="number"
            min={0}
            defaultValue={0}
            className="input"
            required
          />
        </label>
      </div>
      <label className="field-label">
        Address
        <input name="addressLine1" className="input" />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="field-label">
          City
          <input name="city" className="input" />
        </label>
        <label className="field-label">
          Region
          <input name="region" className="input" />
        </label>
        <label className="field-label">
          Postal
          <input name="postalCode" className="input" />
        </label>
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy}>
        {busy ? "Creating…" : "Create and select venue"}
      </button>
    </form>
  );
}
