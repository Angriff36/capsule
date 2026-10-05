import { useState, type FormEvent } from "react";
import type { Doc } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useCreateVenueNote,
  useListVenueNote,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { Section } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import {
  CLIENT_QUESTIONS,
  DEBRIEF_FIELDS,
  clientFeedbackNote,
  clientFeedbackRequest,
  debriefNote,
  followUpApplies,
  followUpSteps,
  thankYouText,
  type FollowUpStepState,
} from "./venueFollowUp";

const when = (time: number) => `${formatDate(time)} ${formatTime(time)}`;

const smsLink = (phone: string | null | undefined, body: string) =>
  phone
    ? `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`
    : null;

const text = (data: FormData, key: string) => String(data.get(key) ?? "");

function StepHeader({ step }: { step: FollowUpStepState }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
      <span
        className={`text-xs ${step.done ? "text-ok" : step.late ? "font-semibold text-warn" : "text-ink-3"}`}
      >
        {step.done
          ? `Done ${when(Number(step.done.postedAt))}${step.done.authorName ? ` by ${step.done.authorName}` : ""}`
          : step.late
            ? `Late: was due ${when(step.dueAt)}`
            : `Due by ${when(step.dueAt)}`}
      </span>
    </div>
  );
}

function DoneNote({ step }: { step: FollowUpStepState }) {
  return step.done ? (
    <p className="whitespace-pre-line rounded-sm bg-inset p-2 text-sm text-ink-2">
      {step.done.content}
    </p>
  ) : null;
}

/**
 * After an event at a partner venue: thank the venue, get the client's
 * answers about the venue, debrief the team (Venue Partner Playbook section
 * 13). Each step is saved as a note in the venue file, linked to this event.
 */
export function EventVenueFollowUpCard(props: {
  eventId: string;
  venue: Doc<"venues"> | null | undefined;
  stage: string;
  startsAt?: number | null;
  endsAt?: number | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  people:
    | readonly { _id: string; givenName: string; familyName: string }[]
    | undefined;
}) {
  const { venue } = props;
  const notes = useListVenueNote();
  const postNote = useCreateVenueNote();
  const auth = useAuthStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [highlight, setHighlight] = useState(
    "The food and service went perfectly.",
  );
  const [issue, setIssue] = useState("");
  const now = Date.now();

  if (
    !venue ||
    !followUpApplies({
      partnerTier: venue.partnerTier,
      stage: props.stage,
      startsAt: props.startsAt,
      now,
    })
  )
    return null;

  const me = (props.people ?? []).find(
    (person) => String(person._id) === String(auth?.personId ?? ""),
  );
  const repName = me
    ? [me.givenName, me.familyName].filter(Boolean).join(" ")
    : "";
  const venueId = venue._id;
  const thanks = thankYouText({
    contactName: venue.contactName,
    venueName: venue.name,
    highlight,
    issue,
    repName,
  });
  const request = clientFeedbackRequest({
    clientName: props.clientName,
    venueName: venue.name,
    repName,
  });
  const [thankStep, debriefStep, feedbackStep] = followUpSteps({
    venueId: String(venueId),
    eventId: props.eventId,
    endedAt: props.endsAt ?? props.startsAt ?? now,
    notes: notes ?? [],
    now,
  });

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const post = (
    category: "thank_you" | "client_feedback" | "debrief" | "incident",
    content: string,
    rating?: number,
  ) =>
    postNote({
      venueId,
      eventId: props.eventId,
      category,
      content,
      visibility: "internal",
      rating,
    });

  const saveFeedback = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    const score = text(data, "rating");
    const rating = score ? Number(score) : undefined;
    const content = clientFeedbackNote({
      rating,
      answers: Object.fromEntries(
        CLIENT_QUESTIONS.map(([key]) => [key, text(data, key)]),
      ),
    });
    if (!content) return;
    void run("feedback", () => post("client_feedback", content, rating));
  };

  const saveDebrief = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    const answers = Object.fromEntries(
      DEBRIEF_FIELDS.map(([key]) => [key, text(data, key)]),
    );
    const content = debriefNote(answers);
    if (!content) return;
    const damage = String(answers.damage ?? "").trim();
    void run("debrief", async () => {
      await post("debrief", content);
      // Playbook step 4: every damage goes on record in the venue file.
      if (damage)
        await post("incident", `Damage or loss after the event: ${damage}`);
    });
  };

  const thankSms = smsLink(venue.contactPhone, thanks);
  const requestSms = smsLink(props.clientPhone, request);

  return (
    <Section title={`Venue follow-up · ${venue.name}`}>
      <div className="space-y-5 p-4" data-testid="event-venue-follow-up">
        <p className="text-sm text-ink-3">
          {venue.name} is a partner venue. After every event there: thank the
          venue within a day, debrief the team within two days, and ask the
          client about the venue within three days. Each step is saved in the
          venue file.
        </p>
        {failure ? <FailureBanner failure={failure} /> : null}

        {thankStep ? (
          <div className="space-y-2">
            <StepHeader step={thankStep} />
            {thankStep.done ? (
              <DoneNote step={thankStep} />
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="field-label">
                    <span>What went well</span>
                    <input
                      className="input"
                      name="highlight"
                      value={highlight}
                      onChange={(change) => setHighlight(change.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>Anything to flag (optional)</span>
                    <input
                      className="input"
                      name="issue"
                      value={issue}
                      onChange={(change) => setIssue(change.target.value)}
                      placeholder="Late load-in at the side door"
                    />
                  </label>
                </div>
                <p className="rounded-sm bg-inset p-2 text-sm text-ink-2">
                  {thanks}
                </p>
                <div className="flex flex-wrap gap-2">
                  {thankSms ? (
                    <a className="btn btn-secondary" href={thankSms}>
                      Text {venue.contactName || "the venue"}
                    </a>
                  ) : (
                    <span className="self-center text-xs text-ink-3">
                      No venue phone on file. Copy the text and send it your
                      way.
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void navigator.clipboard?.writeText(thanks)}
                  >
                    Copy text
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy != null}
                    onClick={() =>
                      void run("thanks", () => post("thank_you", thanks))
                    }
                  >
                    {busy === "thanks" ? "Saving…" : "Mark thank-you sent"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {debriefStep ? (
          <div className="space-y-2">
            <StepHeader step={debriefStep} />
            {debriefStep.done ? (
              <DoneNote step={debriefStep} />
            ) : (
              <form className="space-y-2" onSubmit={saveDebrief}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DEBRIEF_FIELDS.map(([key, label]) => (
                    <label key={key} className="field-label">
                      <span>{label}</span>
                      <textarea
                        className="input min-h-[2.5rem] py-2"
                        name={key}
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy != null}
                >
                  {busy === "debrief" ? "Saving…" : "Save debrief"}
                </button>
              </form>
            )}
          </div>
        ) : null}

        {feedbackStep ? (
          <div className="space-y-2">
            <StepHeader step={feedbackStep} />
            {feedbackStep.done ? (
              <DoneNote step={feedbackStep} />
            ) : (
              <>
                <p className="whitespace-pre-line rounded-sm bg-inset p-2 text-sm text-ink-2">
                  {request}
                </p>
                <div className="flex flex-wrap gap-2">
                  {requestSms ? (
                    <a className="btn btn-secondary" href={requestSms}>
                      Text the client
                    </a>
                  ) : null}
                  {props.clientEmail ? (
                    <a
                      className="btn btn-secondary"
                      href={`mailto:${props.clientEmail}?subject=${encodeURIComponent(`How was ${venue.name}?`)}&body=${encodeURIComponent(request)}`}
                    >
                      Email the client
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void navigator.clipboard?.writeText(request)}
                  >
                    Copy questions
                  </button>
                </div>
                <form className="space-y-2" onSubmit={saveFeedback}>
                  <label className="field-label">
                    <span>Client's score for the venue and us (1-10)</span>
                    <select className="input" name="rating" defaultValue="">
                      <option value="">No score</option>
                      {Array.from({ length: 10 }, (_, index) => 10 - index).map(
                        (value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CLIENT_QUESTIONS.map(([key, question]) => (
                      <label key={key} className="field-label">
                        <span>{question}</span>
                        <textarea
                          className="input min-h-[2.5rem] py-2"
                          name={key}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy != null}
                  >
                    {busy === "feedback" ? "Saving…" : "Save client answers"}
                  </button>
                </form>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
