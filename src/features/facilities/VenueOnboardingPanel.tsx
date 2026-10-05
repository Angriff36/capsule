import { useState } from "react";
import type { Doc } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useCreateVenueNote } from "../../lib/manifest-convex-react";
import { useDishesExclusiveToVenue } from "../../lib/useDishesByIds";
import type { EventLookupRow } from "./useEventsById";
import {
  AGREEMENT_PREFIX,
  FIRST_MEETING_PREFIX,
  MENU_READY_PREFIX,
  ONBOARDED_PREFIX,
  REVIEW_PREFIX,
  TEAM_BRIEF_PREFIX,
  onboardingStatus,
  teamBriefDraft,
  type OnboardingStepKey,
} from "./venueOnboarding";

/** The steps a person marks done; the others count from the venue file. */
const MARKS: Partial<
  Record<OnboardingStepKey, { prefix: string; button: string; text: string }>
> = {
  meeting: {
    prefix: FIRST_MEETING_PREFIX,
    button: "First meeting done",
    text: "Met the venue and walked the space",
  },
  menu: {
    prefix: MENU_READY_PREFIX,
    button: "Venue menu ready",
    text: "Venue menu agreed",
  },
  agreement: {
    prefix: AGREEMENT_PREFIX,
    button: "Agreement signed",
    text: "Partnership agreement signed",
  },
  review: {
    prefix: REVIEW_PREFIX,
    button: "30-day review done",
    text: "Reviewed the first month together",
  },
};

/**
 * Getting a new partner venue started (playbook section 04): the eight
 * steps after approval, with the playbook's week-by-week timeline.
 */
export function VenueOnboardingPanel({
  venue,
  notes,
  events,
  run,
  busy,
}: {
  venue: Doc<"venues">;
  notes: Doc<"venueNotes">[];
  events: EventLookupRow[];
  run: (key: string, work: () => Promise<unknown>) => Promise<void>;
  busy: string | null;
}) {
  const postNote = useCreateVenueNote();
  const dishes = useDishesExclusiveToVenue(String(venue._id));
  const [stepText, setStepText] = useState("");
  const [brief, setBrief] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const status = onboardingStatus({
    venue,
    notes,
    events,
    venueOnlyDishCount: dishes === undefined ? null : dishes.length,
    now: Date.now(),
    formatDate,
  });
  if (!status) return null;

  const mark = (prefix: string, fallback: string) =>
    void run(prefix, async () => {
      await postNote({
        venueId: venue._id,
        category: "check_in",
        content: `${prefix}${stepText.trim() || fallback}`,
        visibility: "internal",
      });
      setStepText("");
    });

  const saveBrief = () =>
    void run("brief", async () => {
      await postNote({
        venueId: venue._id,
        category: "logistics",
        content: `${TEAM_BRIEF_PREFIX}${(brief ?? "").trim()}`,
        visibility: "internal",
        isPinned: true,
      });
      setBrief(null);
    });

  if (status.finished && !showSteps) {
    return (
      <div className="space-y-1" data-testid="venue-onboarding">
        <h3 className="text-sm font-semibold text-ink">Getting started</h3>
        <p className="text-sm text-ink-3">
          Finished {formatDate(Number(status.finishedAt))}.{" "}
          <button
            className="link"
            type="button"
            onClick={() => setShowSteps(true)}
          >
            Show the steps
          </button>
        </p>
      </div>
    );
  }

  const open = status.steps.filter((step) => step.doneAt == null);
  const firstEvent = status.steps.find((step) => step.key === "firstEvent");
  const firstEventPast =
    firstEvent?.doneAt != null ||
    (firstEvent?.dueAt != null && firstEvent.dueAt <= Date.now());
  return (
    <div className="space-y-3" data-testid="venue-onboarding">
      <h3 className="text-sm font-semibold text-ink">
        Getting started: {status.doneCount} of {status.steps.length} steps done
      </h3>
      <ol className="space-y-2 rounded-sm border border-line p-3 text-sm">
        {status.steps.map((step, index) => (
          <li key={step.key} className="space-y-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-ink">
                {index + 1}. {step.label}
              </span>
              <span
                className={step.doneAt == null ? "text-ink-3" : "text-ink-2"}
              >
                {step.doneAt != null
                  ? `Done ${formatDate(step.doneAt)}`
                  : step.dueAt != null
                    ? `By ${formatDate(step.dueAt)}`
                    : "Open"}
              </span>
            </div>
            {step.doneAt == null ? (
              <p className="text-ink-3">
                {step.detail}
                {step.missing && step.missing.length > 0
                  ? `. Still blank: ${step.missing.join(", ")}`
                  : ""}
                {step.key === "site" ? ". Use Site visits on this page" : ""}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {status.reminders.length > 0 ? (
        <ul className="space-y-1 rounded-sm border border-warn/40 bg-warn-soft p-2 text-sm text-ink">
          {status.reminders.map((reminder) => (
            <li key={reminder}>{reminder}</li>
          ))}
        </ul>
      ) : null}

      {brief != null ? (
        <div className="space-y-2 rounded-sm border border-line p-3">
          <label className="field-label">
            <span>Brief for the team (pinned on the venue notes)</span>
            <textarea
              className="input min-h-[9rem] py-2"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy != null || !brief.trim()}
              onClick={saveBrief}
            >
              {busy === "brief" ? "Saving…" : "Save team brief"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setBrief(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {open.length > 0 ? (
        <>
          <label className="field-label">
            <span>What happened (optional)</span>
            <input
              className="input"
              value={stepText}
              onChange={(event) => setStepText(event.target.value)}
              placeholder="Met Sarah, walked both rooms; they book 40 weddings a year."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {open.map((step) => {
              if (step.key === "brief")
                return brief == null ? (
                  <button
                    key={step.key}
                    className="btn btn-secondary"
                    type="button"
                    disabled={busy != null}
                    onClick={() => setBrief(teamBriefDraft({ venue }))}
                  >
                    Write the team brief
                  </button>
                ) : null;
              const markStep = MARKS[step.key];
              if (!markStep) return null;
              // The 30-day review comes after the first event.
              if (step.key === "review" && !firstEventPast) return null;
              return (
                <button
                  key={step.key}
                  className="btn btn-secondary"
                  type="button"
                  disabled={busy != null}
                  onClick={() => mark(markStep.prefix, markStep.text)}
                >
                  {busy === markStep.prefix ? "Saving…" : markStep.button}
                </button>
              );
            })}
            {!status.finished ? (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy != null}
                onClick={() =>
                  mark(
                    ONBOARDED_PREFIX,
                    "Set up before these steps were tracked",
                  )
                }
              >
                {busy === ONBOARDED_PREFIX
                  ? "Saving…"
                  : "Already set up: mark finished"}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
