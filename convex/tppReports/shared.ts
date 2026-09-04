import type { QueryCtx } from "../_generated/server";
import { getAuthContext } from "../lib/authContext";
import { decrypt } from "../lib/encryption";

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

export async function decryptReportFields<T extends Record<string, unknown>>(
  ctx: unknown,
  entity: string,
  fields: readonly (keyof T & string)[],
  row: T,
): Promise<T> {
  const output = { ...row };
  for (const field of fields) {
    const raw = output[field];
    if (typeof raw !== "string") continue;
    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!envelope || typeof envelope !== "object") continue;
    const value = envelope as { v?: unknown; kid?: unknown; ct?: unknown };
    if (
      value.v !== 1 ||
      typeof value.kid !== "string" ||
      typeof value.ct !== "string"
    )
      continue;
    output[field] = (await decrypt(value.ct, value.kid, {
      ctx,
      entity,
      property: field,
    })) as T[keyof T & string];
  }
  return output;
}
