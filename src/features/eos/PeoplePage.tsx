import { PageHeader } from "@/ui/primitives";
import { AccountabilityChart } from "./AccountabilityChart";
import { DelegateElevate } from "./DelegateElevate";
import { EosTabs } from "./EosShared";
import { PeopleAnalyzer } from "./PeopleAnalyzer";
import { useEosSeatsNamed } from "./useEosJourney";
import { useEosViewer } from "./useEosData";

/** EOS People: seats first; scoring and handing work off after names are in. */
export function PeoplePage() {
  const { canEdit } = useEosViewer();
  const named = useEosSeatsNamed();
  const showTools = named === true;
  return (
    <div className="operations-stage supply-stage">
      <EosTabs />
      <PageHeader
        eyebrow="EOS · People"
        title="Who does each job"
        lead={
          showTools
            ? "Score people against the jobs, then hand work off."
            : canEdit
              ? "This pyramid is the jobs. Click Edit on a box and pick the person."
              : "Who owns each part of Mangia."
        }
      />
      <div className="eos-stack">
        <AccountabilityChart />
        {named === undefined ? null : showTools ? (
          <>
            <PeopleAnalyzer />
            <DelegateElevate />
          </>
        ) : null}
      </div>
    </div>
  );
}
