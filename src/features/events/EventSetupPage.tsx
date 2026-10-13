import { Link } from "react-router-dom";
import { MergedSection } from "../../ui/MergedSection";
import { PageHeader } from "../../ui/primitives";
import { EventChecklistsPage } from "./EventChecklistsPage";
import { EventTemplatesPage } from "./EventTemplatesPage";
import { eventsIndexPath } from "./eventRoutes";
import { PlanningSetupPage } from "./planning/PlanningSetupPage";
import { ProposalTemplatesPage } from "../clients/ProposalTemplatesPage";

/**
 * The event setup library: templates, checklists and the planning board's
 * rules, which used to be three separate pages (docs/design/screen-map.md).
 */
export function EventSetupPage() {
  return (
    <div className="operations-stage space-y-8">
      <PageHeader
        title="Event setup"
        lead="Starting points and rules every event uses: event templates, reusable checklists, how the planning board checks a plan, and proposal templates."
        actions={
          <>
            <Link className="btn btn-ghost" to={eventsIndexPath()}>
              All events
            </Link>
            <Link className="btn btn-ghost" to="/events/tracker?view=plan">
              Planning board
            </Link>
          </>
        }
      />
      <MergedSection
        id="templates"
        title="Event templates"
        summary="Starting points for the events you do often."
        defaultOpen
      >
        <EventTemplatesPage />
      </MergedSection>
      <MergedSection
        id="checklists"
        title="Checklists"
        summary="Reusable to-do lists you put on an event."
        defaultOpen
      >
        <EventChecklistsPage />
      </MergedSection>
      <MergedSection
        id="planning"
        title="Planning rules"
        summary="How the planning board checks a plan and moves stages."
        defaultOpen
      >
        <PlanningSetupPage />
      </MergedSection>
      <MergedSection
        id="proposal-templates"
        title="Proposal templates"
        summary="Standard sections, terms and tax that every built proposal starts from."
      >
        <ProposalTemplatesPage />
      </MergedSection>
    </div>
  );
}
