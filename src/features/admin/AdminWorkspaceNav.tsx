import { WorkspaceTabs } from "../../ui/WorkspaceTabs";

const tabs = [
  { label: "Permissions", path: "/admin", end: true },
  { label: "Company", path: "/admin/branding" },
  { label: "Integrations", path: "/admin/integrations" },
  { label: "Announcements", path: "/admin/announcements" },
];

/** The one-time move from TPP and rare admin jobs sit under More. */
const more = [
  { label: "Data exports", path: "/admin/data-export" },
  { label: "Imports", path: "/admin/imports" },
  { label: "Compare with TPP", path: "/admin/parallel-run" },
  { label: "Match leftover items", path: "/admin/reconcile" },
  { label: "Switch from TPP", path: "/admin/cutover" },
];

export function AdminWorkspaceNav() {
  return (
    <WorkspaceTabs label="Administration workspace" tabs={tabs} more={more} />
  );
}
