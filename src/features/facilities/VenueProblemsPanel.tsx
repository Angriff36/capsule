import { useState } from "react";
import type { Doc } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useCreateVenueNote,
  useVenueNoteCloseProblem,
} from "../../lib/manifest-convex-react";
import {
  ESCALATION_CASES,
  ESCALATION_LEVELS,
  HARD_RULES,
  problemStatus,
  type EscalationLevel,
} from "./venueEscalation";

const LEVELS = [1, 2, 3, 4] as const;

/**
 * Problems at a partner venue (playbook section 14): report one with its
 * level, see who handles it and by when, and close it with what was done.
 */
export function VenueProblemsPanel({
  venue,
  notes,
  run,
  busy,
}: {
  venue: Doc<"venues">;
  notes: Doc<"venueNotes">[];
  run: (key: string, work: () => Promise<unknown>) => Promise<void>;
  busy: string | null;
}) {
  const postNote = useCreateVenueNote();
  const closeProblem = useVenueNoteCloseProblem();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<EscalationLevel>(1);
  const [text, setText] = useState("");
  const [closing, setClosing] = useState<string | null>(null);
  const [closeText, setCloseText] = useState("");

  const status = problemStatus({
    venueId: String(venue._id),
    notes,
    contacts: notes,
    now: Date.now(),
    formatDate,
  });

  const report = () =>
    void run("problem", async () => {
      await postNote({
        venueId: venue._id,
        category: "incident",
        content: text.trim(),
        visibility: "internal",
        isPinned: level >= 3 ? true : undefined,
        escalationLevel: level,
      });
      setText("");
      setLevel(1);
      setOpen(false);
    });

  const close = (note: Doc<"venueNotes">) =>
    void run(`close:${note._id}`, async () => {
      await closeProblem({
        docId: note._id,
        version: note.version,
        resolution: closeText.trim(),
      });
      setClosing(null);
      setCloseText("");
    });

  return (
    <div className="space-y-3" data-testid="venue-problems">
      <h3 className="text-sm font-semibold text-ink">
        Problems at this venue
        {status.open.length > 0 ? ` · ${status.open.length} open` : ""}
      </h3>

      {status.reminders.length > 0 ? (
        <ul className="space-y-1 rounded-sm border border-warn/40 bg-warn-soft p-2 text-sm text-ink">
          {status.reminders.map((reminder, index) => (
            <li key={`${index}-${reminder}`}>{reminder}</li>
          ))}
        </ul>
      ) : null}

      {status.open.length > 0 ? (
        <ul className="space-y-2">
          {status.open.map(({ note, level, dueAt, overdue }) => (
            <li
              key={note._id}
              className={`space-y-2 rounded-sm border p-3 text-sm ${overdue ? "border-warn" : "border-line"}`}
            >
              <p className="font-semibold text-ink">
                {level
                  ? `Level ${level} · ${ESCALATION_LEVELS[level].name}`
                  : "Problem (no level)"}
                <span className="font-normal text-ink-3">
                  {` · ${formatDate(Number(note.postedAt))}`}
                </span>
              </p>
              <p className="whitespace-pre-line text-ink-2">{note.content}</p>
              {level ? (
                <p className="text-ink-3">
                  {ESCALATION_LEVELS[level].who}.{" "}
                  {ESCALATION_LEVELS[level].speed}
                  {dueAt != null && level < 4
                    ? ` (by ${formatDate(dueAt)} ${formatTime(dueAt)})`
                    : ""}
                  .
                </p>
              ) : null}
              {closing === note._id ? (
                <div className="space-y-2">
                  <label className="field-label">
                    <span>
                      {level != null && level >= 3
                        ? "What happened, what was done, the outcome, and how we stop it happening again"
                        : "What was done"}
                    </span>
                    <textarea
                      className="input min-h-[4rem] py-2"
                      value={closeText}
                      onChange={(event) => setCloseText(event.target.value)}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={busy != null || !closeText.trim()}
                      onClick={() => close(note)}
                    >
                      {busy === `close:${note._id}`
                        ? "Saving…"
                        : "Close the problem"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => setClosing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={busy != null}
                  onClick={() => {
                    setClosing(note._id);
                    setCloseText("");
                  }}
                >
                  It is settled
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="space-y-3 rounded-sm border border-line p-3">
          <label className="field-label">
            <span>Common case (optional)</span>
            <select
              className="input"
              defaultValue=""
              onChange={(event) => {
                const picked = ESCALATION_CASES[Number(event.target.value)];
                if (!picked) return;
                setLevel(picked.level);
                setText((current) =>
                  current.trim() ? current : `${picked.label}. `,
                );
              }}
            >
              <option value="">Pick one to set the level</option>
              {ESCALATION_CASES.map((item, index) => (
                <option key={item.label} value={index}>
                  {item.label} (level {item.level})
                </option>
              ))}
            </select>
          </label>
          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold text-ink">Level</legend>
            {LEVELS.map((value) => (
              <label key={value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="escalationLevel"
                  className="mt-1"
                  checked={level === value}
                  onChange={() => setLevel(value)}
                />
                <span>
                  <span className="font-semibold text-ink">
                    {value} · {ESCALATION_LEVELS[value].name}:
                  </span>{" "}
                  <span className="text-ink-2">
                    {ESCALATION_LEVELS[value].covers}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-ink-3">
            {ESCALATION_LEVELS[level].who}. {ESCALATION_LEVELS[level].speed}.
            {ESCALATION_CASES.filter(
              (item) => text.startsWith(item.label) && item.level === level,
            ).map((item) => ` ${item.todo}`)}
          </p>
          <label className="field-label">
            <span>What happened</span>
            <textarea
              className="input min-h-[4rem] py-2"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Venue manager says our van blocked the fire lane on Saturday."
            />
          </label>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-3">
            {HARD_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy != null || !text.trim()}
              onClick={report}
            >
              {busy === "problem" ? "Saving…" : "Save the problem"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-ghost"
          type="button"
          disabled={busy != null}
          onClick={() => setOpen(true)}
        >
          Report a problem
        </button>
      )}
    </div>
  );
}
