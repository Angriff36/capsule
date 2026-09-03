import { resolveManifestPolicies } from "../admin/rolePermissionAudit";
import type { ReportSubjectArea } from "./ReportCreateForm";

/**
 * OrganizationCapability id that owns each live-report subject.
 *
 * Subject ids are not capability ids. The Production subject reads PrepTask
 * records, which belong to the "kitchen" capability
 * (convex/lib/orgCapabilityGate.ts OrgCapabilityId); there is no "production"
 * capability, so checking the subject id meant a tenant with Kitchen switched
 * off still rendered shared Production reports as truthful-looking zeros
 * instead of an unavailable source.
 */
export const REPORT_SUBJECT_CAPABILITY: Record<ReportSubjectArea, string> = {
  events: "events",
  sales: "sales",
  inventory: "inventory",
  production: "kitchen",
  workforce: "workforce",
  logistics: "logistics",
  finance: "finance",
};

export function reportSubjectCapability(subject: ReportSubjectArea): string {
  return REPORT_SUBJECT_CAPABILITY[subject];
}

/** False when the tenant switched off the capability behind this subject. */
export function isReportSubjectCapabilityEnabled(
  subject: ReportSubjectArea,
  disabledCapabilities: readonly string[] | undefined,
): boolean {
  return !disabledCapabilities?.includes(reportSubjectCapability(subject));
}

/**
 * A saved definition is shareable, its source records are not: the reader's
 * role and the tenant's capability switches decide whether the live rows may
 * be read at all. False renders the unavailable-source state, never zeros.
 */
export function canReadReportSubject(
  subject: ReportSubjectArea,
  role: string,
  disabledCapabilities: readonly string[] | undefined,
): boolean {
  if (!isReportSubjectCapabilityEnabled(subject, disabledCapabilities)) {
    return false;
  }
  const permissions = new Set(resolveManifestPolicies(role));
  if (subject === "events") {
    return permissions.has("eventAccess") || permissions.has("salesAccess");
  }
  if (subject === "sales") return permissions.has("salesAccess");
  if (subject === "inventory") {
    return (
      permissions.has("inventoryAccess") || permissions.has("manageAccess")
    );
  }
  if (subject === "production") {
    return permissions.has("kitchenAccess") || permissions.has("manageAccess");
  }
  if (subject === "workforce") return permissions.has("workforceAccess");
  if (subject === "logistics") {
    return (
      permissions.has("logisticsAccess") || permissions.has("manageAccess")
    );
  }
  return permissions.has("financeAccess") || permissions.has("manageAccess");
}
