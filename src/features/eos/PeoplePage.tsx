import { PageHeader } from "@/ui/primitives";
import { AccountabilityChart } from "./AccountabilityChart";
import { DelegateElevate } from "./DelegateElevate";
import { EosTabs } from "./EosShared";
import { PeopleAnalyzer } from "./PeopleAnalyzer";
import { useEosViewer } from "./useEosData";

/** EOS People: right people (core values) in the right seats (the chart). */
export function PeoplePage() {
  const { canEdit } = useEosViewer();
  return (
    <div className="operations-stage supply-stage">
      <EosTabs />
      <PageHeader
        eyebrow="EOS · People"
        title="Right people, right seats"
        lead={
          canEdit
            ? "Build the chart of seats, score each person against the core values and their seat, then free leaders up with Delegate and Elevate."
            : "Who owns each part of Mangia."
        }
      />
      <div className="eos-stack">
        <AccountabilityChart />
        <PeopleAnalyzer />
        <DelegateElevate />
      </div>
    </div>
  );
}
