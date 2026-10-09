import { useState, type FormEvent } from "react";
import {
  useCreateLeadershipMeeting,
  useLeadershipMeetingRevise,
} from "@/lib/manifest-convex-react";
import { Section } from "@/ui/primitives";
import { BoundedDateInput } from "@/ui/BoundedDateInputs";
import { formatDate } from "@/lib/format";
import { ReportsFailureBanner } from "./ReportsFailureBanner";
import {
  liveMeetings,
  weekStartOf,
  type LeadershipMeetingRow,
} from "./leadershipHistory";
import type { ScorecardPerson } from "./ScorecardTargetEditor";

/**
 * "Rate the meeting" from the owner's L10 sheet: the day, who ran it, a 1-10
 * score, what went well, what would make it better and the decisions made.
 * This week's meeting is written once and can be corrected; the history
 * table shows each week's score.
 */

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function dayInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function L10MeetingRating({
  meetings,
  people,
  now,
}: {
  meetings: readonly LeadershipMeetingRow[];
  people: readonly ScorecardPerson[];
  now: Date;
}) {
  const record = useCreateLeadershipMeeting();
  const revise = useLeadershipMeetingRevise();
  const weekStart = weekStartOf(now).getTime();
  const thisWeek = liveMeetings(meetings).find(
    (row) => (row.heldAt ?? 0) >= weekStart,
  );
  // Remount the form when this week's saved meeting changes, so it shows it.
  return (
    <div className="mt-6">
      <Section title="Rate the meeting">
        <MeetingForm
          key={`${thisWeek?._id ?? "new"}:${thisWeek?.version ?? 0}`}
          saved={thisWeek}
          people={people}
          now={now}
          onSave={(fields) =>
            thisWeek
              ? revise({
                  docId: thisWeek._id,
                  version: thisWeek.version,
                  ...fields,
                })
              : record(fields)
          }
        />
      </Section>
    </div>
  );
}

type MeetingFields = {
  heldAt: number;
  rating: number;
  facilitatorPersonId?: string;
  wentWell?: string;
  toImprove?: string;
  decisions?: string;
};

function MeetingForm({
  saved,
  people,
  now,
  onSave,
}: {
  saved: LeadershipMeetingRow | undefined;
  people: readonly ScorecardPerson[];
  now: Date;
  onSave: (fields: MeetingFields) => Promise<unknown>;
}) {
  const [rating, setRating] = useState<number | null>(saved?.rating ?? null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [missingScore, setMissingScore] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating == null) {
      setMissingScore(true);
      return;
    }
    const data = new FormData(event.currentTarget);
    const text = (name: string) =>
      String(data.get(name) ?? "").trim() || undefined;
    const day = String(data.get("heldAt") || dayInput(now.getTime()));
    setFailure(null);
    setBusy(true);
    try {
      await onSave({
        heldAt: new Date(`${day}T12:00:00`).getTime(),
        rating,
        facilitatorPersonId: text("facilitatorPersonId"),
        wentWell: text("wentWell"),
        toImprove: text("toImprove"),
        decisions: text("decisions"),
      });
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} data-testid="l10-rating">
      {failure ? <ReportsFailureBanner error={failure} /> : null}
      {saved ? (
        <p className="mb-2 text-xs text-ink-2">
          This week's meeting ({formatDate(saved.heldAt)}) is rated{" "}
          <strong className="text-ink">{saved.rating} out of 10</strong>. Change
          anything below and save.
        </p>
      ) : null}
      <fieldset className="mb-3">
        <legend className="field-label">How was it? (1 to 10)</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {SCORES.map((score) => (
            <button
              key={score}
              type="button"
              aria-pressed={rating === score}
              className={
                rating === score
                  ? "btn btn-primary min-w-10"
                  : "btn btn-secondary min-w-10"
              }
              onClick={() => {
                setRating(score);
                setMissingScore(false);
              }}
            >
              {score}
            </button>
          ))}
        </div>
        {missingScore ? (
          <p className="mt-1 text-xs text-danger">Pick a score from 1 to 10.</p>
        ) : null}
      </fieldset>
      <div className="supply-form-grid">
        <label className="field-label">
          Meeting day
          <BoundedDateInput
            name="heldAt"
            className="input"
            naturalDateDirection="any"
            defaultValue={dayInput(saved?.heldAt ?? now.getTime())}
          />
        </label>
        <label className="field-label">
          Who ran it
          <select
            name="facilitatorPersonId"
            className="input"
            defaultValue={saved?.facilitatorPersonId ?? ""}
          >
            <option value="">Not noted</option>
            {people.map((person) => (
              <option key={person._id} value={person._id}>
                {`${person.givenName} ${person.familyName}`.trim()}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          What went well?
          <input
            name="wentWell"
            className="input"
            defaultValue={saved?.wentWell ?? ""}
          />
        </label>
        <label className="field-label">
          What would make it better?
          <input
            name="toImprove"
            className="input"
            defaultValue={saved?.toImprove ?? ""}
          />
        </label>
        <label className="field-label">
          Decisions made
          <input
            name="decisions"
            className="input"
            defaultValue={saved?.decisions ?? ""}
          />
        </label>
        <div className="field-label">
          <span>&nbsp;</span>
          <button className="btn btn-secondary" disabled={busy}>
            {saved ? "Save changes" : "Save rating"}
          </button>
        </div>
      </div>
    </form>
  );
}
