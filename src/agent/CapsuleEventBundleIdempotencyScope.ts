import type { EventBundle } from "../lib/tppReports/eventBundle";
import { bundleIdentity } from "./CapsuleEventBundlePlan";

/**
 * The one idempotency scope for entering a TPP event bundle, shared by the
 * agent coordinator and the browser importer so a re-import through either
 * resumes the other's run.
 *
 * Tenant-scoped on purpose: the generated command idempotency cache is a
 * single table for every tenant and is consulted before the command's own
 * auth runs, so a scope built from the invoice number alone would hand
 * tenant B tenant A's cached result for the same TPP invoice number. The
 * tenant id is the stable Convex tenant id — never a display name.
 */
export function eventBundleIdempotencyScope(
  tenantId: string | null | undefined,
  header: EventBundle["header"],
): string {
  const tenant = tenantId?.trim() ?? "";
  if (tenant.length === 0) {
    throw new Error(
      "The import cannot start until your organization is known — sign in again and retry.",
    );
  }
  return `tpp:${tenant}:${bundleIdentity(header)}`;
}
