// Tenant-scoped outside-service readiness for the switch check (spec §6.6,
// issue #386). Moved out of convex/cutover.ts unchanged for PL-CUTOVER.
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Tenant-scoped provider readiness for the cutover gate (spec §6.6, issue
 * #386). Derived ONLY from the evidence of the calling tenant: canonical
 * `integrationConnections` rows (a tenant-scoped table) and the
 * manifestEvents connect/disconnect/reconcile rows whose entityId is this
 * tenant (the Calendar and QBO connection ledger). Latest event wins: a
 * historic connect never overrules a later disconnect or revocation, and
 * sync evidence belongs to the CURRENT engagement only — a reconcile
 * qualifies only when it happened at or after the latest connect and
 * carries that connection's id whenever both payloads identify one, so the
 * clean sync of a previous engagement never rides a reconnect. A provider
 * the tenant never engaged is unneeded and cannot block cutover.
 */
export interface ProviderReadiness {
  passed: boolean;
  message: string;
  blockers: string[];
  warnings: string[];
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: "Stripe",
  quickbooks: "QuickBooks",
  google_calendar: "Calendar",
  email: "Email",
  sms: "SMS",
  nowsta: "Nowsta",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

/** Providers whose connection state lives in the manifestEvents ledger. */
const LEDGER_PROVIDERS: Array<{
  provider: string;
  entity: string;
  connectedType: string;
  disconnectedType: string;
  reconciledType: string;
}> = [
  {
    provider: "google_calendar",
    entity: "GoogleCalendarConnection",
    connectedType: "GoogleCalendarConnected",
    disconnectedType: "GoogleCalendarDisconnected",
    reconciledType: "GoogleCalendarReconciled",
  },
  {
    provider: "quickbooks",
    entity: "QuickBooksConnection",
    connectedType: "QuickBooksConnected",
    disconnectedType: "QuickBooksDisconnected",
    reconciledType: "QuickBooksReconciled",
  },
];

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload != null &&
    typeof payload === "object" &&
    !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function payloadNumber(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
}

function payloadText(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function evaluateProviderReadiness(
  db: QueryCtx["db"],
  tenantId: string,
): Promise<ProviderReadiness> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const lines: string[] = [];

  // Canonical connections of this tenant only; freshest row per provider.
  const canonicalRows = await db
    .query("integrationConnections")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const canonicalByProvider = new Map<string, Doc<"integrationConnections">>();
  for (const row of canonicalRows) {
    if (row.deletedAt != null) continue;
    const current = canonicalByProvider.get(row.provider);
    const rowTime = row.updatedAt ?? row._creationTime;
    const currentTime = current
      ? (current.updatedAt ?? current._creationTime)
      : -1;
    if (!current || rowTime > currentTime) {
      canonicalByProvider.set(row.provider, row);
    }
  }

  // The ledger rows of this tenant only: entityId is the tenant id for
  // connection lifecycle and reconcile events, so rows of any other tenant
  // can never appear here.
  const ledgerRows = await db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
    .collect();

  const ledgerByProvider = new Map<
    string,
    {
      engaged: boolean;
      connected: boolean;
      lastReconcile: {
        at: number;
        failed: number | null;
        error: string | null;
      } | null;
    }
  >();
  for (const spec of LEDGER_PROVIDERS) {
    const rows = ledgerRows.filter((row) => row.entity === spec.entity);

    // Latest lifecycle event decides engagement: a historic connect never
    // overrules a later disconnect or revocation.
    const lifecycle = rows
      .filter(
        (row) =>
          row.type === spec.connectedType || row.type === spec.disconnectedType,
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    const connect = lifecycle?.type === spec.connectedType ? lifecycle : null;
    const connectConnectionId = connect
      ? payloadText(payloadRecord(connect.payload) ?? {}, "connectionId")
      : null;

    // Sync evidence belongs to the current engagement only: a reconcile
    // qualifies when it happened at or after the latest connect AND carries
    // that connection's id whenever both payloads identify one. The clean
    // sync of a previous engagement therefore never qualifies a reconnect.
    const reconcile = connect
      ? rows
          .filter(
            (row) =>
              row.type === spec.reconciledType &&
              row.createdAt >= connect.createdAt,
          )
          .sort((left, right) => right.createdAt - left.createdAt)
          .find((row) => {
            const reconcileConnectionId = payloadText(
              payloadRecord(row.payload) ?? {},
              "connectionId",
            );
            return (
              connectConnectionId == null ||
              reconcileConnectionId == null ||
              reconcileConnectionId === connectConnectionId
            );
          })
      : undefined;

    const reconcilePayload = reconcile
      ? payloadRecord(reconcile.payload)
      : null;
    ledgerByProvider.set(spec.provider, {
      engaged: lifecycle != null,
      connected: connect != null,
      lastReconcile: reconcile
        ? {
            at: reconcile.createdAt,
            failed: reconcilePayload
              ? payloadNumber(reconcilePayload, "failed")
              : null,
            error: reconcilePayload
              ? payloadText(reconcilePayload, "error")
              : null,
          }
        : null,
    });
  }

  const providers = new Set<string>([
    ...canonicalByProvider.keys(),
    ...ledgerByProvider.keys(),
  ]);
  for (const provider of providers) {
    const label = PROVIDER_LABELS[provider] ?? provider;
    const canonical = canonicalByProvider.get(provider);
    const ledger = ledgerByProvider.get(provider) ?? null;
    if (canonical == null && ledger?.engaged !== true) continue;

    const connected =
      canonical != null
        ? canonical.status === "connected"
        : (ledger?.connected ?? false);

    if (!connected) {
      const state = canonical ? canonical.status : "disconnected";
      blockers.push(
        `${label} is ${state} but this workspace has used it. Connect it again or take it off before you switch.`,
      );
      lines.push(`${label}: ${state}`);
      continue;
    }

    // Connected: the current engagement must hold healthy sync evidence —
    // connecting alone never substitutes for a successful sync on THIS
    // connection.
    if (ledger != null) {
      if (ledger.lastReconcile == null) {
        blockers.push(
          `${label} is connected but no sync has completed since it was connected. Sync it before you switch.`,
        );
        lines.push(`${label}: connected, nothing synced yet`);
        continue;
      }
      const failed = ledger.lastReconcile.failed ?? 0;
      if (failed > 0 || ledger.lastReconcile.error != null) {
        blockers.push(
          failed > 0
            ? `${label} is connected but its latest sync failed (${failed} item(s)). Sync clean before you switch.`
            : `${label} is connected but its latest sync reported an error: ${ledger.lastReconcile.error}.`,
        );
        lines.push(`${label}: sync failed`);
        continue;
      }
    }
    if (
      canonical != null &&
      canonical.lastErrorAt != null &&
      (canonical.lastSuccessfulSyncAt == null ||
        canonical.lastErrorAt > canonical.lastSuccessfulSyncAt)
    ) {
      blockers.push(
        `${label} is connected but its latest sync failed: ${canonical.lastErrorMessage ?? "unknown error"}.`,
      );
      lines.push(`${label}: sync failed`);
      continue;
    }
    if (
      provider === "stripe" &&
      canonical != null &&
      !(canonical.chargesEnabled && canonical.payoutsEnabled)
    ) {
      blockers.push(
        `${label} is connected but cannot accept charges and payouts yet. Finish Stripe setup before you switch.`,
      );
      lines.push(`${label}: not payout-ready`);
      continue;
    }
    lines.push(`${label}: connected`);
  }

  const message =
    blockers.length > 0
      ? `Outside services need attention: ${blockers.join(" ")}`
      : lines.length > 0
        ? `Outside services: ${lines.join("; ")}`
        : "No outside services in use (OK to switch)";

  return { passed: blockers.length === 0, message, blockers, warnings };
}
