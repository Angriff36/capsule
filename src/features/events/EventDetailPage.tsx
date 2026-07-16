import { useState } from "react";
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
  useEventCloseOut,
  useEventComplete,
  useEventReschedule,
  useEventReturnToPlanning,
  useEventSubmitForApproval,
  useGetEvent,
  useListClient,
} from "../../lib/manifest-convex-react";
import { ArrowLeftIcon } from "../../ui/icons";
import {
  ErrorState,
  PageHeader,
  Section,
  Skeleton,
  StatusChip,
} from "../../ui/primitives";
import { clientDisplayName } from "./clientName";
import {
  eventLifecyclePolicy,
  type EventLifecycleActionKey,
} from "./EventLifecyclePolicy";

export function EventDetailPage() {
  const { id } = useParams();
  const eventId = (id ?? "skip") as Id<"events"> | "skip";
  const event = useGetEvent(eventId === "skip" ? "skip" : eventId);
  const clients = useListClient();

  const submitForApproval = useEventSubmitForApproval();
  const approve = useEventApprove();
  const beginExecution = useEventBeginExecution();
  const complete = useEventComplete();
  const closeOut = useEventCloseOut();
  const cancel = useEventCancel();
  const returnToPlanning = useEventReturnToPlanning();
  const changeHeadcount = useEventChangeHeadcount();
  const changePricing = useEventChangePricing();
  const reschedule = useEventReschedule();

  const [error, setError] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<"cancel" | "returnToPlanning" | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (event === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (event === null) {
    return (
      <ErrorState
        title="Event not found"
        detail="It may have been deleted, or it belongs to a different workspace."
      />
    );
  }

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      setReasonFor(null);
      setReason("");
    } catch (e) {
      setError(
        eventLifecyclePolicy.humanizeCommandError(
          e instanceof Error ? e.message : String(e),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const actions = eventLifecyclePolicy.availableActions(String(event.stage));
  const editable = eventLifecyclePolicy.isEditableStage(String(event.stage));
  const version = typeof event.version === "number" ? event.version : undefined;

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
            {event.startsAt != null
              ? ` · ${relativeDays(event.startsAt)}`
              : ""}
          </span>
        }
        actions={
          <>
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                disabled={busy}
                onClick={() => runAction(a.key)}
                className={`btn ${a.kind === "primary" ? "btn-primary" : a.kind === "danger" ? "btn-danger" : "btn-ghost"}`}
              >
                {a.label}
              </button>
            ))}
          </>
        }
      />

      {reasonFor && (
        <form
          className="card flex flex-wrap items-center gap-2 border-warn/40 bg-warn-soft/50 px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            if (reasonFor === "cancel") {
              void run(() =>
                cancel({
                  docId: event._id,
                  reason: reason.trim(),
                  version,
                }),
              );
            } else {
              void run(() =>
                returnToPlanning({
                  docId: event._id,
                  reason: reason.trim(),
                  version,
                }),
              );
            }
          }}
        >
          <span className="text-[12px] font-medium text-warn">
            {reasonFor === "cancel"
              ? "Reason for cancelling"
              : "Reason for returning to planning"}
          </span>
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input max-w-80"
            placeholder="Required"
          />
          <button
            type="submit"
            disabled={busy || !reason.trim()}
            className={`btn ${reasonFor === "cancel" ? "btn-danger" : "btn-primary"}`}
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
      )}

      {error ? (
        <div className="card border-danger/40 bg-danger-soft/40 px-3 py-2 text-[12px] text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <Section title="Schedule">
          <dl className="space-y-2 px-3 py-3 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <dt className="meta-term">Starts</dt>
              <dd className="font-mono">
                {formatDate(event.startsAt)} {formatTime(event.startsAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="meta-term">Ends</dt>
              <dd className="font-mono">
                {formatDate(event.endsAt)} {formatTime(event.endsAt)}
              </dd>
            </div>
            {editable && event.startsAt != null && event.endsAt != null ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => {
                  const nextStart = event.startsAt! + 86_400_000;
                  const span = event.endsAt! - event.startsAt!;
                  void run(() =>
                    reschedule({
                      docId: event._id,
                      startsAt: nextStart,
                      endsAt: nextStart + span,
                      version,
                    }),
                  );
                }}
              >
                Shift one day later
              </button>
            ) : null}
          </dl>
        </Section>

        <Section title="Service">
          <dl className="space-y-2 px-3 py-3 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <dt className="meta-term">Headcount</dt>
              <dd className="font-mono">
                {formatCount(event.expectedHeadcount)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="meta-term">Venue</dt>
              <dd>{event.venueName ?? "—"}</dd>
            </div>
            {editable ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    changeHeadcount({
                      docId: event._id,
                      newHeadcount: Math.max(1, event.expectedHeadcount + 10),
                      version,
                    }),
                  )
                }
              >
                +10 headcount
              </button>
            ) : null}
          </dl>
        </Section>

        <Section title="Commercial">
          <dl className="space-y-2 px-3 py-3 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <dt className="meta-term">Budget</dt>
              <dd className="font-mono">{formatMoney(event.budgetAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="meta-term">Quoted</dt>
              <dd className="font-mono">{formatMoney(event.quotedPrice)}</dd>
            </div>
            {editable ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    changePricing({
                      docId: event._id,
                      budgetAmount: event.budgetAmount,
                      quotedPrice: event.quotedPrice + 100,
                      version,
                    }),
                  )
                }
              >
                Raise quote $100
              </button>
            ) : null}
          </dl>
        </Section>
      </div>

      <Section title="Primary contact">
        <dl className="grid gap-2 px-3 py-3 text-[12.5px] sm:grid-cols-3">
          <div>
            <div className="meta-term">Name</div>
            <div>{event.primaryContactName ?? "—"}</div>
          </div>
          <div>
            <div className="meta-term">Email</div>
            <div className="font-mono">{event.primaryContactEmail ?? "—"}</div>
          </div>
          <div>
            <div className="meta-term">Phone</div>
            <div className="font-mono">{event.primaryContactPhone ?? "—"}</div>
          </div>
        </dl>
      </Section>
    </div>
  );
}
