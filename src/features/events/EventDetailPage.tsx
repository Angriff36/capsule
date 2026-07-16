import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { Id } from "../../lib/api";
import {
  formatCount,
  formatDate,
  formatMoney,
  formatTime,
  relativeDays,
} from "../../lib/format";
import {
  useEventApprove,
  useEventBeginExecution,
  useEventCancel,
  useEventChangeHeadcount,
  useEventChangePricing,
  useEventChangePrimaryContact,
  useEventChangeRequirements,
  useEventChangeVenue,
  useEventCloseOut,
  useEventComplete,
  useEventReschedule,
  useEventReturnToPlanning,
  useEventSubmitForApproval,
  useGetEvent,
  useListClient,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { ArrowLeftIcon } from "../../ui/icons";
import {
  ErrorState,
  PageHeader,
  Section,
  Skeleton,
  StatusChip,
} from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { EventGuestPanel } from "./EventGuestPanel";
import { FailureBanner } from "./FailureBanner";
import { clientDisplayName } from "./clientName";
import {
  type EventLifecycleActionKey,
  eventLifecyclePolicy,
} from "./EventLifecyclePolicy";

const optional = (value: string) => value.trim() || undefined;
function list(value: string): string[] | undefined {
  const values = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}
function localDateTime(value?: number | null): string {
  if (value == null) return "";
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

export function EventDetailPage() {
  const { id } = useParams();
  const eventId = (id ?? "skip") as Id<"events"> | "skip";
  const event = useGetEvent(eventId);
  const clients = useListClient();
  const venues = useListVenue();
  const submitForApproval = useEventSubmitForApproval();
  const approve = useEventApprove();
  const beginExecution = useEventBeginExecution();
  const complete = useEventComplete();
  const closeOut = useEventCloseOut();
  const cancel = useEventCancel();
  const returnToPlanning = useEventReturnToPlanning();
  const changeHeadcount = useEventChangeHeadcount();
  const changePricing = useEventChangePricing();
  const changePrimaryContact = useEventChangePrimaryContact();
  const changeRequirements = useEventChangeRequirements();
  const changeVenue = useEventChangeVenue();
  const reschedule = useEventReschedule();
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [reasonFor, setReasonFor] = useState<
    "cancel" | "returnToPlanning" | null
  >(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (event === undefined) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading event">
        <Skeleton className="h-8 w-96 max-w-full" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (event === null) {
    return (
      <ErrorState
        title="Event unavailable"
        detail="It may not exist, may have been deleted, or your role may not permit access."
      />
    );
  }

  const version = typeof event.version === "number" ? event.version : undefined;
  const canRevise = eventLifecyclePolicy.isEditableStage(String(event.stage));
  const canChangeHeadcount = eventLifecyclePolicy.canChangeHeadcount(
    String(event.stage),
  );
  const activeVenues = (venues ?? []).filter(
    (venue) =>
      venue.status === "active" &&
      venue.registeredAt != null &&
      venue.deletedAt == null,
  );

  const run = async (work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
      setReasonFor(null);
      setReason("");
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const runAction = (key: EventLifecycleActionKey) => {
    if (key === "cancel" || key === "returnToPlanning") {
      setReasonFor(key);
      setReason("");
      return;
    }
    const args = { docId: event._id, version };
    if (key === "submitForApproval") void run(() => submitForApproval(args));
    if (key === "approve") void run(() => approve(args));
    if (key === "beginExecution") void run(() => beginExecution(args));
    if (key === "complete") void run(() => complete(args));
    if (key === "closeOut") void run(() => closeOut(args));
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
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {event.title}
            <StatusChip status={String(event.stage)} />
          </span>
        }
        lead={
          <span className="font-mono text-[12px]">
            {event.eventType} · {clientDisplayName(event.clientId, clients)}
            {event.startsAt != null ? ` · ${relativeDays(event.startsAt)}` : ""}
          </span>
        }
        actions={eventLifecyclePolicy
          .availableActions(String(event.stage))
          .map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={busy}
              onClick={() => runAction(action.key)}
              className={`btn ${action.kind === "primary" ? "btn-primary" : action.kind === "danger" ? "btn-danger" : "btn-ghost"}`}
            >
              {action.label}
            </button>
          ))}
      />

      {reasonFor ? (
        <form
          className="card flex flex-wrap items-end gap-2 border-warn/40 bg-warn-soft/50 px-3 py-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (!reason.trim()) return;
            if (reasonFor === "cancel")
              void run(() =>
                cancel({ docId: event._id, reason: reason.trim(), version }),
              );
            else
              void run(() =>
                returnToPlanning({
                  docId: event._id,
                  reason: reason.trim(),
                  version,
                }),
              );
          }}
        >
          <label className="field-label min-w-64 flex-1">
            {reasonFor === "cancel"
              ? "Reason for cancelling"
              : "Reason for returning to planning"}
            <input
              autoFocus
              value={reason}
              onChange={(inputEvent) => setReason(inputEvent.target.value)}
              className="input"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || !reason.trim()}
            className={
              reasonFor === "cancel" ? "btn btn-danger" : "btn btn-primary"
            }
          >
            Confirm
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setReasonFor(null)}
          >
            Dismiss
          </button>
        </form>
      ) : null}
      {failure ? <FailureBanner failure={failure} /> : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <Section title="Schedule">
          <form
            key={`schedule-${version}`}
            className="space-y-3 p-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const data = new FormData(formEvent.currentTarget);
              void run(() =>
                reschedule({
                  docId: event._id,
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
                  defaultValue={localDateTime(event.startsAt)}
                  className="input"
                  disabled={!canRevise}
                  required
                />
              </label>
              <label className="field-label">
                Ends
                <input
                  name="endsAt"
                  type="datetime-local"
                  defaultValue={localDateTime(event.endsAt)}
                  className="input"
                  disabled={!canRevise}
                  required
                />
              </label>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              disabled={!canRevise || busy}
            >
              Save schedule
            </button>
          </form>
        </Section>

        <Section title="Service">
          <div className="space-y-3 p-3">
            <form
              key={`headcount-${version}`}
              className="flex items-end gap-2"
              onSubmit={(formEvent) => {
                formEvent.preventDefault();
                const data = new FormData(formEvent.currentTarget);
                void run(() =>
                  changeHeadcount({
                    docId: event._id,
                    newHeadcount: Number(data.get("headcount")),
                    version,
                  }),
                );
              }}
            >
              <label className="field-label flex-1">
                Headcount
                <input
                  name="headcount"
                  type="number"
                  min={1}
                  max={100000}
                  defaultValue={event.expectedHeadcount}
                  className="input"
                  disabled={!canChangeHeadcount}
                  required
                />
              </label>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!canChangeHeadcount || busy}
              >
                Save
              </button>
            </form>
            <form
              key={`venue-${version}`}
              className="flex items-end gap-2"
              onSubmit={(formEvent) => {
                formEvent.preventDefault();
                const selected = activeVenues.find(
                  (venue) =>
                    venue._id ===
                    new FormData(formEvent.currentTarget).get("venueId"),
                );
                void run(() =>
                  changeVenue({
                    docId: event._id,
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
                    version,
                  }),
                );
              }}
            >
              <label className="field-label flex-1">
                Venue
                <select
                  name="venueId"
                  defaultValue={event.venueId ?? ""}
                  className="input"
                  disabled={!canRevise || venues === undefined}
                >
                  <option value="">No venue</option>
                  {activeVenues.map((venue) => (
                    <option key={venue._id} value={venue._id}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!canRevise || busy}
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
                changePricing({
                  docId: event._id,
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
                  defaultValue={event.budgetAmount}
                  className="input"
                  disabled={!canRevise}
                />
              </label>
              <label className="field-label">
                Quoted
                <input
                  name="quote"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={event.quotedPrice}
                  className="input"
                  disabled={!canRevise}
                />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-ink-3">
                {formatMoney(event.budgetAmount)} /{" "}
                {formatMoney(event.quotedPrice)}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!canRevise || busy}
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
                changePrimaryContact({
                  docId: event._id,
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
                defaultValue={event.primaryContactName ?? ""}
                className="input"
                disabled={!canRevise}
                required
              />
            </label>
            <label className="field-label">
              Email
              <input
                name="email"
                type="email"
                defaultValue={event.primaryContactEmail ?? ""}
                className="input"
                disabled={!canRevise}
              />
            </label>
            <label className="field-label">
              Phone
              <input
                name="phone"
                defaultValue={event.primaryContactPhone ?? ""}
                className="input"
                disabled={!canRevise}
              />
            </label>
            <button
              className="btn btn-ghost btn-sm sm:col-span-3 sm:justify-self-start"
              disabled={!canRevise || busy}
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
                changeRequirements({
                  docId: event._id,
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
                defaultValue={(event.accessibilityNeeds ?? []).join(", ")}
                className="input"
                disabled={!canRevise}
              />
            </label>
            <label className="field-label">
              Service
              <textarea
                name="service"
                defaultValue={event.serviceRequirements ?? ""}
                className="input min-h-20 py-2"
                disabled={!canRevise}
              />
            </label>
            <label className="field-label">
              Operations
              <textarea
                name="operations"
                defaultValue={event.operationalRequirements ?? ""}
                className="input min-h-20 py-2"
                disabled={!canRevise}
              />
            </label>
            <button
              className="btn btn-ghost btn-sm sm:col-span-2 sm:justify-self-start"
              disabled={!canRevise || busy}
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
      <EventGuestPanel eventId={event._id} />

      <div className="sr-only">
        Current facts: {formatDate(event.startsAt)} {formatTime(event.startsAt)}
        , {formatCount(event.expectedHeadcount)} guests,{" "}
        {formatMoney(event.quotedPrice)} quoted.
      </div>
    </div>
  );
}
