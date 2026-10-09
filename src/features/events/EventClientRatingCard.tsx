import { useState, type FormEvent } from "react";
import type { Id } from "../../lib/api";
import { useEventRecordClientRating } from "../../lib/manifest-convex-react";
import { Section } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * After the event, staff write down how the client rated it (1 to 5) and
 * what they said. It feeds the Company Scorecard "Client Satisfaction Score"
 * (target 4.7 / 5.0+). Shown once the event has started or is finished;
 * the score can be changed or cleared at any time.
 */
export function EventClientRatingCard({
  eventId,
  stage,
  startsAt,
  rating,
  note,
}: {
  readonly eventId: Id<"events">;
  readonly stage: string;
  readonly startsAt: number | null | undefined;
  readonly rating: number | null | undefined;
  readonly note: string | null | undefined;
}) {
  const record = useEventRecordClientRating();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [picked, setPicked] = useState<number | null>(rating ?? null);
  const finished = stage === "completed" || stage === "closed_out";
  const started = startsAt != null && startsAt <= Date.now();
  if (stage === "cancelled" || (!finished && !started)) return null;

  const save = async (score: number | null, text: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await record({
        docId: eventId,
        rating: score ?? undefined,
        note: score != null && text.trim() ? text.trim() : undefined,
      });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = String(new FormData(e.currentTarget).get("note") ?? "");
    void save(picked, text);
  };

  return (
    <Section title="How the client rated it">
      <form
        className="space-y-3"
        data-testid="event-client-rating"
        onSubmit={submit}
      >
        <p className="text-sm text-ink-2">
          {rating != null
            ? `The client gave this event ${rating} out of 5.`
            : "Ask the client how the event went and write down their score, 1 (poor) to 5 (excellent)."}
        </p>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Client's score"
        >
          {SCORES.map((score) => (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={picked === score}
              className={picked === score ? "btn btn-primary" : "btn btn-ghost"}
              disabled={busy}
              onClick={() => setPicked(score)}
            >
              {score}
            </button>
          ))}
        </div>
        <label className="field-label">
          What the client said (optional)
          <textarea
            name="note"
            className="input"
            rows={2}
            defaultValue={note ?? ""}
            disabled={busy}
          />
        </label>
        {failure ? (
          <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || picked == null}
          >
            Save score
          </button>
          {rating != null ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setPicked(null);
                void save(null, "");
              }}
            >
              Clear score
            </button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}
