import { WorkspaceTabs } from "../../ui/WorkspaceTabs";
import { FINANCE_ROUTES, FINANCE_SECTIONS } from "./financeRoutes";

/** Daily money work up front; the occasional books under More. */
const more = [
  { label: "Tips", path: FINANCE_ROUTES.tips },
  { label: "Tax", path: FINANCE_ROUTES.taxes },
  { label: "Attribution", path: FINANCE_ROUTES.revenueAttribution },
  { label: "Donations", path: FINANCE_ROUTES.donations },
];

export function FinanceWorkspaceNav() {
  return (
    <WorkspaceTabs
      label="Finance workspace"
      tabs={FINANCE_SECTIONS.map(({ label, path }) => ({ label, path }))}
      more={more}
    />
  );
}
