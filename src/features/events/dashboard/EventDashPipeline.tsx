import { useNavigate } from "react-router-dom";
import type { Id } from "../../../lib/api";
import { useEventReadiness } from "../../../lib/useEventReadiness";
import type { EventDetailTab } from "../eventRoutes";
import { STAGE_LABEL, type EventStage } from "../eventStatus";
import { DASH_TRACK } from "./eventDashFacts";
import type { DashSheetId } from "./eventDashTypes";
import {
  eventStageGate,
  type StageGateExecution,
  type StageGateFacts,
  type StageGateFix,
} from "./eventStageGate";
import { EventStageRail, type StageRailGate } from "./EventStageRail";

type Props = {
  readonly eventId: Id<"events">;
  readonly facts: StageGateFacts;
  readonly openQuestions: number | undefined;
  readonly onOpenStage: () => void;
  readonly onTab: (tab: EventDetailTab) => void;
  readonly onOpenSheet: (sheet: DashSheetId) => void;
};

const STEPS = DASH_TRACK.map((stage) => STAGE_LABEL[stage]);

/** Where the event sits on the pipeline, what blocks the next stage, and the
 * review-question summary. */
export function EventDashPipeline(props: Props) {
  // Only the move into Executing reads the live readiness view.
  return props.facts.stage === "sales_lock" ? (
    <PipelineWithExecution {...props} />
  ) : (
    <Pipeline {...props} />
  );
}

function PipelineWithExecution(props: Props) {
  const projection = useEventReadiness(props.eventId);
  const execution: StageGateExecution | undefined =
    projection === undefined
      ? undefined
      : executionFacts(
          projection?.domains.find((entry) => entry.domain === "execution")
            ?.issues ?? [],
        );
  return <Pipeline {...props} facts={{ ...props.facts, execution }} />;
}

function executionFacts(
  issues: readonly { code: string; affectedIds: string[] }[],
): StageGateExecution {
  const ids = (code: string) =>
    issues
      .filter((issue) => issue.code === code)
      .flatMap((issue) => issue.affectedIds);
  return {
    prepTaskIds: ids("execution.prep_open"),
    packListIds: ids("execution.pack_open"),
    deliveryIds: ids("execution.delivery_open"),
  };
}

function Pipeline({
  facts,
  openQuestions,
  onOpenStage,
  onTab,
  onOpenSheet,
}: Props) {
  const navigate = useNavigate();
  const go = (to: StageGateFix) => {
    if (to.kind === "tab") onTab(to.tab);
    else if (to.kind === "sheet") onOpenSheet(to.sheet);
    else if (to.kind === "route") navigate(to.to);
    else focusSection(to.id);
  };
  const gate = eventStageGate(facts);
  const railGate: StageRailGate | null = gate
    ? {
        nextLabel: gate.nextLabel,
        checks: gate.checks?.map(({ fix, ...check }) => ({
          ...check,
          fix: fix ? { label: fix.label, onFix: () => go(fix.to) } : undefined,
        })),
      }
    : null;

  return (
    <section
      className="evd-pipe"
      aria-label="Pipeline stage"
      data-testid="event-pipeline-stage"
    >
      <EventStageRail
        steps={STEPS}
        current={DASH_TRACK.indexOf(facts.stage as EventStage)}
        gate={railGate}
      />
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

/** Scroll to a panel on the page and put focus on its first field. */
function focusSection(id: string) {
  const heading = document.getElementById(id);
  const section = heading?.closest("section") ?? heading;
  section?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  section
    ?.querySelector<HTMLElement>("input, select, textarea, button")
    ?.focus({ preventScroll: true });
}
