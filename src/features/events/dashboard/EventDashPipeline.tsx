import { STAGE_LABEL } from "../eventStatus";
import { DASH_TRACK } from "./eventDashFacts";

const CHECK = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m5 12 5 5 9-10" />
  </svg>
);

/** Where the event sits on the pipeline, with the review-question summary. */
export function EventDashPipeline({
  stage,
  openQuestions,
  onOpenStage,
}: {
  readonly stage: string;
  readonly openQuestions: number | undefined;
  readonly onOpenStage: () => void;
}) {
  const current = DASH_TRACK.indexOf(stage as (typeof DASH_TRACK)[number]);
  return (
    <section
      className="evd-pipe"
      aria-label="Pipeline stage"
      data-testid="event-pipeline-stage"
    >
      <ol className="evd-steps">
        {DASH_TRACK.map((key, index) => {
          const state =
            current < 0
              ? ""
              : index < current
                ? "done"
                : index === current
                  ? "now"
                  : "";
          return (
            <li
              key={key}
              className={`evd-step ${state}`}
              aria-current={state === "now" ? "step" : undefined}
            >
              <i className="evd-dot">{state === "done" ? CHECK : index + 1}</i>
              {STAGE_LABEL[key]}
            </li>
          );
        })}
      </ol>
      <div className="evd-pipe-foot">
        <span>
          <i
            className={`evd-okdot${openQuestions ? " warn" : ""}`}
            aria-hidden="true"
          />
          {openQuestions === undefined
            ? "Loading open questions…"
            : openQuestions === 0
              ? "No open questions on this event"
              : `${openQuestions} open question${openQuestions === 1 ? "" : "s"} waiting on a decision`}
        </span>
        <button type="button" className="evd-btn sm" onClick={onOpenStage}>
          Stage actions
        </button>
      </div>
    </section>
  );
}
