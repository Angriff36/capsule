import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Doc } from "../../lib/api";
import {
  useCreateClient,
  useCreateEvent,
  useCreateVenue,
  useGetEventTemplate,
  useListClient,
  useListMenu,
  useListOccasion,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { ArrowLeftIcon } from "../../ui/icons";
import { DraftRestoreBanner, useFormDraft } from "../../ui/formDraft";
import { FieldError, useFieldValidation } from "../../ui/formValidation";
import { PageHeader, Section, Skeleton } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { cleanCommandArgs } from "./CleanCommandArgs";
import { clientDisplayName } from "./clientName";
import { eventPlanEngagementFormMapper } from "./EventPlanEngagementFormMapper";
import { FailureBanner } from "./FailureBanner";
import { eventDetailPath } from "./eventRoutes";

const VENUE_TYPES = [
  ["client_site", "Client site"],
  ["banquet_hall", "Banquet hall"],
  ["outdoor", "Outdoor"],
  ["office", "Office"],
  ["private_home", "Private home"],
  ["other", "Other"],
] as const;

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

export function EventCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillClientId = searchParams.get("clientId")?.trim() || "";
  const templateId = searchParams.get("templateId")?.trim() || "";
  const template = useGetEventTemplate(templateId || "skip");
  const menus = useListMenu();
  const templateMenuName = (menus ?? []).find(
    (menu) => menu._id === template?.menuId,
  )?.name;
  const clients = useListClient();
  const venues = useListVenue();
  const occasions = useListOccasion();
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
  const { errors, touched, formProps, handleSubmit } =
    useFieldValidation(eventFieldRules);
  const draftForm = useFormDraft("event-create");

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
  const selectedVenue = activeVenues.find((venue) => venue._id === venueId);

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
        occasionId,
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
      const created = await createEvent(args);
      draftForm.clear();
      navigate(eventDetailPath(created.docId));
    });
  };

  return (
    <div className="space-y-4">
      <Link
        to="/events"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink"
      >
        <ArrowLeftIcon width={12} height={12} /> All events
      </Link>
      <PageHeader
        title="New event"
        lead="Establish the account, place, schedule, service brief, and commercial baseline."
      />

      {failure ? <FailureBanner failure={failure} /> : null}

      <DraftRestoreBanner
        draft={draftForm.draft}
        onRestore={draftForm.restore}
        onDiscard={draftForm.discard}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
        <form
          key={template?._id ?? "blank"}
          id="event-create-form"
          ref={draftForm.formRef}
          onSubmit={handleSubmit(submitEvent)}
          className="space-y-3"
          {...formProps}
        >
          <Section title="Engagement">
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <label className="field-label sm:col-span-2">
                Event title
                <input name="title" className="input" required autoFocus />
                <FieldError name="title" errors={errors} touched={touched} />
              </label>
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
              <label className="field-label">
                Expected headcount
                <input
                  name="expectedHeadcount"
                  type="number"
                  min={1}
                  max={100000}
                  defaultValue={template?.defaultHeadcount ?? 1}
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
                Starts
                <input
                  name="startsAt"
                  type="datetime-local"
                  className="input"
                  required
                />
                <FieldError name="startsAt" errors={errors} touched={touched} />
              </label>
              <label className="field-label">
                Ends
                <input
                  name="endsAt"
                  type="datetime-local"
                  className="input"
                  required
                />
                <FieldError name="endsAt" errors={errors} touched={touched} />
              </label>
            </div>
          </Section>

          <Section title="Primary contact">
            <div className="grid gap-3 p-3 sm:grid-cols-3">
              <label className="field-label">
                Name
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
          </Section>

          <Section title="Planning brief">
            <div className="grid gap-3 p-3 sm:grid-cols-2">
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
          </Section>

          <Section title="Commercial">
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <label className="field-label">
                Budget amount
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
                Quoted price
                <input
                  name="quotedPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={0}
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
          </Section>
        </form>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {templateId ? (
            <Section title="Template">
              {template === undefined ? (
                <div className="p-3">
                  <Skeleton className="h-8" />
                </div>
              ) : template === null ? (
                <p className="p-3 text-[12px] text-ink-3">
                  This template no longer exists.
                </p>
              ) : (
                <div className="space-y-1.5 p-3 text-[12px] text-ink-2">
                  <p className="font-medium text-ink">{template.name}</p>
                  <p>
                    {String(template.clientType)} client ·{" "}
                    {template.defaultHeadcount} guests
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
                  <p className="pt-1 text-[11px] leading-relaxed text-ink-3">
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
                    Account
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
                    <p className="text-[12px] text-ink-3">
                      No active client accounts are available.
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
                    Place
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
                    <p className="text-[11.5px] leading-relaxed text-ink-3">
                      {venueAddress(selectedVenue) ?? "No address recorded"} ·
                      capacity {selectedVenue.capacity}
                    </p>
                  ) : null}
                  {activeVenues.length === 0 ? (
                    <p className="text-[12px] text-ink-3">
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
          <p className="text-[11px] leading-relaxed text-ink-3">
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
