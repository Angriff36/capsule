/**
 * Maps primary nav paths to OrganizationCapability ids for shell filtering.
 * Must stay aligned with convex/lib/orgCapabilityGate.ts orgCapabilityForNavPath.
 * Administration stays visible so Permissions can turn domains back on.
 */
export class OrgCapabilityNavPolicy {
  capabilityForPath(path: string): string | null {
    if (path === "/" || path.startsWith("/my")) return null;
    if (path.startsWith("/admin")) return null;
    if (path.startsWith("/kitchen")) return "kitchen";
    if (path.startsWith("/inventory")) return "inventory";
    if (path.startsWith("/events")) return "events";
    if (path.startsWith("/logistics")) return "logistics";
    if (path.startsWith("/staff")) return "workforce";
    if (path.startsWith("/clients")) return "sales";
    if (path.startsWith("/finance")) return "finance";
    if (path.startsWith("/reports")) return "reports";
    if (path.startsWith("/facilities")) return null;
    return null;
  }

  isPathEnabled(
    path: string,
    disabledCapabilities: readonly string[] | undefined,
  ): boolean {
    const capability = this.capabilityForPath(path);
    if (capability === null) return true;
    if (!disabledCapabilities || disabledCapabilities.length === 0) return true;
    return !disabledCapabilities.includes(capability);
  }
}

export const orgCapabilityNavPolicy = new OrgCapabilityNavPolicy();
