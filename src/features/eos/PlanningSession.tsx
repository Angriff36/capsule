import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { LeadershipItemRow } from "../reports/leadershipHistory";
import { EosPanel } from "./EosShared";
import { EOS_PATHS, quarterStart } from "./eosModel";

type Kind = "quarterly" | "annual";

type Step = {
  name: string;
  minutes: number;
  what: string;
  /** What Capsule knows for this step, and where to work on it. */
  fact: keyof Facts | null;
  to: string | null;
  day?: 1 | 2;
};

type Facts = {
  quarter: string;
  vision: string;
  rocks: string;
  issues: string;
  todos: string;
  goals: string;
};

/** The planning days from Traction, with the minutes the book gives each part. */
const SESSIONS: Record<Kind, { label: string; every: string; steps: Step[] }> =
  {
    quarterly: {
      label: "Quarterly",
      every: "Every 90 days · one full day, off site",
      steps: [
        {
          name: "Segue",
          minutes: 15,
          what: "Each person: best business and personal news, what is working and what is not, expectations for today.",
          fact: null,
          to: null,
        },
        {
          name: "Review last quarter",
          minutes: 60,
          what: "Numbers, then each Rock: done or not done. 80% done is a good quarter. Unfinished Rocks drop off, carry on, or go to Issues.",
          fact: "quarter",
          to: `${EOS_PATHS.l10}#rocks`,
        },
        {
          name: "Review the V/TO",
          minutes: 60,
          what: "Read it top to bottom. Is everyone still on the same page? Anything that needs a change goes to Issues.",
          fact: "vision",
          to: EOS_PATHS.vision,
        },
        {
          name: "Set next quarter's Rocks",
          minutes: 120,
          what: "List everything that matters, cut to the 3 to 7 company Rocks, give each one owner, then each person sets their own.",
          fact: "rocks",
          to: `${EOS_PATHS.l10}#rocks`,
        },
        {
          name: "Tackle key issues",
          minutes: 180,
          what: "Work the Issues List with IDS: identify the real problem, discuss it, solve it. Top three first.",
          fact: "issues",
          to: `${EOS_PATHS.l10}#issues`,
        },
        {
          name: "Next steps",
          minutes: 15,
          what: "Who does what by when. Who tells the rest of the company what changed.",
          fact: "todos",
          to: `${EOS_PATHS.l10}#todos`,
        },
        {
          name: "Conclude",
          minutes: 15,
          what: "Each person: feedback on the day, were expectations met, rate it 1 to 10.",
          fact: null,
          to: null,
        },
      ],
    },
    annual: {
      label: "Annual",
      every: "Once a year · two days, off site",
      steps: [
        {
          name: "Segue",
          minutes: 15,
          what: "Best news from the year, what is working and what is not, expectations for these two days.",
          fact: null,
          to: null,
          day: 1,
        },
        {
          name: "Review last year",
          minutes: 60,
          what: "The 1-year plan: revenue, profit and each goal, hit or missed.",
          fact: "goals",
          to: EOS_PATHS.vision,
          day: 1,
        },
        {
          name: "Review last quarter",
          minutes: 60,
          what: "Each Rock: done or not done.",
          fact: "quarter",
          to: `${EOS_PATHS.l10}#rocks`,
          day: 1,
        },
        {
          name: "Team health",
          minutes: 120,
          what: "Each person says the one thing each teammate does best and the one thing to change. Check the Accountability Chart and the People Analyzer.",
          fact: null,
          to: EOS_PATHS.people,
          day: 1,
        },
        {
          name: "Strengths and Issues List",
          minutes: 60,
          what: "Strengths, weaknesses, opportunities and threats. Everything that is not a strength goes to Issues.",
          fact: "issues",
          to: `${EOS_PATHS.l10}#issues`,
          day: 1,
        },
        {
          name: "V/TO through the 1-year plan",
          minutes: 180,
          what: "Rework the V/TO top to bottom, then set next year's revenue, profit and 3 to 7 goals.",
          fact: "vision",
          to: EOS_PATHS.vision,
          day: 1,
        },
        {
          name: "Set next quarter's Rocks",
          minutes: 120,
          what: "3 to 7 company Rocks that move the 1-year plan, each with one owner.",
          fact: "rocks",
          to: `${EOS_PATHS.l10}#rocks`,
          day: 2,
        },
        {
          name: "Tackle key issues",
          minutes: 180,
          what: "IDS the most important issues for the year ahead.",
          fact: "issues",
          to: `${EOS_PATHS.l10}#issues`,
          day: 2,
        },
        {
          name: "Next steps",
          minutes: 15,
          what: "Who does what by when, and who tells the company.",
          fact: "todos",
          to: `${EOS_PATHS.l10}#todos`,
          day: 2,
        },
        {
          name: "Conclude",
          minutes: 15,
          what: "Feedback, were expectations met, rate the two days 1 to 10.",
          fact: null,
          to: null,
          day: 2,
        },
      ],
    },
  };

const KEY = "capsule.eos.session";

type Running = {
  kind: Kind;
  step: number;
  stepStartedAt: number;
};

function readRunning(): Running | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Running) : null;
  } catch {
    return null;
  }
}

function writeRunning(state: Running | null) {
  try {
    if (state) sessionStorage.setItem(KEY, JSON.stringify(state));
    else sessionStorage.removeItem(KEY);
  } catch {
    // The session still runs; it just won't survive a reload.
  }
}

function clock(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(
    hours ? 2 : 1,
    "0",
  );
  const seconds = String(total % 60).padStart(2, "0");
  return `${ms < 0 ? "+" : ""}${hours ? `${hours}:` : ""}${minutes}:${seconds}`;
}

function length(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [
    hours ? `${hours} hr${hours === 1 ? "" : "s"}` : "",
    rest ? `${rest} min` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The quarterly and annual planning days from Traction: the agenda with the
 * book's times, what Capsule already knows for each part, a link to the tool
 * that part uses, and a session mode with a timer for the part you are on.
 */
export function PlanningSession({
  rows,
  visionWritten,
  oneYearGoals,
  now,
}: {
  rows: readonly LeadershipItemRow[];
  visionWritten: number;
  oneYearGoals: number;
  now: Date;
}) {
  const [running, setRunning] = useState<Running | null>(() => readRunning());
  const [params] = useSearchParams();
  const asked = params.get("session") === "annual" ? "annual" : "quarterly";
  const [picked, setPicked] = useState<Kind>(running?.kind ?? asked);
  const { hash, search } = useLocation();
  useEffect(() => {
    setPicked(asked);
    if (hash === "#planning-session")
      document
        .getElementById("planning-session")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Each time a rhythm link is followed.
  }, [hash, search, asked]);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const kind = running?.kind ?? picked;
  const session = SESSIONS[kind];
  const total = session.steps.reduce((sum, step) => sum + step.minutes, 0);

  const since = quarterStart(now).getTime();
  const live = rows.filter((row) => row.deletedAt == null);
  const rocks = live.filter(
    (row) =>
      row.kind === "rock" &&
      (row.status === "open" || (row.closedAt ?? 0) >= since),
  );
  const done = rocks.filter((row) => row.status === "done").length;
  const openRocks = rocks.filter((row) => row.status === "open").length;
  const issues = live.filter(
    (row) => row.kind === "issue" && row.status === "open",
  );
  const parked = issues.filter((row) => row.parkedAt != null).length;
  const todos = live.filter(
    (row) => row.kind === "todo" && row.status === "open",
  ).length;
  const facts: Facts = {
    quarter:
      rocks.length === 0
        ? "No Rocks this quarter yet."
        : `${done} of ${rocks.length} Rocks done (${Math.round((done / rocks.length) * 100)}%).`,
    vision: `${visionWritten} of 10 V/TO parts written.`,
    rocks: `${openRocks} Rock${openRocks === 1 ? "" : "s"} open now.`,
    issues: `${issues.length} open issue${issues.length === 1 ? "" : "s"}, ${parked} on the long-term list.`,
    todos: `${todos} to-do${todos === 1 ? "" : "s"} open.`,
    goals: `The 1-year plan has ${oneYearGoals} goal${oneYearGoals === 1 ? "" : "s"}.`,
  };

  const save = (next: Running | null) => {
    writeRunning(next);
    setRunning(next);
    setTick(Date.now());
  };
  const go = (step: number) =>
    running && save({ ...running, step, stepStartedAt: Date.now() });

  const current = running ? session.steps[running.step] : undefined;
  const left = current
    ? current.minutes * 60_000 - (tick - running!.stepStartedAt)
    : 0;
  const last = running ? running.step === session.steps.length - 1 : false;

  return (
    <EosPanel
      tone="traction"
      id="planning-session"
      eyebrow={session.every}
      title={`${session.label} planning session`}
      lead={`The agenda from Traction, ${length(total)} in all. Each part shows where Mangia stands now and opens the tool it uses.`}
      actions={
        <>
          <div className="eos-switch" role="group" aria-label="Session">
            {(Object.keys(SESSIONS) as Kind[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={kind === key}
                disabled={running != null && running.kind !== key}
                onClick={() => setPicked(key)}
              >
                {SESSIONS[key].label}
              </button>
            ))}
          </div>
          {running ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => save(null)}
            >
              End session
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => save({ kind, step: 0, stepStartedAt: Date.now() })}
            >
              Start the session
            </button>
          )}
        </>
      }
    >
      {running && current ? (
        <div className="eos-session-now">
          <div className="min-w-0">
            <span className="eos-eyebrow">
              Part {running.step + 1} of {session.steps.length}
              {current.day ? ` · day ${current.day}` : ""}
            </span>
            <p className="text-xl font-bold text-ink">{current.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`eos-timer${left < 0 ? " is-over" : ""}`}
              title={left < 0 ? "Over time" : "Time left for this part"}
            >
              {clock(left)}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={running.step === 0}
              onClick={() => go(running.step - 1)}
            >
              Back
            </button>
            {last ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => save(null)}
              >
                Finish
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => go(running.step + 1)}
              >
                Next: {session.steps[running.step + 1]!.name}
              </button>
            )}
          </div>
        </div>
      ) : null}
      <ol className="eos-session-steps">
        {session.steps.map((step, index) => {
          const state = !running
            ? undefined
            : index < running.step
              ? "is-past"
              : index === running.step
                ? "is-now"
                : undefined;
          return (
            <li key={step.name + index} className={state}>
              <button
                type="button"
                className="eos-session-step"
                disabled={!running}
                aria-current={state === "is-now" ? "step" : undefined}
                onClick={() => go(index)}
              >
                <span className="eos-session-num">{index + 1}</span>
                <span className="min-w-0">
                  <strong>{step.name}</strong>
                  <span className="eos-session-time">
                    {step.day ? `Day ${step.day} · ` : ""}
                    {length(step.minutes)}
                  </span>
                  <span className="block text-sm text-ink-2">{step.what}</span>
                </span>
              </button>
              {step.fact || step.to ? (
                <p className="eos-session-fact">
                  {step.fact ? facts[step.fact] : null}
                  {step.to ? (
                    <Link to={step.to} className="btn-link">
                      Open →
                    </Link>
                  ) : null}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </EosPanel>
  );
}
