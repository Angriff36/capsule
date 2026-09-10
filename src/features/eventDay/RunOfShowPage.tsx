import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  EventDayActivity,
  EventDayPerson,
} from "../../lib/eventDayBriefing";
import { useEventDayBriefing } from "../../lib/eventDayBriefing";
import { formatTime } from "../../lib/format";
import {
  useCompleteRunTask,
  useCreateRunTasks,
  useReopenRunTask,
} from "../../lib/eventTimelineRun";
import { BATTLE_BOARD_TASK_TEMPLATES } from "../events/battleBoardTaskTemplates";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { formatAssigneeLabel } from "../events/timelineAssigneeOptions";
import "./EventDay.css";
import { EventDayNav } from "./EventDayNav";
import {
  alertSpeech,
  alertsDue,
  categoryLabel,
  deriveRunView,
  effectiveStart,
  filterMine,
  loadRunSettings,
  planFromTemplates,
  saveRunSettings,
  sortForRun,
  type RunAlert,
  type RunAlertKind,
  type RunSettings,
} from "./runOfShowModel";
import { RunSettingsSheet } from "./RunSettingsSheet";

const FIRED_KEY = "evd.run.fired.v1";

/** Fired alert keys live for the browser session: a re-render or a tab
 * return never replays old moments, but a fresh open stays useful. */
function loadFired(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveFired(fired: Set<string>): void {
  try {
    window.sessionStorage.setItem(FIRED_KEY, JSON.stringify([...fired]));
  } catch {
    // Session-only storage; losing it is harmless.
  }
}

/** Device speech, no dependency. iOS needs one user gesture first — the
 * arm button is that gesture. */
function speak(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    synth.speak(utterance);
  } catch {
    // No voice on this device; the visual alerts still fire.
  }
}

function vibrate(kind: RunAlertKind): void {
  if (typeof navigator.vibrate !== "function") return;
  navigator.vibrate(
    kind === "overdue" ? [360, 120, 360, 120, 360] : [220, 90, 220],
  );
}

type AlarmTone = { start: () => void; stop: () => void };

/** Repeating beep until stopped. Built inside the arm tap so mobile
 * browsers unlock the audio context. */
function createAlarmTone(): AlarmTone | null {
  try {
    const AudioCtor = window.AudioContext;
    if (typeof AudioCtor !== "function") return null;
    const ctx = new AudioCtor();
    let timer: number | null = null;
    const beep = () => {
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    };
    return {
      start: () => {
        if (timer != null) return;
        beep();
        timer = window.setInterval(beep, 900);
      },
      stop: () => {
        if (timer != null) window.clearInterval(timer);
        timer = null;
      },
    };
  } catch {
    return null;
  }
}

function windowLine(start: number | null, end: number | null): string {
  if (start == null) return "—";
  return end != null
    ? `${formatTime(start)}–${formatTime(end)}`
    : formatTime(start);
}

function personLabel(person: EventDayPerson | undefined): string {
  if (!person) return "Staff";
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ") || "Staff"
  );
}

/**
 * Run of show — the minute-by-minute tracker. The crew opens this on the
 * phone during the event: it answers "what are we doing right now?" and
 * calls the next task out by voice, buzz, or alarm.
 */
export function RunOfShowPage() {
  const { id } = useParams();
  const briefing = useEventDayBriefing(id);
  const [now, setNow] = useState(() => Date.now());
  const [settings, setSettingsState] = useState<RunSettings>(loadRunSettings);
  const [armed, setArmed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [alarm, setAlarm] = useState<RunAlert | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [generating, setGenerating] = useState(false);
  const firedRef = useRef<Set<string>>(loadFired());
  const toneRef = useRef<AlarmTone | null>(null);

  const complete = useCompleteRunTask();
  const reopen = useReopenRunTask();
  const createTasks = useCreateRunTasks();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const setSettings = (next: RunSettings) => {
    setSettingsState(next);
    saveRunSettings(next);
  };

  const rows = useMemo(() => {
    const all = briefing?.activities ?? [];
    return all.filter(
      (row) => row.deletedAt == null && effectiveStart(row) != null,
    );
  }, [briefing]);

  const meId = briefing?.me.personId ?? null;
  const scoped = useMemo(
    () =>
      settings.scope === "me" && meId != null ? filterMine(rows, meId) : rows,
    [rows, settings.scope, meId],
  );
  const view = useMemo(() => deriveRunView(scoped, now), [scoped, now]);

  const peopleById = useMemo(
    () =>
      new Map((briefing?.people ?? []).map((person) => [person._id, person])),
    [briefing],
  );
  const whoLabel = (row: EventDayActivity) =>
    formatAssigneeLabel({
      teams: row.assigneeTeams ?? [],
      personNames: (row.assigneePersonIds ?? []).map((personId) =>
        personLabel(peopleById.get(personId)),
      ),
      fallback: row.responsibleParty,
    });

  useEffect(() => {
    if (!armed) return;
    for (const alert of alertsDue(scoped, settings, now)) {
      if (firedRef.current.has(alert.key)) continue;
      firedRef.current.add(alert.key);
      saveFired(firedRef.current);
      if (settings.vibrate) vibrate(alert.kind);
      if (settings.voice) speak(alertSpeech(alert, settings.leadMinutes));
      if (settings.alarm) {
        setAlarm((current) => current ?? alert);
        toneRef.current?.start();
      }
    }
  }, [armed, now, scoped, settings]);

  const arm = () => {
    if (toneRef.current == null) toneRef.current = createAlarmTone();
    if (settings.voice) speak("Run of show alerts on.");
    setArmed(true);
  };

  const tryChannels = () => {
    if (toneRef.current == null) toneRef.current = createAlarmTone();
    if (settings.vibrate) vibrate("start");
    if (settings.voice) speak("Now: taste the sauce. F O H and B O H.");
    if (settings.alarm) {
      setAlarm({
        key: "test",
        kind: "start",
        row: {
          _id: "test",
          version: null,
          eventId: "",
          deletedAt: null,
          scheduledAt: null,
          startsAt: null,
          endsAt: null,
          sortOrder: 0,
          name: "Test task",
          category: null,
          notes: null,
          siteNotes: null,
          assigneeTeams: [],
          assigneePersonIds: [],
          responsibleParty: null,
          completedAt: null,
          completedByPersonId: null,
        },
      });
      toneRef.current?.start();
    }
  };

  const dismissAlarm = () => {
    toneRef.current?.stop();
    setAlarm(null);
  };

  const markDone = async (row: EventDayActivity) => {
    setBusyId(row._id);
    setFailure(null);
    try {
      await complete({
        docId: row._id,
        version: row.version ?? undefined,
        completedByPersonId: meId ?? undefined,
      });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    }
    setBusyId(null);
  };

  const markOpen = async (row: EventDayActivity) => {
    setBusyId(row._id);
    setFailure(null);
    try {
      await reopen({ docId: row._id, version: row.version ?? undefined });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    }
    setBusyId(null);
  };

  const generate = async () => {
    if (!briefing || typeof briefing.event.startsAt !== "number") return;
    setGenerating(true);
    setFailure(null);
    try {
      await createTasks(
        planFromTemplates(
          BATTLE_BOARD_TASK_TEMPLATES,
          String(briefing.event._id),
          briefing.event.startsAt,
        ),
      );
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    }
    setGenerating(false);
  };

  if (briefing === undefined)
    return (
      <div className="evd">
        <div className="evd-frame">
          <p className="evd-empty">Lighting the estate…</p>
        </div>
      </div>
    );
  if (briefing === null)
    return (
      <div className="evd">
        <div className="evd-frame">
          <p className="evd-empty">
            This event is unavailable —{" "}
            <Link className="evd-open-link" to="/event-day">
              choose an event
            </Link>
          </p>
        </div>
      </div>
    );

  const event = briefing.event;
  const started = typeof event.startsAt === "number";
  const allDone = rows.length > 0 && view.doneCount === view.total;

  return (
    <div className="evd">
      <div className="evd-frame">
        <header className="evd-run-head">
          <Link
            className="evd-run-back"
            to={`/event-day/${event._id}`}
            aria-label="Back to event map"
          >
            ←
          </Link>
          <div className="evd-run-titlewrap">
            <h1 className="evd-run-title">{String(event.title ?? "Event")}</h1>
            <p className="evd-run-sub">Run of show</p>
          </div>
          <span className="evd-run-clock">{formatTime(now)}</span>
          <button
            type="button"
            className={`evd-run-arm${armed ? " evd-run-arm-on" : ""}`}
            onClick={armed ? () => setShowSettings(true) : arm}
          >
            {armed ? "On" : "Arm alerts"}
          </button>
          <button
            type="button"
            className="evd-run-gear"
            aria-label="Alert settings"
            onClick={() => setShowSettings(true)}
          >
            ⚙
          </button>
        </header>

        {failure ? (
          <div className="evd-run-failure">
            <FailureBanner
              failure={failure}
              onDismiss={() => setFailure(null)}
            />
          </div>
        ) : null}

        {view.total > 0 ? (
          <div className="evd-run-progress">
            <div className="evd-run-progress-bar">
              <div
                className="evd-run-progress-fill"
                style={{
                  width: `${Math.round((view.doneCount / view.total) * 100)}%`,
                }}
              />
            </div>
            <p className="evd-run-progress-label">
              {view.doneCount} of {view.total} done
            </p>
          </div>
        ) : null}

        <div className="evd-run-body">
          {rows.length === 0 ? (
            <div className="evd-run-card">
              <p className="evd-run-empty">
                No run of show yet.
                {started
                  ? " Build one from the standard blocks, then move times in Capsule."
                  : " Set an event start time first."}
              </p>
              {started ? (
                <button
                  type="button"
                  className="evd-run-btn"
                  disabled={generating}
                  onClick={() => void generate()}
                >
                  {generating ? "Building…" : "Build run of show"}
                </button>
              ) : null}
            </div>
          ) : null}

          {allDone ? (
            <div className="evd-run-now evd-run-now-clear">
              <p className="evd-run-kicker">All clear</p>
              <p className="evd-run-name">Every task is done.</p>
            </div>
          ) : view.current ? (
            <NowCard
              row={view.current}
              who={whoLabel(view.current)}
              busy={busyId === view.current._id}
              onDone={() => {
                const row = view.current;
                if (row) void markDone(row);
              }}
            />
          ) : view.upcoming[0] ? (
            <NextCard
              row={view.upcoming[0]}
              who={whoLabel(view.upcoming[0])}
              now={now}
            />
          ) : null}

          {view.overdue.length > 0 ? (
            <section className="evd-run-card evd-run-card-late">
              <p className="evd-run-card-kicker">
                Late — {view.overdue.length} open
              </p>
              {view.overdue.map((row) => (
                <TaskRow
                  key={row._id}
                  row={row}
                  now={now}
                  who={whoLabel(row)}
                  busy={busyId === row._id}
                  onDone={() => void markDone(row)}
                  late
                />
              ))}
            </section>
          ) : null}

          {view.current && view.upcoming.length > 0 ? (
            <section className="evd-run-card">
              <p className="evd-run-card-kicker">Next</p>
              {view.upcoming.map((row) => (
                <TaskRow
                  key={row._id}
                  row={row}
                  now={now}
                  who={whoLabel(row)}
                  busy={busyId === row._id}
                  onDone={() => void markDone(row)}
                />
              ))}
            </section>
          ) : null}

          {rows.length > 0 ? (
            <section className="evd-run-card">
              <p className="evd-run-card-kicker">Whole run of show</p>
              {sortForRun(scoped).map((row) => (
                <TaskRow
                  key={row._id}
                  row={row}
                  now={now}
                  who={whoLabel(row)}
                  busy={busyId === row._id}
                  onDone={() => void markDone(row)}
                  onReopen={() => void markOpen(row)}
                />
              ))}
            </section>
          ) : null}
        </div>

        <EventDayNav eventId={String(event._id)} active="run" />
      </div>

      {showSettings ? (
        <RunSettingsSheet
          settings={settings}
          hasMe={meId != null}
          onChange={setSettings}
          onTry={tryChannels}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      {alarm ? (
        <div className="evd-alarm">
          <div className="evd-alarm-card">
            <p className="evd-alarm-kicker">
              {alarm.kind === "overdue"
                ? "Still open"
                : alarm.kind === "lead"
                  ? "Coming up"
                  : "Now"}
            </p>
            <p className="evd-alarm-name">{String(alarm.row.name ?? "Task")}</p>
            {whoLabel(alarm.row).trim().length > 0 ? (
              <p className="evd-alarm-who">{whoLabel(alarm.row)}</p>
            ) : null}
            <div className="evd-alarm-actions">
              <button
                type="button"
                className="evd-run-btn"
                onClick={() => {
                  dismissAlarm();
                  if (alarm.row._id !== "test") void markDone(alarm.row);
                }}
              >
                Done
              </button>
              <button
                type="button"
                className="evd-run-btn evd-run-btn-ghost"
                onClick={dismissAlarm}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function notesOf(row: EventDayActivity): string {
  return [row.notes, row.siteNotes]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function countdownLine(start: number | null, nowMs: number): string {
  if (start == null) return "";
  const minutes = Math.round((start - nowMs) / 60_000);
  if (minutes <= 0) return "starting now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `in ${hours} h ${minutes % 60} min`;
}

function TaskRow({
  row,
  now,
  who,
  busy,
  onDone,
  onReopen,
  late,
}: {
  row: EventDayActivity;
  now: number;
  who: string;
  busy: boolean;
  onDone: () => void;
  onReopen?: () => void;
  late?: boolean;
}) {
  const done = row.completedAt != null;
  const start = effectiveStart(row);
  const category = categoryLabel(row.category);
  return (
    <button
      type="button"
      className={[
        "evd-run-row",
        done ? "evd-run-row-done" : "",
        late ? "evd-run-row-late" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={done ? onReopen : onDone}
      disabled={busy}
    >
      <span className="evd-run-row-time">
        {done
          ? `✓ ${formatTime(row.completedAt)}`
          : start != null
            ? formatTime(start)
            : "—"}
      </span>
      <span className="evd-run-row-main">
        <span className="evd-run-row-name">
          {String(row.name ?? "Task")}
          {category ? ` · ${category}` : ""}
        </span>
        {who.trim().length > 0 ? (
          <span className="evd-run-row-sub">{who}</span>
        ) : null}
      </span>
      {!done ? <span className="evd-run-row-mark">Done</span> : null}
    </button>
  );
}

/** The big "what are we doing right now" card. */
function NowCard({
  row,
  who,
  busy,
  onDone,
}: {
  row: EventDayActivity;
  who: string;
  busy: boolean;
  onDone: () => void;
}) {
  const end = row.endsAt != null ? Number(row.endsAt) : null;
  const notes = notesOf(row);
  const category = categoryLabel(row.category);
  return (
    <div className="evd-run-now">
      <p className="evd-run-kicker">
        Now
        {category ? <span className="evd-run-chip">{category}</span> : null}
      </p>
      <p className="evd-run-name">{String(row.name ?? "Task")}</p>
      <p className="evd-run-when">{windowLine(effectiveStart(row), end)}</p>
      {who.trim().length > 0 ? <p className="evd-run-who">{who}</p> : null}
      {notes.length > 0 ? <p className="evd-run-notes">{notes}</p> : null}
      <button
        type="button"
        className="evd-run-btn"
        disabled={busy}
        onClick={onDone}
      >
        {busy ? "Saving…" : "Done"}
      </button>
    </div>
  );
}

/** When nothing is in flight, the next task takes the big card. */
function NextCard({
  row,
  who,
  now,
}: {
  row: EventDayActivity;
  who: string;
  now: number;
}) {
  const start = effectiveStart(row);
  const notes = notesOf(row);
  const category = categoryLabel(row.category);
  return (
    <div className="evd-run-now evd-run-now-clear">
      <p className="evd-run-kicker evd-run-kicker-next">
        Up next
        {category ? <span className="evd-run-chip">{category}</span> : null}
      </p>
      <p className="evd-run-name">{String(row.name ?? "Task")}</p>
      <p className="evd-run-when">
        {start != null ? formatTime(start) : "—"}
        {start != null ? ` · ${countdownLine(start, now)}` : ""}
      </p>
      {who.trim().length > 0 ? <p className="evd-run-who">{who}</p> : null}
      {notes.length > 0 ? <p className="evd-run-notes">{notes}</p> : null}
    </div>
  );
}
