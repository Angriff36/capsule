import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/ui/primitives";
import { EosFirstRock } from "./EosFirstRock";
import { EosFirstWrite } from "./EosFirstWrite";
import { EosJargon, EosJargonGlossary } from "./EosJargon";
import type { EosJourney, EosJourneyStep } from "./EosJourney";

function RocksWord() {
  return <EosJargon term="Rocks" means={EosJargonGlossary.rocks} />;
}

function L10Word() {
  return <EosJargon term="L10" means={EosJargonGlossary.l10} />;
}

function hintFor(
  next: EosJourneyStep | null,
  ready: boolean,
  canEdit: boolean,
): ReactNode {
  if (ready) return "Run the weekly meeting. The rest is below.";
  if (!canEdit) return undefined;
  if (next?.id === "vision") return "Type in the box below.";
  if (next?.id === "seats")
    return "Open People, click Edit on a box, and pick the person.";
  if (next?.id === "rocks") return "Type in the box below.";
  return (
    <>
      Open <L10Word /> & <RocksWord /> and start this week's meeting.
    </>
  );
}

function stepLabel(step: EosJourneyStep): ReactNode {
  if (step.id === "rocks") {
    return (
      <>
        Set this quarter's <RocksWord />
      </>
    );
  }
  return step.label;
}

/**
 * The four-step path on EOS home. The current step is a typing box or one
 * button under the list, not a scavenger hunt through the tabs.
 */
export function EosStartHere({
  journey,
  canEdit,
}: {
  journey: EosJourney;
  canEdit: boolean;
}) {
  const ready = journey.allReady();
  const next = journey.nextStep();
  const writeHere = canEdit && !ready && next?.id === "vision";
  const rockHere = canEdit && !ready && next?.id === "rocks";
  const sendAway =
    canEdit && !ready && next && next.id !== "vision" && next.id !== "rocks";
  return (
    <section className="eos-panel eos-tone-vision">
      <EmptyState
        title={ready ? "The basics are in" : "Start here"}
        hint={hintFor(next, ready, canEdit)}
        steps={journey.steps().map((step) => ({
          label: stepLabel(step),
          done: step.done,
        }))}
      />
      {writeHere ? <EosFirstWrite /> : null}
      {rockHere ? <EosFirstRock /> : null}
      {sendAway && next ? (
        <div className="px-4 pb-6">
          <Link to={next.to} className="btn btn-primary">
            {next.action}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
