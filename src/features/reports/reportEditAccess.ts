import { resolveManifestPolicies } from "../admin/rolePermissionAudit";

export interface SavedReportEditViewer {
  /** Person id of the signed-in reader (authStatus.personId). */
  personId?: string | null;
  /** Capsule role of the signed-in reader (authStatus.role). */
  role?: string | null;
}

export interface SavedReportEditSubject {
  /** SavedReportDefinition.ownerId; null on legacy rows. */
  ownerId?: unknown;
}

/**
 * Mirrors the SavedReportDefinition.updateDefinition server guard
 * (`doc.ownerId == user.personId or roleAllows(user.role, "manageAccess")`).
 *
 * Team- and company-shared reports open for everyone who can read the subject,
 * so a viewer who does not own the report reaches the workspace; leaving Apply
 * enabled only sent them into that guard failure. Read-only in the UI must be
 * decided by the same rule the command enforces.
 */
export function canEditSavedReportDefinition(
  report: SavedReportEditSubject,
  viewer: SavedReportEditViewer | null | undefined,
): boolean {
  const personId =
    typeof viewer?.personId === "string" && viewer.personId.trim()
      ? viewer.personId
      : null;
  const ownerId =
    typeof report.ownerId === "string" && report.ownerId.trim()
      ? report.ownerId
      : null;
  if (ownerId != null && personId != null && ownerId === personId) return true;
  return resolveManifestPolicies(String(viewer?.role ?? "")).includes(
    "manageAccess",
  );
}

/** Shown in place of the Apply control for a non-owning viewer. */
export const SAVED_REPORT_READ_ONLY_NOTICE =
  "You can read this shared report, but only its owner (or a manager) can save a different date window or visualization.";
