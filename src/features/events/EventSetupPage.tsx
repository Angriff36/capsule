import { Link } from "react-router-dom";
import { MergedSection } from "../../ui/MergedSection";
import { PageHeader } from "../../ui/primitives";
import { EventChecklistsPage } from "./EventChecklistsPage";
import { EventTemplatesPage } from "./EventTemplatesPage";
import { eventsIndexPath } from "./eventRoutes";
import { PlanningSetupPage } from "./planning/PlanningSetupPage";

/**
 * The event setup library: templates, checklists and the planning board's
 * rules, which used to be three separate pages (docs/design/screen-map.md).
 */
export function EventSetupPage() {
  return (
    <div className="operations-stage space-y-8">
      <PageHeader
        title="Event setup"
        lead="Starting points and rules every event uses: event templates, reusable checklists, and how the planning board checks a plan."
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
      <MergedSection id="templates" title="Event templates">
        <EventTemplatesPage />
      </MergedSection>
      <MergedSection id="checklists" title="Checklists">
        <EventChecklistsPage />
      </MergedSection>
      <MergedSection id="planning" title="Planning rules">
        <PlanningSetupPage />
      </MergedSection>
    </div>
  );
}
