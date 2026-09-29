import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/**
 * Governed state of the OAuth integrations (QuickBooks, Google Calendar),
 * shared by convex/qboSync.ts and convex/googleCalendar.ts. Created 2026-09-29.
 *
 * - The connection (consent id, account, sealed refresh token, last sync) is
 *   the tenant's IntegrationConnection row for the provider.
 * - What the provider holds per Capsule record is one IntegrationSyncRecord
 *   row per (provider, record type, record id).
 *
 * Both change only through generated commands, run as the tenant's system
 * identity: the reconcile is a scheduled worker with no user, and connect /
 * disconnect run after the seam's own manager check (which is who may change
 * these connections). Before 2026-09-29 the same state lived in hand-written
 * manifestEvents ledger rows; the seams still read those (same keys as before)
 * while no IntegrationConnection row exists, and copy them over on the next
 * scheduled sync. Nothing here writes a ledger row.
 */

export type OAuthProvider = "quickbooks" | "google_calendar";

export interface SealedValue {
  ciphertext: string;
  keyId: string;
}

/** The OAuth connection a seam works with, from either store. */
export interface OAuthConnection {
  tenantId: string;
  /** The consent id sync chains carry (legacy ledger: its connectionId). */
  connectionId: string;
  /** QuickBooks realm id / Google calendar id. */
  externalAccountId: string;
  connectedAt: number;
  connectedBy: string;
  refreshToken: SealedValue;
  /** Where it was read from. `ledger` means not yet moved to the entity. */
  source: "entity" | "ledger";
  /** Per-record ledger state has already been copied into IntegrationSyncRecord. */
  ledgerImported: boolean;
}

export interface LastSync {
  at: number;
  status: string;
  failed: number;
  error: string | null;
  summary: Record<string, unknown>;
}

/** Generated encrypted-property envelope → the seal `decrypt` takes. */
export function parseSealedEnvelope(raw: unknown): SealedValue | null {
  if (typeof raw !== "string") return null;
  try {
    const envelope = JSON.parse(raw) as { v?: unknown; kid?: unknown; ct?: unknown };
    return envelope.v === 1 &&
      typeof envelope.kid === "string" &&
      typeof envelope.ct === "string"
      ? { ciphertext: envelope.ct, keyId: envelope.kid }
      : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The tenant's live IntegrationConnection row for a provider. The table has a
 * tenant index only; a tenant holds one row per provider it ever touched.
 * Should a second live row exist, the one the OAuth seam wrote last wins.
 */
export async function findConnectionRow(
  db: QueryCtx["db"],
  tenantId: string,
  provider: OAuthProvider,
): Promise<Doc<"integrationConnections"> | null> {
  const rows = await db
    .query("integrationConnections")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  let best: Doc<"integrationConnections"> | null = null;
  for (const row of rows) {
    if (row.provider !== provider || row.deletedAt != null) continue;
    const rank = (candidate: Doc<"integrationConnections">) =>
      candidate.updatedAt ?? candidate._creationTime;
    if (!best || rank(row) > rank(best)) best = row;
  }
  return best;
}

/** The entity row as a usable connection, or null when it is not connected. */
export function connectionFromRow(
  row: Doc<"integrationConnections">,
): OAuthConnection | null {
  if (row.status !== "connected" && row.status !== "error") return null;
  const refreshToken = parseSealedEnvelope(row.oauthRefreshToken);
  if (!row.engagementId || !row.externalAccountId || !refreshToken) {
    return null;
  }
  return {
    tenantId: row.tenantId,
    connectionId: row.engagementId,
    externalAccountId: row.externalAccountId,
    connectedAt: row.grantedAt ?? row.connectedAt ?? row._creationTime,
    connectedBy: row.connectedById ?? "",
    refreshToken,
    source: "entity",
    ledgerImported: row.ledgerImportedAt != null,
  };
}

export function lastSyncFromRow(
  row: Doc<"integrationConnections">,
): LastSync | null {
  if (row.lastSyncAt == null) return null;
  let summary: Record<string, unknown> = {};
  try {
    summary = asRecord(JSON.parse(row.lastSyncSummary ?? "{}"));
  } catch {
    summary = {};
  }
  return {
    at: row.lastSyncAt,
    status: row.lastSyncStatus ?? "unknown",
    failed: row.lastSyncFailedCount ?? 0,
    error: row.lastErrorAt != null ? (row.lastErrorMessage ?? null) : null,
    summary,
  };
}

/**
 * Newest legacy ledger row of this tenant with one of `types` on the
 * pseudo-entity (legacy connection rows are keyed entityId = tenantId).
 * Indexed on the tenant, newest first, stops at the first match. The ledger
 * no longer grows for these types.
 */
export async function latestLedgerRow(
  db: QueryCtx["db"],
  tenantId: string,
  entity: string,
  types: ReadonlySet<string>,
): Promise<Doc<"manifestEvents"> | null> {
  for await (const row of db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
    .order("desc")) {
    if (row.entity === entity && types.has(row.type)) return row;
  }
  return null;
}

/**
 * Legacy per-record rows of one tenant for a pseudo-entity, newest first per
 * key (`keyOf`). Those rows carry the tenant only in the payload, so this
 * reads the pseudo-entity's frozen rows once — it runs only until the tenant's
 * `ledgerImportedAt` is set on its first reconcile.
 */
export async function latestLedgerRowsByKey(
  db: QueryCtx["db"],
  tenantId: string,
  entity: string,
  keyOf: (row: Doc<"manifestEvents">) => string | null,
): Promise<Doc<"manifestEvents">[]> {
  const rows = await db
    .query("manifestEvents")
    .withIndex("by_entity", (q) => q.eq("entity", entity))
    .collect();
  const latest = new Map<string, Doc<"manifestEvents">>();
  for (const row of rows.sort((a, b) => b.createdAt - a.createdAt)) {
    if (asRecord(row.payload).tenantId !== tenantId) continue;
    const key = keyOf(row);
    if (key && !latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

export async function loadSyncRecords(
  db: QueryCtx["db"],
  tenantId: string,
  provider: OAuthProvider,
): Promise<Doc<"integrationSyncRecords">[]> {
  const rows = await db
    .query("integrationSyncRecords")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  return rows.filter((row) => row.provider === provider);
}

export interface GrantInput {
  tenantId: string;
  provider: OAuthProvider;
  engagementId: string;
  externalAccountId: string;
  displayName: string;
  /** Plaintext; the generated command seals it. */
  refreshToken: string;
  connectedById: string;
  grantedAt: number;
}

export interface SyncOutcomeInput {
  tenantId: string;
  provider: OAuthProvider;
  recordType: string;
  sourceId: string;
  externalId: string | null;
  engagementId: string | null;
  status: "synced" | "deleted" | "failed" | "linked";
  contentSignature: string | null;
  syncedAt: number;
  error: string | null;
}

function orUndefined<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

/** Writes through generated IntegrationConnection / IntegrationSyncRecord commands. */
export class OAuthConnectionStore {
  private readonly system: MutationCtx;

  constructor(
    private readonly ctx: MutationCtx,
    private readonly tenantId: string,
    private readonly provider: OAuthProvider,
  ) {
    this.system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
  }

  row(): Promise<Doc<"integrationConnections"> | null> {
    return findConnectionRow(this.ctx.db, this.tenantId, this.provider);
  }

  /** A new consent (or a ledger connection moving over): connected. */
  async grant(input: GrantInput): Promise<void> {
    const docId = await this.ensureRow(input.externalAccountId, input.displayName);
    await this.system.runMutation(api.mutations.IntegrationConnection_recordOAuthGrant, {
      docId,
      engagementId: input.engagementId,
      externalAccountId: input.externalAccountId,
      refreshToken: input.refreshToken,
      connectedById: input.connectedById,
      grantedAt: input.grantedAt,
    });
  }

  /**
   * Disconnect. A tenant still on the ledger gets its row created first so the
   * disconnect is recorded on the entity (and the ledger stops counting).
   */
  async disconnect(externalAccountId: string | null, displayName: string): Promise<void> {
    const existing = await this.row();
    if (existing?.status === "revoked") return;
    const docId = existing
      ? existing._id
      : await this.createRow(externalAccountId, displayName);
    await this.system.runMutation(api.mutations.IntegrationConnection_disconnect, {
      docId,
    });
  }

  /** QuickBooks rotated the refresh token. False when the consent moved on. */
  async rotate(engagementId: string, refreshToken: string): Promise<boolean> {
    const row = await this.current(engagementId);
    if (!row) return false;
    await this.system.runMutation(api.mutations.IntegrationConnection_rotateOAuthCredential, {
      docId: row._id,
      engagementId,
      refreshToken,
    });
    return true;
  }

  /** One reconcile's outcome. Skipped when the consent it ran for is gone. */
  async recordReconciliation(input: {
    engagementId: string;
    outcome: string;
    failed: number;
    error: string | null;
    summary: Record<string, unknown>;
  }): Promise<boolean> {
    const row = await this.current(input.engagementId);
    if (!row) return false;
    await this.system.runMutation(api.mutations.IntegrationConnection_recordReconciliation, {
      docId: row._id,
      engagementId: input.engagementId,
      outcome: input.outcome,
      failedCount: input.failed,
      summary: JSON.stringify(input.summary),
      error: orUndefined(input.error),
    });
    return true;
  }

  async markLedgerImported(): Promise<void> {
    const row = await this.row();
    if (!row || row.ledgerImportedAt != null) return;
    await this.system.runMutation(api.mutations.IntegrationConnection_markLedgerImported, {
      docId: row._id,
    });
  }

  /** Create or update the record's IntegrationSyncRecord row. */
  async recordSync(input: SyncOutcomeInput): Promise<void> {
    const existing = await this.syncRecord(input.recordType, input.sourceId);
    const outcome = {
      externalId: orUndefined(input.externalId),
      engagementId: orUndefined(input.engagementId),
      status: input.status,
      contentSignature: orUndefined(input.contentSignature),
      syncedAt: input.syncedAt,
      error: orUndefined(input.error),
    };
    if (existing) {
      await this.system.runMutation(api.mutations.IntegrationSyncRecord_recordOutcome, {
        docId: existing._id,
        ...outcome,
      });
      return;
    }
    await this.system.runMutation(api.mutations.IntegrationSyncRecord_createViaTrack, {
      provider: this.provider,
      recordType: input.recordType,
      sourceId: input.sourceId,
      ...outcome,
    });
  }

  /** Copies ledger state; a record that already has a row keeps its row. */
  async importLedgerSync(input: SyncOutcomeInput): Promise<void> {
    if (await this.syncRecord(input.recordType, input.sourceId)) return;
    await this.recordSync(input);
  }

  private async syncRecord(recordType: string, sourceId: string) {
    const syncKey = `${this.provider}:${recordType}:${sourceId}`;
    const rows = await this.ctx.db
      .query("integrationSyncRecords")
      .withIndex("by_syncKey", (q) => q.eq("syncKey", syncKey))
      .collect();
    return rows.find((row) => row.tenantId === this.tenantId) ?? null;
  }

  private async current(engagementId: string) {
    const row = await this.row();
    return row &&
      row.engagementId === engagementId &&
      (row.status === "connected" || row.status === "error")
      ? row
      : null;
  }

  private async ensureRow(
    externalAccountId: string,
    displayName: string,
  ): Promise<Id<"integrationConnections">> {
    const existing = await this.row();
    if (!existing) return this.createRow(externalAccountId, displayName);
    if (existing.status === "revoked") {
      // revoked → connected is not a declared transition; reopen first.
      await this.system.runMutation(api.mutations.IntegrationConnection_reauthorize, {
        docId: existing._id,
      });
    }
    return existing._id;
  }

  private async createRow(
    externalAccountId: string | null,
    displayName: string,
  ): Promise<Id<"integrationConnections">> {
    const created = (await this.system.runMutation(
      api.mutations.IntegrationConnection_createViaAuthorize,
      {
        provider: this.provider,
        externalAccountId: orUndefined(externalAccountId),
        displayName,
      },
    )) as { docId: Id<"integrationConnections"> };
    return created.docId;
  }
}
