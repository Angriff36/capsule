import {
  useCreateOccasion,
  useCreateReferralSource,
  useCreateServiceStyle,
  useListOccasion,
  useListReferralSource,
  useListServiceStyle,
  useOccasionActivate,
  useOccasionDeactivate,
  useOccasionReviseDetails,
  useReferralSourceActivate,
  useReferralSourceDeactivate,
  useReferralSourceReviseDetails,
  useServiceStyleActivate,
  useServiceStyleDeactivate,
  useServiceStyleReviseDetails,
} from "../../lib/manifest-convex-react";
import { PageHeader } from "../../ui/primitives";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";
import { CatalogsSection, type CatalogRow } from "./CatalogsSection";

// Reference catalogs behind the event and lead selectors
// (dropdown-lists-and-their-admin-screen.md). Every selector that reads these
// lists (event create, the public quote form, lead capture) subscribes to the
// same live query, so an add, rename or retire here reaches them without a
// redeploy or reload.
export function CatalogsPage() {
  const serviceStyles = useListServiceStyle() as CatalogRow[] | undefined;
  const occasions = useListOccasion() as CatalogRow[] | undefined;
  const referralSources = useListReferralSource() as CatalogRow[] | undefined;
  const createServiceStyle = useCreateServiceStyle();
  const reviseServiceStyle = useServiceStyleReviseDetails();
  const retireServiceStyle = useServiceStyleDeactivate();
  const activateServiceStyle = useServiceStyleActivate();
  const createOccasion = useCreateOccasion();
  const reviseOccasion = useOccasionReviseDetails();
  const retireOccasion = useOccasionDeactivate();
  const activateOccasion = useOccasionActivate();
  const createReferralSource = useCreateReferralSource();
  const reviseReferralSource = useReferralSourceReviseDetails();
  const retireReferralSource = useReferralSourceDeactivate();
  const activateReferralSource = useReferralSourceActivate();

  return (
    <div className="operations-stage space-y-6">
      <PageHeader
        title="Catalogs"
        lead="Manage the reference lists behind event and lead dropdowns. Changes reach every selector immediately."
      />
      <AdminWorkspaceNav />
      <CatalogsSection
        title="Service styles"
        singular="service style"
        feeds="the event form and the public quote form read this list"
        rows={serviceStyles}
        commands={{
          register: createServiceStyle,
          revise: reviseServiceStyle,
          deactivate: retireServiceStyle,
          activate: activateServiceStyle,
        }}
      />
      <CatalogsSection
        title="Occasions"
        singular="occasion"
        feeds="the event form and the public quote form read this list"
        rows={occasions}
        commands={{
          register: createOccasion,
          revise: reviseOccasion,
          deactivate: retireOccasion,
          activate: activateOccasion,
        }}
      />
      <CatalogsSection
        title="Referral sources"
        singular="referral source"
        feeds="lead capture reads this list"
        rows={referralSources}
        commands={{
          register: createReferralSource,
          revise: reviseReferralSource,
          deactivate: retireReferralSource,
          activate: activateReferralSource,
        }}
      />
    </div>
  );
}
