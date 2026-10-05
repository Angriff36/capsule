// PL-CONNECTIONS (AC-344): Google Calendar keeps its token and sync rows in
// the manifestEvents ledger, and ALSO keeps the tenant's one
// IntegrationConnection row (provider google_calendar) in step, so every
// provider is read the same way: status, account, scopes, where the secret
// lives (never the secret), last successful sync and last error.
//
// Runs inside the same mutation that writes the ledger row, so the two never
// disagree. The connection steps are private / admin-only Manifest commands;
// they run as the tenant's system role for the tenant the manager already
// proved membership in (same as Stripe's recorded answers).
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

const PROVIDER = "google_calendar";

export type CalendarConnectionChange =
  | { kind: "connected"; calendarId: string; scopes: string | null }
  | { kind: "synced" }
  | { kind: "failed"; reason: string }
  | { kind: "disconnected" };

export async function mirrorCalendarConnection(
  ctx: MutationCtx,
  tenantId: string,
  change: CalendarConnectionChange,
): Promise<void> {
  const rows = await ctx.db
    .query("integrationConnections")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const row =
    rows.find((item) => item.provider === PROVIDER && item.deletedAt == null) ??
    null;
  const system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;

  if (change.kind === "connected") {
    let docId = row?._id ?? null;
    if (docId == null) {
      const created = (await system.runMutation(
        api.mutations.IntegrationConnection_createViaAuthorize,
        {
          provider: PROVIDER,
          displayName: "Google Calendar",
          credentialRef: "manifestEvents:GoogleCalendarConnected",
        },
      )) as { docId: Id<"integrationConnections"> };
      docId = created.docId;
    } else if (row?.status !== "pending") {
      await system.runMutation(
        api.mutations.IntegrationConnection_reauthorize,
        { docId },
      );
    }
    await system.runMutation(api.mutations.IntegrationConnection_markConnected, {
      docId,
      externalAccountId: change.calendarId,
      displayName: "Google Calendar",
      ...(change.scopes ? { scopes: change.scopes } : {}),
      chargesEnabled: false,
      payoutsEnabled: false,
    });
    return;
  }

  if (row == null) return;
  if (change.kind === "disconnected") {
    if (row.status === "revoked") return;
    await system.runMutation(api.mutations.IntegrationConnection_disconnect, {
      docId: row._id,
      reason: "Disconnected from Capsule",
    });
    return;
  }
  // A late sync result never revives a disconnected connection.
  if (row.status !== "connected" && row.status !== "error") return;
  if (change.kind === "synced") {
    await system.runMutation(
      api.mutations.IntegrationConnection_recordSyncSuccess,
      { docId: row._id },
    );
  } else {
    await system.runMutation(api.mutations.IntegrationConnection_recordFailure, {
      docId: row._id,
      reason: change.reason,
    });
  }
}
