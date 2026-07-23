import type { Id } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { Section } from "../../ui/primitives";
import { list, localDateTime, optional } from "./eventDetailFormHelpers";

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
  eventId: Id<"events">;
  version: number | undefined;
  busy: boolean;
  canRevise: boolean;
  canChangeHeadcount: boolean;
  reviseBlockedReason: string | undefined;
  headcountBlockedReason: string | undefined;
  venuesLoading: boolean;
  activeVenues: ActiveVenue[];
  startsAt?: number | null;
  endsAt?: number | null;
  expectedHeadcount?: number | null;
  venueId?: Id<"venues"> | null;
  budgetAmount?: number | null;
  quotedPrice?: number | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  accessibilityNeeds?: string[] | null;
  serviceRequirements?: string | null;
  operationalRequirements?: string | null;
  run: (work: () => Promise<unknown>) => Promise<void>;
  onReschedule: (input: {
    docId: Id<"events">;
    startsAt: number;
    endsAt: number;
    version: number | undefined;
  }) => Promise<unknown>;
  onChangeHeadcount: (input: {
    docId: Id<"events">;
    newHeadcount: number;
    version: number | undefined;
  }) => Promise<unknown>;
  onChangeVenue: (input: {
    docId: Id<"events">;
    venueId?: Id<"venues">;
    venueName?: string;
    venueAddress?: string;
    venueCapacity?: number;
    version: number | undefined;
  }) => Promise<unknown>;
  onChangePricing: (input: {
    docId: Id<"events">;
    budgetAmount: number;
    quotedPrice: number;
    version: number | undefined;
  }) => Promise<unknown>;
  onChangePrimaryContact: (input: {
    docId: Id<"events">;
    primaryContactName: string;
    primaryContactEmail?: string;
    primaryContactPhone?: string;
    version: number | undefined;
  }) => Promise<unknown>;
  onChangeRequirements: (input: {
    docId: Id<"events">;
    accessibilityNeeds?: string[];
    serviceRequirements?: string;
    operationalRequirements?: string;
    version: number | undefined;
  }) => Promise<unknown>;
};

export function EventDetailRevisePanels({
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
}: EventDetailRevisePanelsProps) {
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-3">
        <Section title="Schedule">
          <form
            key={`schedule-${version}`}
            className="space-y-3 p-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const data = new FormData(formEvent.currentTarget);
              void run(() =>
                onReschedule({
                  docId: eventId,
                  startsAt: new Date(String(data.get("startsAt"))).getTime(),
                  endsAt: new Date(String(data.get("endsAt"))).getTime(),
                  version,
                }),
              );
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="field-label">
                Starts
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
                Ends
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
              className="btn btn-ghost btn-sm"
              disabled={!canRevise || busy}
              title={reviseBlockedReason}
            >
              Save schedule
            </button>
          </form>
        </Section>

        <Section title="Service">
          <div className="space-y-3 p-3">
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
                Headcount
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
                className="btn btn-ghost btn-sm"
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
                Venue
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
                className="btn btn-ghost btn-sm"
                disabled={!canRevise || busy}
                title={reviseBlockedReason}
              >
                Save
              </button>
            </form>
          </div>
        </Section>

        <Section title="Commercial">
          <form
            key={`pricing-${version}`}
            className="space-y-3 p-3"
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
                Budget
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
                Quoted
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
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-ink-3">
                {formatMoney(budgetAmount)} / {formatMoney(quotedPrice)}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!canRevise || busy}
                title={reviseBlockedReason}
              >
                Save pricing
              </button>
            </div>
          </form>
        </Section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Primary contact">
          <form
            key={`contact-${version}`}
            className="grid gap-3 p-3 sm:grid-cols-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const data = new FormData(formEvent.currentTarget);
              void run(() =>
                onChangePrimaryContact({
                  docId: eventId,
                  primaryContactName: String(data.get("name") ?? "").trim(),
                  primaryContactEmail: optional(
                    String(data.get("email") ?? ""),
                  ),
                  primaryContactPhone: optional(
                    String(data.get("phone") ?? ""),
                  ),
                  version,
                }),
              );
            }}
          >
            <label className="field-label">
              Name
              <input
                name="name"
                defaultValue={primaryContactName ?? ""}
                className="input"
                disabled={!canRevise}
                title={reviseBlockedReason}
                required
              />
            </label>
            <label className="field-label">
              Email
              <input
                name="email"
                type="email"
                defaultValue={primaryContactEmail ?? ""}
                className="input"
                disabled={!canRevise}
                title={reviseBlockedReason}
              />
            </label>
            <label className="field-label">
              Phone
              <input
                name="phone"
                defaultValue={primaryContactPhone ?? ""}
                className="input"
                disabled={!canRevise}
                title={reviseBlockedReason}
              />
            </label>
            <button
              className="btn btn-ghost btn-sm sm:col-span-3 sm:justify-self-start"
              disabled={!canRevise || busy}
              title={reviseBlockedReason}
            >
              Save contact
            </button>
          </form>
        </Section>

        <Section title="Planning requirements">
          <form
            key={`requirements-${version}`}
            className="grid gap-3 p-3 sm:grid-cols-2"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const data = new FormData(formEvent.currentTarget);
              void run(() =>
                onChangeRequirements({
                  docId: eventId,
                  accessibilityNeeds: list(
                    String(data.get("accessibility") ?? ""),
                  ),
                  serviceRequirements: optional(
                    String(data.get("service") ?? ""),
                  ),
                  operationalRequirements: optional(
                    String(data.get("operations") ?? ""),
                  ),
                  version,
                }),
              );
            }}
          >
            <label className="field-label sm:col-span-2">
              Accessibility
              <input
                name="accessibility"
                defaultValue={(accessibilityNeeds ?? []).join(", ")}
                className="input"
                disabled={!canRevise}
                title={reviseBlockedReason}
              />
            </label>
            <label className="field-label">
              Service
              <textarea
                name="service"
                defaultValue={serviceRequirements ?? ""}
                className="input min-h-20 py-2"
                disabled={!canRevise}
                title={reviseBlockedReason}
              />
            </label>
            <label className="field-label">
              Operations
              <textarea
                name="operations"
                defaultValue={operationalRequirements ?? ""}
                className="input min-h-20 py-2"
                disabled={!canRevise}
                title={reviseBlockedReason}
              />
            </label>
            <button
              className="btn btn-ghost btn-sm sm:col-span-2 sm:justify-self-start"
              disabled={!canRevise || busy}
              title={reviseBlockedReason}
            >
              Save requirements
            </button>
          </form>
        </Section>
      </div>

      {!canRevise ? (
        <p className="text-[11.5px] text-ink-3">
          Core planning revisions are disabled by the generated lifecycle state.
          Headcount remains available only where its generated command permits
          it.
        </p>
      ) : null}
    </>
  );
}
