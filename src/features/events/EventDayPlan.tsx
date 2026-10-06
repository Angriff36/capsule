import { useState } from "react";
import type { Id } from "../../lib/api";
import { useEventConfigureTiming } from "../../lib/manifest-convex-react";
import type { Plan } from "./EventTimingPlannerDraft";

// When the company has no rule yet, these stand in so the day still has
// times. Each one is shown as "suggested" until it is saved on the event.
const DEFAULT_SETUP_MINUTES = 45;
const DEFAULT_LOAD_MINUTES = 60;
const DEFAULT_CLEANUP_MINUTES = 60;
const DEFAULT_UNLOAD_MINUTES = 30;
const DEFAULT_SPARE_MINUTES = 15;

type Minutes = { value: number | null; suggested: boolean };

const pick = (stored: unknown, fallback: number | null): Minutes =>
  typeof stored === "number" && Number.isFinite(stored)
    ? { value: stored, suggested: false }
    : { value: fallback, suggested: fallback != null };

const clock = (at: number | null) =>
  at == null
    ? "—"
    : new Date(at).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });

/**
 * The whole day as clock times, worked out from what the event already
 * knows. Nothing has to be typed first: a minute that is not saved yet uses
 * the company rule or a default, marked "suggested".
 */
export function EventDayPlan({
  eventId,
  plan,
  canChange,
}: {
  eventId: Id<"events">;
  plan: Plan;
  canChange: boolean;
}) {
  const save = useEventConfigureTiming();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const event = plan.event as unknown as Record<string, unknown>;

  const service = Number(event.serviceStartsAt ?? event.startsAt ?? NaN);
  const ends = Number(event.endsAt ?? NaN);
  if (!Number.isFinite(service) || !Number.isFinite(ends)) {
    return (
      <p className="mt-3 text-base text-ink-2">
        Set the event's start and end to see the day's times.
      </p>
    );
  }
  const setup = pick(
    event.timingSetupMinutes,
    typeof event.timingSuggestedSetupMinutes === "number"
      ? event.timingSuggestedSetupMinutes
      : DEFAULT_SETUP_MINUTES,
  );
  const load = pick(event.timingLoadMinutes, DEFAULT_LOAD_MINUTES);
  const out = pick(event.timingOutboundTravelMinutes, null);
  const spare = pick(event.timingSafetyBufferMinutes, DEFAULT_SPARE_MINUTES);
  const briefing = pick(event.timingBriefingMinutes, 0);
  const cleanup = pick(event.timingCleanupMinutes, DEFAULT_CLEANUP_MINUTES);
  const back = pick(event.timingReturnTravelMinutes, out.value);
  const unload = pick(event.timingUnloadMinutes, DEFAULT_UNLOAD_MINUTES);
  const min = (m: Minutes) => (m.value ?? 0) * 60_000;

  const arrive = service - min(setup);
  const leave = out.value == null ? null : arrive - min(out) - min(spare);
  const loadStart = leave == null ? null : leave - min(load);
  const staffOn = loadStart == null ? null : loadStart - min(briefing);
  const leaveVenue = ends + min(cleanup);
  const backAt = back.value == null ? null : leaveVenue + min(back);
  const staffOff = backAt == null ? null : backAt + min(unload);

  const note = (m: Minutes, what: string) =>
    m.value == null
      ? ""
      : `${m.value} min ${what}${m.suggested ? " (suggested)" : ""}`;
  const rows: [string, number | null, string][] = [
    ["Staff on", staffOn, briefing.value ? note(briefing, "briefing") : ""],
    ["Start loading", loadStart, note(load, "loading")],
    [
      "Leave kitchen",
      leave,
      out.value == null
        ? ""
        : `${note(out, "drive")} + ${note(spare, "spare")}`,
    ],
    ["Arrive and set up", arrive, note(setup, "setup")],
    ["Service starts", service, ""],
    ["Event ends, pack up", ends, note(cleanup, "pack-up")],
    [
      "Leave venue",
      leaveVenue,
      back.value == null ? "" : note(back, "drive back"),
    ],
    ["Back at kitchen", backAt, note(unload, "unloading")],
    ["Staff off", staffOff, ""],
  ];
  const anySuggested = [setup, load, spare, cleanup, back, unload].some(
    (m) => m.suggested,
  );
  const needsSave = event.timingConfiguredAt == null || anySuggested;

  const useTimes = async () => {
    setBusy(true);
    setError(null);
    try {
      await save({
        docId: eventId,
        version: Number(event.version),
        serviceStartsAt: service,
        setupMinutes: setup.value ?? undefined,
        loadMinutes: load.value ?? undefined,
        outboundTravelMinutes: out.value ?? undefined,
        cleanupMinutes: cleanup.value ?? undefined,
        returnTravelMinutes: back.value ?? undefined,
        unloadMinutes: unload.value ?? undefined,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <ol className="divide-y divide-line">
        {rows.map(([label, at, detail]) => (
          <li key={label} className="flex items-baseline gap-4 py-2">
            <span className="w-28 shrink-0 whitespace-nowrap font-mono text-lg tabular-nums">
              {clock(at)}
            </span>
            <span className="font-semibold">{label}</span>
            {detail ? (
              <span className="text-sm text-ink-2">{detail}</span>
            ) : null}
          </li>
        ))}
      </ol>
      {out.value == null ? (
        <p className="mt-2 text-sm text-ink-2">
          Get the drive time below to fill in the trip.
        </p>
      ) : null}
      {canChange && needsSave ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void useTimes()}
          >
            {busy ? "Saving…" : "Use these times"}
          </button>
          <span className="text-sm text-ink-2">
            Saves them on the event and the crew timeline. Change any of them
            with Edit timing.
          </span>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
