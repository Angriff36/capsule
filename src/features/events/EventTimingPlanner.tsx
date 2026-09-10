import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Id } from "../../lib/api";
import { useEventTimingPlan } from "../../lib/operational-transactions";
import {
  useEventConfigureTiming,
  useEventTimelineActivityPlanTiming,
  useEventTimelineActivityUseCalculatedTiming,
} from "../../lib/manifest-convex-react";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { localDateTime } from "./eventDetailFormHelpers";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

const durationFields = [
  [
    "setupMinutes",
    "timingSetupMinutes",
    "Onsite setup",
    "Before service; full service 180 min, limited service 90 min.",
  ],
  [
    "loadMinutes",
    "timingLoadMinutes",
    "Load at shop",
    "Start with 60 min; allow more for larger loads or more vehicles.",
  ],
  [
    "outboundTravelMinutes",
    "timingOutboundTravelMinutes",
    "Travel to venue",
    "Use a checked drive time, not an estimate.",
  ],
  [
    "cleanupMinutes",
    "timingCleanupMinutes",
    "Cleanup & reload",
    "After event end; typically 60 min. Adjust for this event.",
  ],
  [
    "returnTravelMinutes",
    "timingReturnTravelMinutes",
    "Travel back to shop",
    "Check the return trip; it may differ from the outward trip.",
  ],
  [
    "unloadMinutes",
    "timingUnloadMinutes",
    "Unload at shop",
    "Allow time to finish unloading before staff off.",
  ],
] as const;

type Plan = NonNullable<ReturnType<typeof useEventTimingPlan>>;
type Milestone = Plan["milestones"][number];
type Draft = {
  version: number;
  serviceStartsAt: string;
  originalServiceAt?: number | null;
} & Record<(typeof durationFields)[number][0], string>;

function startDraft(plan: Plan): Draft {
  const { event } = plan;
  const sourceService = plan.milestones.find((m) => m.key === "service")?.row
    ?.startsAt;
  const originalServiceAt =
    event.serviceStartsAt ??
    (event.timingConfiguredAt == null ? sourceService : undefined);
  const defaults: Record<string, number | null | undefined> =
    event.timingConfiguredAt == null
      ? {
          setupMinutes: event.timingSuggestedSetupMinutes,
          loadMinutes: 60,
          cleanupMinutes: 60,
        }
      : {};
  return {
    version: event.version,
    originalServiceAt,
    serviceStartsAt: localDateTime(originalServiceAt),
    ...Object.fromEntries(
      durationFields.map(([key, field]) => [
        key,
        String(event[field] ?? defaults[key] ?? ""),
      ]),
    ),
  } as Draft;
}

const timeLabel = (value?: number | null) =>
  value == null
    ? "Time not set"
    : new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

/** Event inputs and their shared milestones, with visible preserved exceptions. */
export function EventTimingPlanner({ eventId }: { eventId: Id<"events"> }) {
  const plan = useEventTimingPlan(eventId);
  const save = useEventConfigureTiming();
  const resume = useEventTimelineActivityUseCalculatedTiming();
  const link = useEventTimelineActivityPlanTiming();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [saved, setSaved] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const formTitle = useRef<HTMLHeadingElement>(null);
  const milestoneLabels = useRef<Record<string, HTMLParagraphElement | null>>(
    {},
  );
  const [focusMilestone, setFocusMilestone] = useState<string | null>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (draft != null) formTitle.current?.focus();
    else if (wasEditing.current) opener.current?.focus();
    wasEditing.current = draft != null;
  }, [draft != null]);
  useEffect(() => {
    if (focusMilestone) milestoneLabels.current[focusMilestone]?.focus();
  }, [focusMilestone]);

  if (!plan)
    return (
      <p role="status" className="text-base text-ink-2">
        Loading event timing…
      </p>
    );

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      await work();
      return true;
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!draft) return;
    const durations = Object.fromEntries(
      durationFields.map(([key]) => [
        key,
        draft[key].trim() === "" ? undefined : Number(draft[key]),
      ]),
    );
    const startsAt =
      draft.serviceStartsAt === localDateTime(draft.originalServiceAt)
        ? (draft.originalServiceAt ?? undefined)
        : draft.serviceStartsAt
          ? new Date(draft.serviceStartsAt).getTime()
          : undefined;
    const ok = await run(() =>
      save({
        docId: eventId,
        version: draft.version,
        serviceStartsAt: startsAt,
        ...durations,
      }),
    );
    if (ok) {
      setDraft(null);
      setSaved(true);
    }
  };
  const useBlock = (milestone: Milestone, id: string) => {
    const row = milestone.matches.find((candidate) => candidate._id === id);
    if (!row) return;
    void run(() =>
      link({
        docId: row._id,
        version: row.version,
        milestone: milestone.key,
        startsAt: milestone.startsAt ?? undefined,
        endsAt: milestone.endsAt ?? undefined,
      }),
    );
  };

  return (
    <section
      className="border-y border-line py-5"
      aria-label="Service and crew timing"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Service & crew timing</h2>
        {!draft && plan.event.timingCanRecalculate && (
          <button
            ref={opener}
            type="button"
            className="btn btn-ghost min-h-10"
            disabled={busy}
            onClick={() => {
              setDraft(startDraft(plan));
              setFailure(null);
              setSaved(false);
            }}
          >
            {plan.event.timingConfiguredAt == null
              ? "Plan timing"
              : "Edit timing"}
          </button>
        )}
      </div>
      <p className="mt-2 text-base text-ink-2">
        Work back from service to staff on, then forward from event end to staff
        off. Unknown durations leave the affected times unset.
      </p>
      {!plan.event.timingCanRecalculate && (
        <p className="mt-2 text-base text-ink-2">
          This event keeps its recorded timing. Individual timeline blocks
          remain available for corrections.
        </p>
      )}
      {failure && (
        <div className="mt-3">
          <FailureBanner failure={failure} />
        </div>
      )}
      {saved && (
        <p role="status" className="mt-3 text-base text-success">
          Timing saved to the shared run.
        </p>
      )}
      {draft && (
        <form onSubmit={(e) => void submit(e)} className="mt-5">
          <h3 ref={formTitle} tabIndex={-1} className="text-lg font-semibold">
            Plan this event’s timing
          </h3>
          <p className="mt-2 text-base text-ink-2">
            Event: {timeLabel(plan.event.startsAt)} –{" "}
            {timeLabel(plan.event.endsAt)}. Service can start at a different
            time. Rescheduling moves the service time with the event.
          </p>
          <fieldset
            disabled={busy}
            className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <legend className="sr-only">
              Service time and durations in minutes
            </legend>
            <label className="field-label sm:col-span-2 lg:col-span-3">
              <span>Service starts</span>
              <BoundedDateTimeLocalInput
                className="input min-h-10 w-full sm:max-w-sm"
                name="serviceStartsAt"
                value={draft.serviceStartsAt}
                onChange={(e) =>
                  setDraft({ ...draft, serviceStartsAt: e.target.value })
                }
              />
            </label>
            {durationFields.map(([key, , label, hint]) => (
              <label className="field-label" key={key}>
                <span>{label} (min)</span>
                <input
                  className="input min-h-10 w-full"
                  name={key}
                  type="number"
                  min="0"
                  step="any"
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
                <span className="text-sm font-normal normal-case tracking-normal text-ink-2">
                  {hint}
                </span>
              </label>
            ))}
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
              <button type="submit" className="btn btn-primary">
                {busy ? "Saving…" : "Save timing"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {plan.event.timingConfiguredAt != null && (
        <>
          <p className="mt-4 text-base text-ink-2">
            Manual times and performed work are kept when the plan changes.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {plan.milestones.map((milestone) => {
              const row = milestone.row;
              const kept = milestone.manual || milestone.performed;
              const differs =
                row != null &&
                ((row.startsAt ?? null) !== milestone.startsAt ||
                  (row.endsAt ?? null) !== milestone.endsAt);
              return (
                <li
                  key={milestone.key}
                  className="flex flex-col items-start justify-between gap-3 py-3 sm:flex-row"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-base font-semibold"
                      tabIndex={-1}
                      ref={(element) => {
                        milestoneLabels.current[milestone.key] = element;
                      }}
                    >
                      {row?.name ?? milestone.name}
                    </p>
                    <p className="text-base">
                      {milestone.removed
                        ? "Removed from the run"
                        : `${milestone.matches.length > 1 ? "Calculated: " : ""}${timeLabel(row ? row.startsAt : milestone.startsAt)}`}
                      {!milestone.removed &&
                        (row ? row.endsAt : milestone.endsAt) != null &&
                        ` – ${timeLabel(row ? row.endsAt : milestone.endsAt)}`}
                    </p>
                    {kept && (
                      <p className="text-sm text-ink-2">
                        {milestone.performed
                          ? "Performed work kept"
                          : "Manual time kept"}
                        {differs &&
                          `. Calculated: ${timeLabel(milestone.startsAt)}${milestone.endsAt != null ? ` – ${timeLabel(milestone.endsAt)}` : ""}`}
                      </p>
                    )}
                    {milestone.matches.length > 1 &&
                      plan.event.timingCanRecalculate && (
                        <label className="field-label mt-2">
                          <span>
                            Choose the existing block for this milestone
                          </span>
                          <select
                            className="input min-h-10 w-full"
                            value=""
                            disabled={busy || !plan.event.timingCanRecalculate}
                            onChange={(e) =>
                              useBlock(milestone, e.target.value)
                            }
                          >
                            <option value="" disabled>
                              Select a block
                            </option>
                            {milestone.matches.map((candidate) => (
                              <option value={candidate._id} key={candidate._id}>
                                {candidate.name} ·{" "}
                                {timeLabel(candidate.startsAt)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                  </div>
                  {plan.event.timingCanRecalculate &&
                    milestone.manual &&
                    !milestone.performed &&
                    row && (
                      <button
                        type="button"
                        className="btn btn-ghost min-h-10"
                        disabled={busy}
                        onClick={async () => {
                          setFocusMilestone(null);
                          if (
                            await run(() =>
                              resume({ docId: row._id, version: row.version }),
                            )
                          )
                            setFocusMilestone(milestone.key);
                        }}
                      >
                        Use calculated time
                      </button>
                    )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
