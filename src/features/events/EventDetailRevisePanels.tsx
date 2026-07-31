import type { Id } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { EventDetailReviseContactPanels } from "./EventDetailReviseContactPanels";
import { localDateTime } from "./eventDetailFormHelpers";
import { EventFormCluster } from "./EventFormCluster";
import { EventTabPanel } from "./EventTabPanel";

type ActiveVenue = {
  _id: Id<"venues">;
  name: string;
  capacity: number;
  addressLine1?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
};

export type EventDetailRevisePanelsProps = {
  readonly eventId: Id<"events">;
  readonly version: number | undefined;
  readonly busy: boolean;
  readonly canRevise: boolean;
  readonly canChangeHeadcount: boolean;
  readonly reviseBlockedReason: string | undefined;
  readonly headcountBlockedReason: string | undefined;
  readonly venuesLoading: boolean;
  readonly activeVenues: ActiveVenue[];
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly expectedHeadcount?: number | null;
  readonly venueId?: Id<"venues"> | null;
  readonly budgetAmount?: number | null;
  readonly quotedPrice?: number | null;
  readonly primaryContactName?: string | null;
  readonly primaryContactEmail?: string | null;
  readonly primaryContactPhone?: string | null;
  readonly accessibilityNeeds?: string[] | null;
  readonly serviceRequirements?: string | null;
  readonly operationalRequirements?: string | null;
  readonly run: (work: () => Promise<unknown>) => Promise<void>;
  readonly onReschedule: (input: {
    docId: Id<"events">;
    startsAt: number;
    endsAt: number;
    version: number | undefined;
  }) => Promise<unknown>;
  readonly onChangeHeadcount: (input: {
    docId: Id<"events">;
    newHeadcount: number;
    version: number | undefined;
  }) => Promise<unknown>;
  readonly onChangeVenue: (input: {
    docId: Id<"events">;
    venueId?: Id<"venues">;
    venueName?: string;
    venueAddress?: string;
    venueCapacity?: number;
    version: number | undefined;
  }) => Promise<unknown>;
  readonly onChangePricing: (input: {
    docId: Id<"events">;
    budgetAmount: number;
    quotedPrice: number;
    version: number | undefined;
  }) => Promise<unknown>;
  readonly onChangePrimaryContact: (input: {
    docId: Id<"events">;
    primaryContactName: string;
    primaryContactEmail?: string;
    primaryContactPhone?: string;
    version: number | undefined;
  }) => Promise<unknown>;
  readonly onChangeRequirements: (input: {
    docId: Id<"events">;
    accessibilityNeeds?: string[];
    serviceRequirements?: string;
    operationalRequirements?: string;
    version: number | undefined;
  }) => Promise<unknown>;
};

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function EventDetailRevisePanels(props: EventDetailRevisePanelsProps) {
  const {
    eventId,
    version,
    busy,
    canRevise,
    canChangeHeadcount,
    reviseBlockedReason,
    headcountBlockedReason,
    venuesLoading,
    activeVenues,
    startsAt,
    endsAt,
    expectedHeadcount,
    venueId,
    budgetAmount,
    quotedPrice,
    primaryContactName,
    primaryContactEmail,
    primaryContactPhone,
    accessibilityNeeds,
    serviceRequirements,
    operationalRequirements,
    run,
    onReschedule,
    onChangeHeadcount,
    onChangeVenue,
    onChangePricing,
    onChangePrimaryContact,
    onChangeRequirements,
  } = props;
  return (
    <EventTabPanel
      eyebrow="Planning"
      title="Edit event basics"
      description="Update schedule, headcount, venue, pricing, contact, and planning notes for this event."
      testId="event-setup-basics-panel"
    >
      <div className="grid gap-3 lg:grid-cols-3">
        <EventFormCluster
          title="Schedule"
          hint="When the event starts and ends"
        >
          <form
            key={`schedule-${version}`}
            className="space-y-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const data = new FormData(formEvent.currentTarget);
              void run(() =>
                onReschedule({
                  docId: eventId,
                  startsAt: new Date(formText(data, "startsAt")).getTime(),
                  endsAt: new Date(formText(data, "endsAt")).getTime(),
                  version,
                }),
              );
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="field-label">
                <span>Starts</span>
                <input
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={localDateTime(startsAt)}
                  className="input"
                  disabled={!canRevise}
                  title={reviseBlockedReason}
                  required
                />
              </label>
              <label className="field-label">
                <span>Ends</span>
                <input
                  name="endsAt"
                  type="datetime-local"
                  defaultValue={localDateTime(endsAt)}
                  className="input"
                  disabled={!canRevise}
                  title={reviseBlockedReason}
                  required
                />
              </label>
            </div>
            <button
              type="submit"
              className="btn btn-primary min-h-10"
              disabled={!canRevise || busy}
              title={reviseBlockedReason}
            >
              Save schedule
            </button>
          </form>
        </EventFormCluster>

        <EventFormCluster
          title="Service"
          hint="Headcount and venue for the day"
        >
          <form
            key={`headcount-${version}`}
            className="flex min-w-0 flex-wrap items-end gap-2"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const data = new FormData(formEvent.currentTarget);
              void run(() =>
                onChangeHeadcount({
                  docId: eventId,
                  newHeadcount: Number(data.get("headcount")),
                  version,
                }),
              );
            }}
          >
            <label className="field-label min-w-0 flex-1">
              <span>Headcount</span>
              <input
                name="headcount"
                type="number"
                min={1}
                max={100000}
                defaultValue={expectedHeadcount ?? undefined}
                className="input"
                disabled={!canChangeHeadcount}
                title={headcountBlockedReason}
                required
              />
            </label>
            <button
              type="submit"
              className="btn btn-ghost min-h-10"
              disabled={!canChangeHeadcount || busy}
              title={headcountBlockedReason}
            >
              Save
            </button>
          </form>
          <form
            key={`venue-${version}`}
            className="flex min-w-0 flex-wrap items-end gap-2"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const selected = activeVenues.find(
                (venue) =>
                  venue._id ===
                  new FormData(formEvent.currentTarget).get("venueId"),
              );
              void run(() =>
                onChangeVenue({
                  docId: eventId,
                  venueId: selected?._id,
                  venueName: selected?.name,
                  venueAddress: selected
                    ? [
                        selected.addressLine1,
                        selected.city,
                        selected.region,
                        selected.postalCode,
                      ]
                        .filter(Boolean)
                        .join(", ") || undefined
                    : undefined,
                  venueCapacity: selected?.capacity,
                  version,
                }),
              );
            }}
          >
            <label className="field-label min-w-0 flex-1">
              <span>Venue</span>
              <select
                name="venueId"
                defaultValue={venueId ?? ""}
                className="input"
                disabled={!canRevise || venuesLoading}
                title={reviseBlockedReason}
              >
                <option value="">No venue</option>
                {activeVenues.map((venue) => (
                  <option key={venue._id} value={venue._id}>
                    {venue.name} · capacity {venue.capacity}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn btn-ghost min-h-10"
              disabled={!canRevise || busy}
              title={reviseBlockedReason}
            >
              Save
            </button>
          </form>
        </EventFormCluster>

        <EventFormCluster title="Commercial" hint="Budget and quoted price">
          <form
            key={`pricing-${version}`}
            className="space-y-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const data = new FormData(formEvent.currentTarget);
              void run(() =>
                onChangePricing({
                  docId: eventId,
                  budgetAmount: Number(data.get("budget")),
                  quotedPrice: Number(data.get("quote")),
                  version,
                }),
              );
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="field-label">
                <span>Budget</span>
                <input
                  name="budget"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={budgetAmount ?? undefined}
                  className="input"
                  disabled={!canRevise}
                  title={reviseBlockedReason}
                />
              </label>
              <label className="field-label">
                <span>Quoted</span>
                <input
                  name="quote"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={quotedPrice ?? undefined}
                  className="input"
                  disabled={!canRevise}
                  title={reviseBlockedReason}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-ink-3">
                {formatMoney(budgetAmount)} / {formatMoney(quotedPrice)}
              </span>
              <button
                type="submit"
                className="btn btn-primary min-h-10"
                disabled={!canRevise || busy}
                title={reviseBlockedReason}
              >
                Save pricing
              </button>
            </div>
          </form>
        </EventFormCluster>
      </div>

      <EventDetailReviseContactPanels
        eventId={eventId}
        version={version}
        busy={busy}
        canRevise={canRevise}
        reviseBlockedReason={reviseBlockedReason}
        primaryContactName={primaryContactName}
        primaryContactEmail={primaryContactEmail}
        primaryContactPhone={primaryContactPhone}
        accessibilityNeeds={accessibilityNeeds}
        serviceRequirements={serviceRequirements}
        operationalRequirements={operationalRequirements}
        run={run}
        onChangePrimaryContact={onChangePrimaryContact}
        onChangeRequirements={onChangeRequirements}
      />

      {canRevise ? null : (
        <p className="mt-3 text-sm text-ink-3">
          Core planning details lock once the event moves past planning.
          Headcount can still be changed until the event is underway.
        </p>
      )}
    </EventTabPanel>
  );
}
