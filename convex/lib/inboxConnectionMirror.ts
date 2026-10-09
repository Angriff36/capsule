// PL-CONNECTIONS (AC-344): client texts and client emails keep the tenant's
// one IntegrationConnection row (provider sms / email) in step, like Google
// Calendar does: the account is the company's texting number or Capsule inbox
// address, and every stored arrival is the "last successful sync". The Brand
// page reads it to say when the last client text or email came in.
//
// Runs inside the arrival mutation, as the tenant's system role (same as the
// calendar mirror). Capsule's own server keys are used, so no secret pointer.
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

export type InboxProvider = "sms" | "email";

const NAMES: Record<InboxProvider, string> = {
  sms: "Client texts",
  email: "Client emails",
};

export async function inboxConnection(
  ctx: QueryCtx,
  tenantId: string,
  provider: InboxProvider,
): Promise<Doc<"integrationConnections"> | null> {
  const rows = await ctx.db
    .query("integrationConnections")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  return (
    rows.find((row) => row.provider === provider && row.deletedAt == null) ??
    null
  );
}

/** When the last client text/email reached this account, or null. */
export async function lastInboxArrivalAt(
  ctx: QueryCtx,
  tenantId: string,
  provider: InboxProvider,
  account: string,
): Promise<number | null> {
  const row = await inboxConnection(ctx, tenantId, provider);
  if (!row || row.status !== "connected" || row.externalAccountId !== account)
    return null;
  return row.lastSuccessfulSyncAt ?? null;
}

/** A client text/email to `account` was stored for this company. */
export async function recordInboxArrival(
  ctx: MutationCtx,
  tenantId: string,
  provider: InboxProvider,
  account: string,
): Promise<void> {
  const row = await inboxConnection(ctx, tenantId, provider);
  const system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
  let docId: Id<"integrationConnections">;
  if (row == null) {
    const created = (await system.runMutation(
      api.mutations.IntegrationConnection_createViaAuthorize,
      { provider, displayName: NAMES[provider] },
    )) as { docId: Id<"integrationConnections"> };
    docId = created.docId;
  } else {
    docId = row._id;
    if (row.status === "revoked" || row.status === "disconnected") {
      await system.runMutation(
        api.mutations.IntegrationConnection_reauthorize,
        { docId },
      );
    }
  }
  if (
    row == null ||
    row.status !== "connected" ||
    row.externalAccountId !== account
  ) {
    await system.runMutation(api.mutations.IntegrationConnection_markConnected, {
      docId,
      externalAccountId: account,
      displayName: NAMES[provider],
      chargesEnabled: false,
      payoutsEnabled: false,
    });
  }
  await system.runMutation(
    api.mutations.IntegrationConnection_recordSyncSuccess,
    { docId },
  );
}
