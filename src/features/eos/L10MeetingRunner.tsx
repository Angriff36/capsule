import { useEffect, useState } from "react";
import { AGENDA } from "../reports/L10AgendaSection";
import "./eos.css";

/** Where each agenda part lives on the L10 page, in agenda order. */
const ANCHORS = [
  "wins",
  "l10-scorecard",
  "rocks",
  "client-headlines",
  "people-headlines",
  "issues",
  "todos",
  "rating",
] as const;

const KEY = "capsule.l10.meeting";

type MeetingState = { startedAt: number; part: number; partStartedAt: number };

function readState(): MeetingState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MeetingState) : null;
  } catch {
    return null;
  }
}

function writeState(state: MeetingState | null) {
  try {
    if (state) sessionStorage.setItem(KEY, JSON.stringify(state));
    else sessionStorage.removeItem(KEY);
  } catch {
    // The meeting still runs; it just won't survive a reload.
  }
}

function clock(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${ms < 0 ? "+" : ""}${minutes}:${seconds}`;
}

function scrollTo(part: number) {
  const id = ANCHORS[part];
  if (!id) return;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function useL10Meeting(autoStart: boolean) {
  const [state, setState] = useState<MeetingState | null>(() => readState());
  useEffect(() => {
    if (autoStart && !readState()) {
      const now = Date.now();
      const next = { startedAt: now, part: 0, partStartedAt: now };
      writeState(next);
      setState(next);
    }
  }, [autoStart]);
  const start = () => {
    const now = Date.now();
    const next = { startedAt: now, part: 0, partStartedAt: now };
    writeState(next);
    setState(next);
    scrollTo(0);
  };
  const go = (part: number) => {
    setState((current) => {
      if (!current) return current;
      const next = { ...current, part, partStartedAt: Date.now() };
      writeState(next);
      return next;
    });
    scrollTo(part);
  };
  const end = () => {
    writeState(null);
    setState(null);
  };
  return { state, start, go, end };
}

/**
 * Meeting mode for the weekly L10: the eight agenda parts as a strip, a
 * countdown for the part you are on, and Next to move on. The page scrolls
 * to the part's section, so the meeting runs from the page itself.
 */
export function L10MeetingRunner({
  state,
  go,
  end,
}: {
  state: MeetingState;
  go: (part: number) => void;
  end: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    scrollTo(state.part);
    // Only when the meeting opens on a part, not on every tick.
  }, []);

  const part = AGENDA[state.part]!;
  const left = part.minutes * 60_000 - (now - state.partStartedAt);
  const elapsed = now - state.startedAt;
  const last = state.part === AGENDA.length - 1;

  return (
    <section
      className="eos-meeting eos-tone-traction mt-4"
      aria-label="L10 meeting mode"
    >
      <div className="eos-meeting-strip" role="list">
        {AGENDA.map((entry, index) => (
          <button
            key={entry.name}
            type="button"
            role="listitem"
            className={index < state.part ? "is-past" : undefined}
            aria-current={index === state.part ? "step" : undefined}
            onClick={() => go(index)}
          >
            {entry.name} · {entry.minutes}m
          </button>
        ))}
      </div>
      <div className="eos-meeting-now">
        <div className="min-w-0">
          <span className="eos-eyebrow">
            Part {state.part + 1} of {AGENDA.length} · meeting{" "}
            {clock(elapsed).replace("+", "")} of 60:00
          </span>
          <p className="text-xl font-bold text-ink">{part.name}</p>
          <p className="text-sm text-ink-2">{part.what}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`eos-timer${left < 0 ? " is-over" : ""}`}
            aria-live="off"
            title={left < 0 ? "Over time" : "Time left for this part"}
          >
            {clock(left)}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={state.part === 0}
            onClick={() => go(state.part - 1)}
          >
            Back
          </button>
          {last ? (
            <button type="button" className="btn btn-primary" onClick={end}>
              End meeting
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => go(state.part + 1)}
            >
              Next: {AGENDA[state.part + 1]!.name}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
