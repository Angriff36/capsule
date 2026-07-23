import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import {
  useCreateOrganizationCapabilitySetting,
  useListOrganizationCapabilitySetting,
  useOrganizationCapabilitySettingSetEnabled,
} from "../../lib/manifest-convex-react";
import { ErrorState, PageHeader, Section } from "../../ui/primitives";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";
import { RolePermissionAudit } from "./RolePermissionAuditPanel";
import { TeamRolesPanel } from "./TeamRolesPanel";

const CAPABILITIES = [
  ["kitchen", "Kitchen", "Recipes, dishes, menus, and prep work."],
  ["inventory", "Inventory", "Stock, locations, demand, and waste."],
  ["procurement", "Procurement", "Vendors, purchase needs, and orders."],
  ["events", "Events", "Bookings, execution, staffing, and closeout."],
  ["sales", "Sales", "Clients, proposals, contracts, and pricing."],
  ["logistics", "Logistics", "Pack lists, deliveries, and dispatch."],
  ["workforce", "Workforce", "Roster, shifts, time, and qualifications."],
  ["finance", "Finance", "Invoices, payments, payroll, and reports."],
  ["reports", "Reports", "Saved reports and operational analysis."],
  ["administration", "Administration", "Organization and permission settings."],
] as const;
const ADMIN_ROLES = new Set(["admin", "owner", "system"]);

export function PermissionsPage() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const canEdit = ADMIN_ROLES.has(authStatus?.role ?? "");
  const people = useQuery(
    api.queries.listPerson,
    authStatus?.hasRole ? {} : "skip",
  );
  const rows = useListOrganizationCapabilitySetting();
  const createSetting = useCreateOrganizationCapabilitySetting();
  const setEnabled = useOrganizationCapabilitySettingSetEnabled();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settings = useMemo(
    () => new Map((rows ?? []).map((row) => [row.capability, row])),
    [rows],
  );

  if (authStatus === undefined || rows === undefined) {
    return (
      <QueryLoadState
        loadingTooLong={false}
        title="Loading permissions"
        detail="Reading organization settings."
      />
    );
  }

  async function toggle(
    capability: (typeof CAPABILITIES)[number][0],
    enabled: boolean,
  ) {
    if (!canEdit) return;
    setSaving(capability);
    setError(null);
    try {
      const existing = settings.get(capability);
      if (existing) await setEnabled({ docId: existing._id, enabled });
      else await createSetting({ capability, enabled });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this setting.",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="operations-stage space-y-6">
      <PageHeader
        title="Permissions"
        lead="Team roles decide what each person can do. Organization access switches turn whole domains off for everyone — commands fail closed and those areas leave the nav."
      />
      <AdminWorkspaceNav />
      {!canEdit && (
        <div className="card border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          Only a Capsule admin can change these settings.
        </div>
      )}
      {authStatus.hasRole ? (
        <div className="card border-line bg-inset px-4 py-3 text-[13px] text-ink-2">
          Your Capsule role is{" "}
          <strong className="text-ink">
            {String(authStatus.role).replaceAll("_", " ")}
          </strong>
          {roleSourceHint(authStatus.roleSource)}
        </div>
      ) : null}
      {error && <ErrorState title="Permission change failed" detail={error} />}
      <TeamRolesPanel people={people} canEdit={canEdit} />
      <Section title="Organization access">
        <div className="border-b border-line px-4 py-3 text-[12px] leading-relaxed text-ink-3">
          Off means nobody in this organization can use that domain (including
          admins), until you turn it back on here. Administration stays in the
          nav so you can always reach this page.
        </div>
        <div className="divide-y divide-line">
          {CAPABILITIES.map(([id, label, detail]) => {
            const enabled = settings.get(id)?.enabled ?? true;
            const busy = saving === id;
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
                <div>
                  <p className="font-medium text-ink">{label}</p>
                  <p className="mt-1 text-[12px] text-ink-3">{detail}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={`${label} permission`}
                  aria-checked={enabled}
                  disabled={!canEdit || busy}
                  onClick={() => void toggle(id, !enabled)}
                  className={`relative h-7 w-12 rounded-full border transition ${enabled ? "border-ok bg-ok" : "border-line-2 bg-inset"} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${enabled ? "left-[23px]" : "left-0.5"}`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </Section>
      {canEdit ? (
        <RolePermissionAudit
          members={people ?? []}
          loading={people === undefined}
        />
      ) : null}
    </div>
  );
}

function roleSourceHint(roleSource: string | undefined): string {
  if (roleSource === "person") {
    return " (from team record in app settings).";
  }
  if (roleSource === "idp") {
    return " (temporary sign-in fallback — hire and link this account under Team roles).";
  }
  return ".";
}
