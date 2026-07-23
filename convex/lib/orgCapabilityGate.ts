/**
 * AUTHOR SEAM — org-wide domain kill-switches from OrganizationCapabilitySetting.
 *
 * Permissions UI writes enabled/disabled rows. getAuthContext loads disabled
 * capability ids onto the auth object; generated checkRole (patched) calls
 * orgCapabilityDeniesAction so domain policies fail closed when a switch is off.
 *
 * adminAccess / staffAccess / manageAccess are never gated — admins must always
 * be able to open Permissions and turn domains back on.
 */

export type OrgCapabilityId =
  | "kitchen"
  | "inventory"
  | "procurement"
  | "events"
  | "sales"
  | "logistics"
  | "workforce"
  | "finance"
  | "reports"
  | "administration";

const ACTION_PREFIX_TO_CAPABILITY: ReadonlyArray<
  readonly [string, OrgCapabilityId]
> = [
  ["kitchen", "kitchen"],
  ["inventory", "inventory"],
  ["procurement", "procurement"],
  ["event", "events"],
  ["sales", "sales"],
  ["logistics", "logistics"],
  ["workforce", "workforce"],
  ["finance", "finance"],
];

/** Map a Manifest policy action (e.g. salesAccess) to an org capability id. */
export function orgCapabilityForAction(action: string): OrgCapabilityId | null {
  if (
    action === "staffAccess" ||
    action === "manageAccess" ||
    action === "adminAccess"
  ) {
    return null;
  }
  for (const [prefix, capability] of ACTION_PREFIX_TO_CAPABILITY) {
    if (action.startsWith(prefix)) return capability;
  }
  return null;
}

/** True when the action is blocked by a disabled org capability. */
export function orgCapabilityDeniesAction(
  action: string,
  disabledCapabilities: unknown,
): boolean {
  if (!Array.isArray(disabledCapabilities) || disabledCapabilities.length === 0) {
    return false;
  }
  const capability = orgCapabilityForAction(action);
  if (capability === null) return false;
  return disabledCapabilities.includes(capability);
}

type CapabilityRow = {
  capability?: string;
  enabled?: boolean;
  deletedAt?: number | null;
};

/** Load capability ids that are explicitly disabled for this tenant. Missing row = allowed. */
export async function loadDisabledOrgCapabilities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { query: (table: "organizationCapabilitySettings") => any },
  tenantId: string,
): Promise<OrgCapabilityId[]> {
  const rows = (await db
    .query("organizationCapabilitySettings")
    .withIndex("by_tenantId", (q: { eq: (f: string, v: string) => unknown }) =>
      q.eq("tenantId", tenantId),
    )
    .collect()) as CapabilityRow[];

  const disabled: OrgCapabilityId[] = [];
  for (const row of rows) {
    if (row.deletedAt != null) continue;
    if (row.enabled !== false) continue;
    if (typeof row.capability !== "string" || row.capability.length === 0) {
      continue;
    }
    disabled.push(row.capability as OrgCapabilityId);
  }
  return disabled;
}

/** Nav / route area → org capability. Home, My Day, and Admin stay visible. */
export function orgCapabilityForNavPath(path: string): OrgCapabilityId | null {
  if (path === "/" || path.startsWith("/my")) return null;
  // Keep Admin reachable so Permissions can re-enable domains.
  if (path.startsWith("/admin") || path.startsWith("/facilities")) return null;
  if (path.startsWith("/kitchen")) return "kitchen";
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/events")) return "events";
  if (path.startsWith("/logistics")) return "logistics";
  if (path.startsWith("/staff")) return "workforce";
  if (path.startsWith("/clients")) return "sales";
  if (path.startsWith("/finance")) return "finance";
  if (path.startsWith("/reports")) return "reports";
  return null;
}
