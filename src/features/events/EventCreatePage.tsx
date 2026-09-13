import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Doc } from "../../lib/api";
import { formatCountNoun, formatDate, formatTime } from "../../lib/format";
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
  useListProposalEnhancement,
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
import { SearchSelect } from "../../ui/SearchSelect";
import {
  InlineClientForm,
  InlineDuplicateNotice,
  InlineVenueForm,
  type PendingInlineDuplicate,
  type VenueTypeCode,
} from "./EventCreateInlineForms";
import { findLikelyDuplicates } from "./inlineRecordDuplicates";

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

/** One quiet line that tells two same-named venues apart in a picker. */
function venueSummary(venue: Doc<"venues">): string {
  const parts = [venueAddress(venue) ?? "No address recorded"];
  const capacity = Number(venue.capacity ?? 0);
  parts.push(capacity > 0 ? `capacity ${capacity}` : "capacity not set");
  return parts.join(" · ");
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
  // Inline create paused on a look-alike record; the operator decides.
  const [pendingDuplicate, setPendingDuplicate] =
    useState<PendingInlineDuplicate | null>(null);
  const [pendingArgs, setPendingArgs] = useState<Record<
    string,
    unknown
  > | null>(null);
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

  const createClientNow = (args: Record<string, unknown>) =>
    run("client", async () => {
      const created = await createClient(args);
      setClientId(created.docId);
      setShowClient(false);
      setPendingDuplicate(null);
    });

  const submitClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const clientType = String(data.get("clientType")) as "company" | "person";
    const companyName = optional(String(data.get("companyName") ?? ""));
    const givenName = optional(String(data.get("givenName") ?? ""));
    const familyName = optional(String(data.get("familyName") ?? ""));
    const email = optional(String(data.get("email") ?? ""));
    const args = cleanCommandArgs.from({
      clientType,
      companyName,
      givenName,
      familyName,
      email,
      phone: optional(String(data.get("phone") ?? "")),
      paymentTermsDays: 30,
      taxExempt: false,
    });
    const typedName =
      clientType === "company"
        ? (companyName ?? "")
        : [givenName, familyName].filter(Boolean).join(" ");
    const matches = findLikelyDuplicates(
      { name: typedName, email },
      activeClients.map((client) => ({
        _id: client._id,
        name: clientDisplayName(client._id, [client]),
        email: client.email,
      })),
    );
    if (matches.length > 0) {
      setPendingArgs(args);
      setPendingDuplicate({
        kind: "client",
        typedName,
        matches: matches.map((match) => ({
          id: match._id,
          label: match.name,
          hint: match.email ?? null,
        })),
      });
      return;
    }
    void createClientNow(args);
  };

  const createVenueNow = (args: Record<string, unknown>) =>
    run("venue", async () => {
      const created = await createVenue(args);
      setVenueId(created.docId);
      setShowVenue(false);
      setPendingDuplicate(null);
    });

  const submitVenue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const capacity = Number(data.get("capacity"));
    if (!Number.isFinite(capacity) || capacity < 0) {
      setFailure(
        classifyCommandFailure(
          new Error("Venue capacity must be zero or greater."),
        ),
      );
      return;
    }
    const name = String(data.get("name") ?? "").trim();
    const args = cleanCommandArgs.from({
      name,
      venueType: String(data.get("venueType")) as VenueTypeCode,
      capacity,
      addressLine1: optional(String(data.get("addressLine1") ?? "")),
      city: optional(String(data.get("city") ?? "")),
      region: optional(String(data.get("region") ?? "")),
      postalCode: optional(String(data.get("postalCode") ?? "")),
    });
    const matches = findLikelyDuplicates(
      { name },
      activeVenues.map((venue) => ({ _id: venue._id, name: venue.name })),
    );
    if (matches.length > 0) {
      setPendingArgs(args);
      setPendingDuplicate({
        kind: "venue",
        typedName: name,
        matches: matches.map((match) => {
          const venue = activeVenues.find((row) => row._id === match._id);
          return {
            id: match._id,
            label: match.name,
            hint: venue ? venueSummary(venue) : null,
          };
        }),
      });
      return;
    }
    void createVenueNow(args);
  };

  const resolveDuplicate = {
    useExisting: (id: string) => {
      if (pendingDuplicate?.kind === "client") {
        setClientId(id);
        setShowClient(false);
      } else {
        setVenueId(id);
        setShowVenue(false);
      }
      setPendingDuplicate(null);
      setPendingArgs(null);
    },
    createAnyway: () => {
      if (!pendingDuplicate || !pendingArgs) return;
      const args = pendingArgs;
      setPendingArgs(null);
      void (pendingDuplicate.kind === "client"
        ? createClientNow(args)
        : createVenueNow(args));
    },
    dismiss: () => {
      setPendingDuplicate(null);
      setPendingArgs(null);
    },
  };

  // Restore puts text back into named fields; the relation pickers are React
  // state, so re-seed them from the same saved values (client, venue, occasion,
  // service style, salesperson, referral source were lost before — #368 item 4).
  const restoreDraft = () => {
    const saved = draftForm.restore();
    if (!saved) return;
    const pick = (key: string) => saved.values[key]?.trim() ?? "";
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
                  defaultValue={proposalPrefill.endsAtLocal}
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
                    name="serviceStyleId"
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
                    Showing the built-in service styles as labels only — they
                    are not saved on the event until they exist as catalog rows.
                    Open{" "}
                    <Link
                      to="/admin/catalogs"
                      target="_blank"
                      rel="noopener"
                      className="underline font-medium"
                    >
                      Admin → Catalogs
                    </Link>{" "}
                    and click “Add the standard list” (Buffet – Cook Onsite,
                    Plated, Family Style, …). Opens in a new tab; this form
                    stays put.
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
                  name="salespersonId"
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
                  <p>
                    {proposal.eventDate != null
                      ? `Starts: ${formatDate(proposal.eventDate)} · ${formatTime(proposal.eventDate)}`
                      : "No start date on the proposal — set the start time on the event."}
                  </p>
                  <p>
                    {proposal.eventEndDate != null
                      ? `Ends: ${formatDate(proposal.eventEndDate)} · ${formatTime(proposal.eventEndDate)}`
                      : "No end time on the proposal — set the end time on the event."}
                  </p>
                  {proposalEnhancementCount > 0 ? (
                    <p>
                      Enhancements: {proposalEnhancementCount} on the proposal —
                      they will show on the event.
                    </p>
                  ) : null}
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
                    <SearchSelect
                      name="clientId"
                      form="event-create-form"
                      value={clientId}
                      onChange={setClientId}
                      required
                      placeholder={`Search ${activeClients.length} clients by name or email…`}
                      emptyText="No client matches — create one below."
                      testId="event-create-client"
                      options={activeClients.map((client) => ({
                        id: client._id,
                        label: clientDisplayName(client._id, activeClients),
                        hint:
                          [client.email, client.phone]
                            .filter(Boolean)
                            .join(" · ") || null,
                      }))}
                    />
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
            {pendingDuplicate?.kind === "client" ? (
              <InlineDuplicateNotice
                pending={pendingDuplicate}
                busy={busy !== null}
                onUseExisting={resolveDuplicate.useExisting}
                onCreateAnyway={resolveDuplicate.createAnyway}
                onDismiss={resolveDuplicate.dismiss}
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
                    <SearchSelect
                      name="venueId"
                      form="event-create-form"
                      value={venueId}
                      onChange={setVenueId}
                      required
                      placeholder={`Search ${activeVenues.length} venues by name or address…`}
                      emptyText="No venue matches — create one below."
                      testId="event-create-venue"
                      options={activeVenues.map((venue) => ({
                        id: venue._id,
                        label: venue.name,
                        hint: venueSummary(venue),
                      }))}
                    />
                  </label>
                  {selectedVenue &&
                  Number(selectedVenue.capacity ?? 0) === 0 ? (
                    <p className="text-xs leading-relaxed text-ink-3">
                      This venue has no capacity recorded — set it in Facilities
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
            {pendingDuplicate?.kind === "venue" ? (
              <InlineDuplicateNotice
                pending={pendingDuplicate}
                busy={busy !== null}
                onUseExisting={resolveDuplicate.useExisting}
                onCreateAnyway={resolveDuplicate.createAnyway}
                onDismiss={resolveDuplicate.dismiss}
              />
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
