import { tenantIdFromIdentityClaims } from "../../../convex/lib/personAuthPick";

/** Decode a Clerk session JWT payload without verifying the signature. */
export function decodeJwtPayload(
  token: string | null | undefined,
): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Poll the session JWT until its tenant claim equals the chosen organization.
 * openWorkspace must not call attempt() until this returns true.
 */
export async function waitForSessionTenantClaim(opts: {
  organizationId: string;
  getToken: () => Promise<string | null | undefined>;
  tries?: number;
  delayMs?: number;
}): Promise<boolean> {
  const tries = opts.tries ?? 25;
  const delayMs = opts.delayMs ?? 40;
  for (let i = 0; i < tries; i++) {
    const claims = decodeJwtPayload(await opts.getToken());
    if (tenantIdFromIdentityClaims(claims) === opts.organizationId) {
      return true;
    }
    if (i < tries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}
