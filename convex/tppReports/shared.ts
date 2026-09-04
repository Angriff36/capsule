import type { QueryCtx } from "../_generated/server";
import { getAuthContext } from "../lib/authContext";

export const REPORT_ROW_LIMIT = 2_000;
export const OPTION_ROW_LIMIT = 500;

export async function requireReportTenant(ctx: QueryCtx): Promise<string> {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || auth.role === "anonymous") {
    throw new Error("Sign in to run reports");
  }
  return auth.tenantId;
}

export function isLiveTenantRow(
  row: { tenantId: string; deletedAt?: number | null },
  tenantId: string,
): boolean {
  return row.tenantId === tenantId && row.deletedAt == null;
}

export function inDateRange(
  value: number | null | undefined,
  start: number,
  end: number,
): boolean {
  return value != null && value >= start && value <= end;
}
