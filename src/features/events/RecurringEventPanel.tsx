import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatTime } from "../../lib/format";
import {
  firstFutureRecurringOccurrence,
  type EventRecurrenceBoundary,
  type EventRecurrenceEndCondition,
  type EventRecurrenceFrequency,
} from "../../lib/eventRecurrence";
import { useConfigureRecurringEvent } from "../../lib/recurringEventActions";
import { useEventStopRecurrence } from "../../lib/manifest-convex-react";
import type { Id } from "../../lib/api";
import { Section, StatusChip } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

export interface RecurringEventSnapshot {
  recurrenceFrequency?: EventRecurrenceFrequency | null;
  recurrenceEndCondition?: EventRecurrenceEndCondition | null;
  recurrenceEndsAt?: number | null;
  recurrenceOccurrenceLimit?: number | null;
  recurrenceNextStartsAt?: number | null;
  recurrenceGeneratedCount?: number | null;
  recurrenceActive?: boolean;
  recurrenceStoppedAt?: number | null;
  recurrenceCompletedAt?: number | null;
  recurrenceTemplateEventId?: Id<"events"> | null;
  recurrenceSequence?: number | null;
}

export interface RecurringEventFormInput {
  frequency: EventRecurrenceFrequency;
  endCondition: EventRecurrenceEndCondition;
  recurrenceEndsAt?: number;
  occurrenceLimit?: number;
}

export interface RecurringEventPanelViewProps {
  startsAt?: number | null;
  recurrence: RecurringEventSnapshot;
  canConfigure: boolean;
  busy: boolean;
  failure?: CommandFailure | null;
  onConfigure: (input: RecurringEventFormInput) => Promise<unknown>;
  onStop: () => Promise<unknown>;
}

function dateInputValue(value?: number | null): string {
  if (typeof value !== "number") return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function endOfLocalDate(value: string): number | undefined {
  if (!value) return undefined;
  const end = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(end) ? end : undefined;
}

function frequencyLabel(value?: EventRecurrenceFrequency | null): string {
  if (value === "weekly") return "Weekly";
  if (value === "monthly") return "Monthly";
  if (value === "annually") return "Annually";
  return "Not configured";
}

function ScheduleSummary({
  recurrence,
  now,
}: {
  recurrence: RecurringEventSnapshot;
  now: number;
}) {
  const generatedDrafts = Math.max(
    Number(recurrence.recurrenceGeneratedCount ?? 1) - 1,
    0,
  );
  if (!recurrence.recurrenceFrequency) {
    if (recurrence.recurrenceTemplateEventId) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xs border border-accent/25 bg-accent-soft/30 p-3">
          <div>
            <span className="eyebrow">Recurring Draft</span>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">
              Occurrence {recurrence.recurrenceSequence ?? "—"} was prepared
              from the source Event and remains in Draft for operator review.
            </p>
          </div>
          <Link
            className="btn btn-ghost btn-sm"
            to={`/events/${recurrence.recurrenceTemplateEventId}`}
          >
            Open source Event
          </Link>
        </div>
      );
    }
    return (
      <p className="text-sm leading-relaxed text-ink-3">
        Create future copies of this Event for review. Every copy stays in Draft
        until an operator submits and approves it.
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-xs border border-line bg-inset/45 p-2.5">
        <span className="eyebrow">Cadence</span>
        <strong className="mt-1 block text-base text-ink">
          {frequencyLabel(recurrence.recurrenceFrequency)}
        </strong>
      </div>
      <div className="rounded-xs border border-line bg-inset/45 p-2.5">
        <span className="eyebrow">Drafts created</span>
        <strong className="mt-1 block font-mono text-base text-ink">
          {generatedDrafts}
        </strong>
      </div>
      <div className="rounded-xs border border-line bg-inset/45 p-2.5">
        <span className="eyebrow">Next Draft</span>
        <strong className="mt-1 block text-sm text-ink">
          {recurrence.recurrenceActive &&
          typeof recurrence.recurrenceNextStartsAt === "number" ? (
            <>
              {`${formatDate(recurrence.recurrenceNextStartsAt)} · ${formatTime(recurrence.recurrenceNextStartsAt)}`}
              {recurrence.recurrenceNextStartsAt <= now ? (
                <span className="ml-1.5 text-warn">(overdue)</span>
              ) : null}
            </>
          ) : recurrence.recurrenceCompletedAt != null ? (
            "Series complete"
          ) : (
            "Stopped"
          )}
        </strong>
      </div>
    </div>
  );
}

export function RecurringEventPanelView({
  startsAt,
  recurrence,
  canConfigure,
  busy,
  failure,
  onConfigure,
  onStop,
}: RecurringEventPanelViewProps) {
  const isRecurrenceInstance = recurrence.recurrenceTemplateEventId != null;
  const [editing, setEditing] = useState(
    !recurrence.recurrenceFrequency && !isRecurrenceInstance,
  );
  const [frequency, setFrequency] = useState<EventRecurrenceFrequency>(
    recurrence.recurrenceFrequency ?? "weekly",
  );
  const [condition, setCondition] = useState<EventRecurrenceEndCondition>(
    recurrence.recurrenceEndCondition ?? "on_date",
  );
  const [endsAtInput, setEndsAtInput] = useState(() =>
    dateInputValue(recurrence.recurrenceEndsAt),
  );
  const [occurrenceLimitInput, setOccurrenceLimitInput] = useState(() =>
    String(recurrence.recurrenceOccurrenceLimit ?? 12),
  );
  const now = Date.now();
  const eventAlreadyPast = typeof startsAt === "number" && startsAt < now;
  const previewBoundary = useMemo<EventRecurrenceBoundary | undefined>(() => {
    if (condition === "on_date") {
      const recurrenceEndsAt = endOfLocalDate(endsAtInput);
      return recurrenceEndsAt != null
        ? { endCondition: "on_date", recurrenceEndsAt }
        : undefined;
    }
    const occurrenceLimit = Number(occurrenceLimitInput);
    return Number.isSafeInteger(occurrenceLimit) && occurrenceLimit >= 2
      ? { endCondition: "after_occurrences", occurrenceLimit }
      : undefined;
  }, [condition, endsAtInput, occurrenceLimitInput]);
  const preview = useMemo(
    () =>
      typeof startsAt === "number"
        ? firstFutureRecurringOccurrence(
            startsAt,
            frequency,
            Date.now(),
            previewBoundary,
          )
        : undefined,
    [frequency, startsAt, previewBoundary],
  );

  const submit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    const occurrenceLimit = Number(data.get("occurrenceLimit"));
    void onConfigure({
      frequency,
      endCondition: condition,
      recurrenceEndsAt:
        condition === "on_date"
          ? endOfLocalDate(String(data.get("recurrenceEndsAt") ?? ""))
          : undefined,
      occurrenceLimit:
        condition === "after_occurrences" &&
        Number.isSafeInteger(occurrenceLimit)
          ? occurrenceLimit
          : undefined,
    })
      .then(() => setEditing(false))
      .catch(() => undefined);
  };

  return (
    <Section
      title="Recurring schedule"
      actions={
        recurrence.recurrenceActive ? (
          <StatusChip status="active" />
        ) : recurrence.recurrenceFrequency ? (
          <StatusChip status="stopped" />
        ) : undefined
      }
    >
      <div className="space-y-3 p-3">
        {failure ? <FailureBanner failure={failure} /> : null}
        {!isRecurrenceInstance && eventAlreadyPast ? (
          <div
            className="rounded-xs border border-warn/30 bg-warn-soft p-3 text-sm leading-relaxed text-warn"
            role="status"
            data-testid="recurrence-past-warning"
          >
            <strong>This Event is already in the past.</strong> It started{" "}
            {formatDate(startsAt)} at {formatTime(startsAt)}, so the recurring
            series runs behind today — copies dated before now stay in Draft
            until an operator reviews them.
          </div>
        ) : null}
        <ScheduleSummary recurrence={recurrence} now={now} />

        {isRecurrenceInstance ? null : !editing ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy || !canConfigure}
              onClick={() => setEditing(true)}
            >
              {recurrence.recurrenceActive ? "Update schedule" : "Start again"}
            </button>
            {recurrence.recurrenceActive ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={busy}
                onClick={() => void onStop().catch(() => undefined)}
              >
                Stop recurrence
              </button>
            ) : null}
            {!canConfigure ? (
              <span className="text-xs text-ink-3">
                Return this Event to an editable planning stage to change its
                recurring schedule.
              </span>
            ) : null}
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="grid gap-3 rounded-xs border border-line bg-inset/35 p-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <label className="field-label">
              Frequency
              <select
                name="frequency"
                className="input"
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value as EventRecurrenceFrequency)
                }
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="annually">Annually</option>
              </select>
            </label>
            <label className="field-label">
              Ends
              <select
                name="endCondition"
                className="input"
                value={condition}
                onChange={(event) =>
                  setCondition(
                    event.target.value as EventRecurrenceEndCondition,
                  )
                }
              >
                <option value="on_date">On a date</option>
                <option value="after_occurrences">
                  After a number of events
                </option>
              </select>
            </label>
            {condition === "on_date" ? (
              <label className="field-label">
                Final event date
                <input
                  name="recurrenceEndsAt"
                  type="date"
                  className="input"
                  value={endsAtInput}
                  onChange={(event) => setEndsAtInput(event.target.value)}
                  required
                />
              </label>
            ) : (
              <label className="field-label">
                Total events
                <input
                  name="occurrenceLimit"
                  type="number"
                  min={2}
                  max={1000}
                  className="input"
                  value={occurrenceLimitInput}
                  onChange={(event) =>
                    setOccurrenceLimitInput(event.target.value)
                  }
                  required
                />
              </label>
            )}
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="btn btn-primary flex-1"
                disabled={busy || !canConfigure || startsAt == null}
              >
                {busy ? "Saving…" : "Save schedule"}
              </button>
              {recurrence.recurrenceFrequency ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Dismiss
                </button>
              ) : null}
            </div>
            <p className="sm:col-span-2 lg:col-span-4 text-xs leading-relaxed text-ink-3">
              {preview === undefined ? (
                "Set the Event schedule before adding recurrence. "
              ) : preview === null ? (
                <span className="text-warn">
                  No further Drafts: this schedule ends before any date after
                  today.{" "}
                </span>
              ) : (
                `First future Draft: ${formatDate(preview.startsAt)} at ${formatTime(preview.startsAt)}. `
              )}
              {preview != null && preview.pastDraftCount > 0 ? (
                <span className="text-warn">
                  {preview.pastDraftCount === 1
                    ? "1 earlier date in this series is already past and will land as an overdue Draft. "
                    : `${preview.pastDraftCount} earlier dates in this series are already past and will land as overdue Drafts. `}
                </span>
              ) : null}
              Drafts are prepared up to 90 days ahead. Updating the series does
              not alter Drafts already created.
            </p>
          </form>
        )}
      </div>
    </Section>
  );
}

export interface RecurringEventPanelProps extends RecurringEventSnapshot {
  eventId: Id<"events">;
  startsAt?: number | null;
  version?: number;
  canConfigure: boolean;
}

export function RecurringEventPanel({
  eventId,
  startsAt,
  version,
  canConfigure,
  ...recurrence
}: RecurringEventPanelProps) {
  const configure = useConfigureRecurringEvent();
  const stop = useEventStopRecurrence();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const run = async (work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      throw error;
    } finally {
      setBusy(false);
    }
  };

  return (
    <RecurringEventPanelView
      startsAt={startsAt}
      recurrence={recurrence}
      canConfigure={canConfigure}
      busy={busy}
      failure={failure}
      onConfigure={(input) =>
        run(() =>
          configure({
            docId: eventId,
            ...input,
            version,
          }),
        )
      }
      onStop={() => run(() => stop({ docId: eventId, version }))}
    />
  );
}
