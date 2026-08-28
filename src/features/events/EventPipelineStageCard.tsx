import { CheckIcon } from "../../ui/icons";
import { StatusChip } from "../../ui/primitives";
import { STAGE_LABEL, type EventStage } from "./eventStatus";
import { EventOverviewCard } from "./EventOverviewCard";

/** The linear lifecycle. `cancelled` leaves the track, so it is not a step. */
const TRACK: readonly EventStage[] = [
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "closed_out",
];

type StepState = "done" | "current" | "todo";

/** Where the event sits on the pipeline, stage by stage. */
export function EventPipelineStageCard({ stage }: { readonly stage: string }) {
  const current = TRACK.indexOf(stage as EventStage);
  return (
    <EventOverviewCard
      title="Pipeline stage"
      aside={<StatusChip status={stage} />}
      testId="event-pipeline-stage"
    >
      <ol className="event-stage-track">
        {TRACK.map((key, index) => {
          const state: StepState =
            current === -1
              ? "todo"
              : index < current
                ? "done"
                : index === current
                  ? "current"
                  : "todo";
          return (
            <li
              key={key}
              className="event-stage-step"
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="event-stage-node">
                <span className="event-stage-dot">
                  {state === "done" ? (
                    <CheckIcon width={12} height={12} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="event-stage-label">{STAGE_LABEL[key]}</span>
              </span>
              {index < TRACK.length - 1 ? (
                <span className="event-stage-line" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
      {current === -1 ? (
        <p className="mt-3 text-sm text-ink-2">
          This event left the pipeline as{" "}
          {STAGE_LABEL[stage as EventStage] ?? stage}.
        </p>
      ) : null}
    </EventOverviewCard>
  );
}
