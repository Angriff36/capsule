import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import {
  OAuthConnectionStore,
  connectionFromRow,
  findConnectionRow,
  lastSyncFromRow,
  latestLedgerRow,
  latestLedgerRowsByKey,
  loadSyncRecords,
  type OAuthConnection,
} from "./lib/oauthConnectionStore";
import {
  buildGoogleAuthorizationUrl,
  buildGoogleCalendarEvent,
  createGoogleOAuthState,
  deleteGoogleCalendarEvent,
  exchangeGoogleAuthorizationCode,
  googleCalendarEventId,
  googleCalendarEventSignature,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  safeGoogleProviderMessage,
  upsertGoogleCalendarEvent,
  verifyGoogleOAuthState,
  type GoogleOAuthConfig,
} from "./lib/googleCalendar";

// Connection and per-event sync state live on IntegrationConnection (provider
// google_calendar) and IntegrationSyncRecord (record type "event"), written by
// generated commands (convex/lib/oauthConnectionStore.ts). The two names below
// are the pseudo-entities of the manifestEvents ledger rows written before
// 2026-09-29; those rows are only read, for tenants not yet moved over.
const PROVIDER = "google_calendar" as const;
const EVENT_RECORD = "event";
const CONNECTION_ENTITY = "GoogleCalendarConnection";
const CALENDAR_EVENT_ENTITY = "GoogleCalendarEvent";
const LEDGER_LIFECYCLE = new Set([
  "GoogleCalendarConnected",
  "GoogleCalendarDisconnected",
]);
const LEDGER_RECONCILED = new Set(["GoogleCalendarReconciled"]);
const CALENDAR_ID = "primary";
const SYNC_INTERVAL_MS = 60_000;
const RETRY_INTERVAL_MS = 15 * 60_000;
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const CALENDAR_ELIGIBLE_STAGES = new Set([
  "approved",
  "executing",
  "completed",
  "closed_out",
]);

interface ConnectionPayload extends OAuthConnection {
  calendarId: string;
}

interface EventSyncState {
  eventId: string;
  connectionId: string;
  googleEventId: string;
  signature: string | null;
  status: "synced" | "deleted" | "failed";
  syncedAt: number;
  error: string | null;
}

interface ReconciliationContext {
  connection: ConnectionPayload;
  events: Doc<"events">[];
  syncStates: EventSyncState[];
  /** Ledger states still to copy into IntegrationSyncRecord (first run only). */
  ledgerStates: EventSyncState[];
}

interface ReconciliationResult {
  status: "ok" | "partial" | "needs_reconnect" | "disconnected";
  createdOrUpdated: number;
  deleted: number;
  skipped: number;
  failed: number;
  error?: string;
}

function providerEnvironment(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ConvexError(
      "Google Calendar needs GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI in the Convex environment.",
    );
  }
  try {
    const parsed = new URL(redirectUri);
    const localDevelopmentOrigin =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]");
    if (parsed.protocol !== "https:" && !localDevelopmentOrigin) {
      throw new Error("Google requires HTTPS outside localhost");
    }
  } catch {
    throw new ConvexError(
      "GOOGLE_CALENDAR_REDIRECT_URI must be an authorized HTTPS URL (or localhost URL for development).",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

function providerConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() &&
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim(),
  );
}

function canManage(role: string): boolean {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system" ||
    role.endsWith("_manager")
  );
}

function requireManager(role: string): void {
  if (!canManage(role)) {
    throw new ConvexError(
      "Only an organization manager can change the Google Calendar connection.",
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A legacy ledger `GoogleCalendarConnected` payload. */
function parseLedgerConnection(payload: unknown): ConnectionPayload | null {
  const value = asRecord(payload);
  const token = asRecord(value.refreshToken);
  const tenantId = stringValue(value.tenantId);
  const connectionId = stringValue(value.connectionId);
  const calendarId = stringValue(value.calendarId);
  const connectedAt = numberValue(value.connectedAt);
  const connectedBy = stringValue(value.connectedBy);
  const ciphertext = stringValue(token.ciphertext);
  const keyId = stringValue(token.keyId);
  if (
    !tenantId ||
    !connectionId ||
    !calendarId ||
    connectedAt == null ||
    !connectedBy ||
    !ciphertext ||
    !keyId
  ) {
    return null;
  }
  return {
    tenantId,
    connectionId,
    externalAccountId: calendarId,
    calendarId,
    connectedAt,
    connectedBy,
    refreshToken: { ciphertext, keyId },
    source: "ledger",
    ledgerImported: false,
  };
}

function parseSyncState(payload: unknown): EventSyncState | null {
  const value = asRecord(payload);
  const status = stringValue(value.status);
  const eventId = stringValue(value.eventId);
  const connectionId = stringValue(value.connectionId);
  const googleEventId = stringValue(value.googleEventId);
  const syncedAt = numberValue(value.syncedAt);
  if (
    !eventId ||
    !connectionId ||
    !googleEventId ||
    syncedAt == null ||
    (status !== "synced" && status !== "deleted" && status !== "failed")
  ) {
    return null;
  }
  return {
    eventId,
    connectionId,
    googleEventId,
    signature: stringValue(value.signature),
    status,
    syncedAt,
    error: stringValue(value.error),
  };
}

/**
 * The tenant's active connection: the IntegrationConnection row once it
 * exists (it then supersedes the ledger), otherwise the newest ledger
 * connect/disconnect row, exactly as before.
 */
async function activeConnection(
  db: QueryCtx["db"],
  tenantId: string,
): Promise<{
  connection: ConnectionPayload | null;
  row: Doc<"integrationConnections"> | null;
}> {
  const row = await findConnectionRow(db, tenantId, PROVIDER);
  if (row) {
    const connection = connectionFromRow(row);
    return {
      row,
      connection: connection
        ? { ...connection, calendarId: connection.externalAccountId }
        : null,
    };
  }
  const latest = await latestLedgerRow(
    db,
    tenantId,
    CONNECTION_ENTITY,
    LEDGER_LIFECYCLE,
  );
  return {
    row: null,
    connection:
      latest?.type === "GoogleCalendarConnected"
        ? parseLedgerConnection(latest.payload)
        : null,
  };
}

function syncStateFromRecord(
  record: Doc<"integrationSyncRecords">,
): EventSyncState | null {
  if (record.recordType !== EVENT_RECORD) return null;
  if (
    record.status !== "synced" &&
    record.status !== "deleted" &&
    record.status !== "failed"
  ) {
    return null;
  }
  if (!record.externalId || record.lastSyncedAt == null) return null;
  return {
    eventId: record.sourceId,
    connectionId: record.engagementId ?? "",
    googleEventId: record.externalId,
    signature: record.contentSignature ?? null,
    status: record.status,
    syncedAt: record.lastSyncedAt,
    error: record.lastError ?? null,
  };
}

export const getConnectionStatus = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    const { connection, row } = await activeConnection(ctx.db, tenantId);
    let lastSync: {
      at: number;
      status: string;
      createdOrUpdated: number;
      deleted: number;
      skipped: number;
      failed: number;
      error: string | null;
    } | null = null;
    if (row) {
      const entitySync = lastSyncFromRow(row);
      lastSync =
        entitySync == null
          ? null
          : {
              at: entitySync.at,
              status: entitySync.status,
              createdOrUpdated:
                numberValue(entitySync.summary.createdOrUpdated) ?? 0,
              deleted: numberValue(entitySync.summary.deleted) ?? 0,
              skipped: numberValue(entitySync.summary.skipped) ?? 0,
              failed: entitySync.failed,
              error: entitySync.error,
            };
    } else {
      const ledgerSync = await latestLedgerRow(
        ctx.db,
        tenantId,
        CONNECTION_ENTITY,
        LEDGER_RECONCILED,
      );
      const sync = asRecord(ledgerSync?.payload);
      lastSync =
        ledgerSync == null
          ? null
          : {
              at: ledgerSync.createdAt,
              status: stringValue(sync.status) ?? "unknown",
              createdOrUpdated: numberValue(sync.createdOrUpdated) ?? 0,
              deleted: numberValue(sync.deleted) ?? 0,
              skipped: numberValue(sync.skipped) ?? 0,
              failed: numberValue(sync.failed) ?? 0,
              error: stringValue(sync.error),
            };
    }
    return {
      connected: connection != null,
      calendarId: connection?.calendarId ?? null,
      connectedAt: connection?.connectedAt ?? null,
      providerConfigured: providerConfigured(),
      redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ?? null,
      canManage: canManage(auth.role),
      lastSync,
    };
  },
});

export const beginConnection = action({
  args: {},
  handler: async (ctx): Promise<{ authorizationUrl: string }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    const environment = providerEnvironment();
    const state = await createGoogleOAuthState(
      {
        actorId: auth.id,
        tenantId,
        nonce: crypto.randomUUID(),
        expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
      },
      environment.clientSecret,
    );
    return {
      authorizationUrl: buildGoogleAuthorizationUrl(environment, state),
    };
  },
});

export const completeConnection = action({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, args): Promise<{ connected: true }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    if (args.code.length > 4096 || args.state.length > 8192) {
      throw new ConvexError(
        "Google returned an invalid authorization response.",
      );
    }
    const environment = providerEnvironment();
    const state = await verifyGoogleOAuthState(
      args.state,
      environment.clientSecret,
    );
    if (!state || state.actorId !== auth.id || state.tenantId !== tenantId) {
      throw new ConvexError(
        "The Google connection request expired or belongs to another session. Start the connection again.",
      );
    }

    try {
      const tokens = await exchangeGoogleAuthorizationCode(
        environment,
        args.code,
      );
      if (!tokens.refreshToken) {
        throw new ConvexError(
          "Google did not grant offline access. Remove CapsuleX from your Google account permissions, then connect again.",
        );
      }
      const connectionId = crypto.randomUUID();
      // The generated command seals the token (IntegrationConnection
      // oauthRefreshToken is `encrypted`).
      await ctx.runMutation(internal.googleCalendar.recordConnection, {
        tenantId,
        connectionId,
        calendarId: CALENDAR_ID,
        connectedAt: Date.now(),
        connectedBy: auth.id,
        refreshToken: tokens.refreshToken,
      });
      await ctx.scheduler.runAfter(0, internal.googleCalendar.reconcileTenant, {
        tenantId,
        connectionId,
        scheduleNext: true,
      });
      return { connected: true };
    } catch (cause) {
      if (cause instanceof ConvexError) throw cause;
      throw new ConvexError(safeGoogleProviderMessage(cause));
    }
  },
});

export const disconnect = action({
  args: {},
  handler: async (ctx): Promise<{ disconnected: true }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    const connection: ConnectionPayload | null = await ctx.runQuery(
      internal.googleCalendar.loadActiveConnection,
      { tenantId },
    );
    if (connection) {
      try {
        const refreshToken = await decrypt(
          connection.refreshToken.ciphertext,
          connection.refreshToken.keyId,
          { ctx, entity: CONNECTION_ENTITY, property: "refreshToken" },
        );
        await revokeGoogleToken(refreshToken);
      } catch {
        // Local disconnect must still work if Google already revoked the token.
      }
    }
    await ctx.runMutation(internal.googleCalendar.recordDisconnection, {
      tenantId,
      calendarId: connection?.calendarId ?? null,
    });
    return { disconnected: true };
  },
});

export const syncNow = action({
  args: {},
  handler: async (ctx): Promise<ReconciliationResult> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    const connection: ConnectionPayload | null = await ctx.runQuery(
      internal.googleCalendar.loadActiveConnection,
      { tenantId },
    );
    if (!connection) {
      throw new ConvexError("Connect Google Calendar before syncing events.");
    }
    return ctx.runAction(internal.googleCalendar.reconcileTenant, {
      tenantId,
      connectionId: connection.connectionId,
      scheduleNext: false,
    });
  },
});

export const loadActiveConnection = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args): Promise<ConnectionPayload | null> => {
    return (await activeConnection(ctx.db, args.tenantId)).connection;
  },
});

export const loadReconciliationContext = internalQuery({
  args: { tenantId: v.string(), connectionId: v.string() },
  handler: async (ctx, args): Promise<ReconciliationContext | null> => {
    const { connection } = await activeConnection(ctx.db, args.tenantId);
    if (!connection || connection.connectionId !== args.connectionId) {
      return null;
    }
    const [events, records] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      loadSyncRecords(ctx.db, args.tenantId, PROVIDER),
    ]);
    const syncStates: EventSyncState[] = [];
    const tracked = new Set<string>();
    for (const record of records) {
      const state = syncStateFromRecord(record);
      if (state) {
        syncStates.push(state);
        tracked.add(state.eventId);
      }
    }
    // Until this tenant's ledger history is copied over (first reconcile),
    // events without a row take their state from the newest ledger row
    // (same keys as before: entityId = Capsule event id, tenant in payload).
    const ledgerStates: EventSyncState[] = [];
    if (!connection.ledgerImported) {
      const ledgerRows = await latestLedgerRowsByKey(
        ctx.db,
        args.tenantId,
        CALENDAR_EVENT_ENTITY,
        (row) => stringValue(asRecord(row.payload).eventId),
      );
      for (const row of ledgerRows) {
        const state = parseSyncState(row.payload);
        if (state && !tracked.has(state.eventId)) {
          ledgerStates.push(state);
          syncStates.push(state);
        }
      }
    }
    return { connection, events, syncStates, ledgerStates };
  },
});

// Every write below goes through a generated command as the tenant's system
// identity (convex/lib/oauthConnectionStore.ts). Callers: completeConnection
// and disconnect (after requireManager) and the scheduled reconcileTenant.

export const recordConnection = internalMutation({
  args: {
    tenantId: v.string(),
    connectionId: v.string(),
    calendarId: v.string(),
    connectedAt: v.number(),
    connectedBy: v.string(),
    /** Plaintext; IntegrationConnection seals it. */
    refreshToken: v.string(),
  },
  handler: async (ctx, args) => {
    await new OAuthConnectionStore(ctx, args.tenantId, PROVIDER).grant({
      tenantId: args.tenantId,
      provider: PROVIDER,
      engagementId: args.connectionId,
      externalAccountId: args.calendarId,
      displayName: "Google Calendar",
      refreshToken: args.refreshToken,
      connectedById: args.connectedBy,
      grantedAt: args.connectedAt,
    });
  },
});

export const recordDisconnection = internalMutation({
  args: {
    tenantId: v.string(),
    calendarId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const { connection, row } = await activeConnection(ctx.db, args.tenantId);
    // Never connected at all: nothing to record.
    if (!row && !connection) return;
    await new OAuthConnectionStore(ctx, args.tenantId, PROVIDER).disconnect(
      args.calendarId,
      "Google Calendar",
    );
  },
});

const syncStateArgs = {
  eventId: v.string(),
  connectionId: v.string(),
  googleEventId: v.string(),
  signature: v.union(v.string(), v.null()),
  status: v.union(
    v.literal("synced"),
    v.literal("deleted"),
    v.literal("failed"),
  ),
  syncedAt: v.number(),
  error: v.union(v.string(), v.null()),
};

export const recordEventSync = internalMutation({
  args: { tenantId: v.string(), ...syncStateArgs },
  handler: async (ctx, args) => {
    await new OAuthConnectionStore(ctx, args.tenantId, PROVIDER).recordSync({
      tenantId: args.tenantId,
      provider: PROVIDER,
      recordType: EVENT_RECORD,
      sourceId: args.eventId,
      externalId: args.googleEventId,
      engagementId: args.connectionId,
      status: args.status,
      contentSignature: args.signature,
      syncedAt: args.syncedAt,
      error: args.error,
    });
  },
});

/**
 * First reconcile of a tenant still on the ledger: move the connection to
 * IntegrationConnection (keeping its connection id, so running chains carry
 * on) and copy the per-event ledger state into IntegrationSyncRecord rows.
 * Also runs once for a row connected after 2026-09-29 (ledger history of an
 * earlier connection is copied so its calendar events can still be removed).
 */
export const adoptLedgerState = internalMutation({
  args: {
    tenantId: v.string(),
    connection: v.union(
      v.null(),
      v.object({
        connectionId: v.string(),
        calendarId: v.string(),
        connectedAt: v.number(),
        connectedBy: v.string(),
        refreshToken: v.string(),
      }),
    ),
    states: v.array(v.object(syncStateArgs)),
  },
  handler: async (ctx, args) => {
    const store = new OAuthConnectionStore(ctx, args.tenantId, PROVIDER);
    if (args.connection && !(await store.row())) {
      await store.grant({
        tenantId: args.tenantId,
        provider: PROVIDER,
        engagementId: args.connection.connectionId,
        externalAccountId: args.connection.calendarId,
        displayName: "Google Calendar",
        refreshToken: args.connection.refreshToken,
        connectedById: args.connection.connectedBy,
        grantedAt: args.connection.connectedAt,
      });
    }
    for (const state of args.states) {
      await store.importLedgerSync({
        tenantId: args.tenantId,
        provider: PROVIDER,
        recordType: EVENT_RECORD,
        sourceId: state.eventId,
        externalId: state.googleEventId,
        engagementId: state.connectionId,
        status: state.status,
        contentSignature: state.signature,
        syncedAt: state.syncedAt,
        error: state.error,
      });
    }
    await store.markLedgerImported();
  },
});

export const recordReconciliation = internalMutation({
  args: {
    tenantId: v.string(),
    connectionId: v.string(),
    status: v.string(),
    createdOrUpdated: v.number(),
    deleted: v.number(),
    skipped: v.number(),
    failed: v.number(),
    error: v.union(v.string(), v.null()),
    reconciledAt: v.number(),
  },
  handler: async (ctx, args) => {
    await new OAuthConnectionStore(
      ctx,
      args.tenantId,
      PROVIDER,
    ).recordReconciliation({
      engagementId: args.connectionId,
      outcome: args.status,
      failed: args.failed,
      error: args.error,
      summary: {
        createdOrUpdated: args.createdOrUpdated,
        deleted: args.deleted,
        skipped: args.skipped,
      },
    });
  },
});

export const reconcileTenant = internalAction({
  args: {
    tenantId: v.string(),
    connectionId: v.string(),
    scheduleNext: v.boolean(),
  },
  handler: async (ctx, args): Promise<ReconciliationResult> => {
    const context: ReconciliationContext | null = await ctx.runQuery(
      internal.googleCalendar.loadReconciliationContext,
      { tenantId: args.tenantId, connectionId: args.connectionId },
    );
    if (!context) {
      return {
        status: "disconnected",
        createdOrUpdated: 0,
        deleted: 0,
        skipped: 0,
        failed: 0,
      };
    }

    let accessToken: string;
    try {
      const refreshToken = await decrypt(
        context.connection.refreshToken.ciphertext,
        context.connection.refreshToken.keyId,
        { ctx, entity: CONNECTION_ENTITY, property: "refreshToken" },
      );
      if (!context.connection.ledgerImported) {
        await ctx.runMutation(internal.googleCalendar.adoptLedgerState, {
          tenantId: args.tenantId,
          connection:
            context.connection.source === "ledger"
              ? {
                  connectionId: context.connection.connectionId,
                  calendarId: context.connection.calendarId,
                  connectedAt: context.connection.connectedAt,
                  connectedBy: context.connection.connectedBy,
                  refreshToken,
                }
              : null,
          states: context.ledgerStates,
        });
      }
      accessToken = (
        await refreshGoogleAccessToken(providerEnvironment(), refreshToken)
      ).accessToken;
    } catch (cause) {
      const error = safeGoogleProviderMessage(cause);
      const needsReconnect = /invalid_grant|revoked|expired/iu.test(error);
      await ctx.runMutation(internal.googleCalendar.recordReconciliation, {
        tenantId: args.tenantId,
        connectionId: args.connectionId,
        status: needsReconnect ? "needs_reconnect" : "partial",
        createdOrUpdated: 0,
        deleted: 0,
        skipped: 0,
        failed: context.events.length,
        error,
        reconciledAt: Date.now(),
      });
      if (args.scheduleNext && !needsReconnect) {
        await ctx.scheduler.runAfter(
          RETRY_INTERVAL_MS,
          internal.googleCalendar.reconcileTenant,
          args,
        );
      }
      return {
        status: needsReconnect ? "needs_reconnect" : "partial",
        createdOrUpdated: 0,
        deleted: 0,
        skipped: 0,
        failed: context.events.length,
        error,
      };
    }

    const states = new Map(
      context.syncStates.map((state) => [state.eventId, state] as const),
    );
    const result: ReconciliationResult = {
      status: "ok",
      createdOrUpdated: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
    };

    for (const event of context.events) {
      const eventId = String(event._id);
      const googleEventId = await googleCalendarEventId(eventId);
      const state = states.get(eventId);
      const eligible =
        event.deletedAt == null &&
        CALENDAR_ELIGIBLE_STAGES.has(String(event.stage)) &&
        event.startsAt != null &&
        event.endsAt != null;
      try {
        if (eligible) {
          const resource = buildGoogleCalendarEvent({
            eventId,
            title: event.title,
            startsAt: event.startsAt as number,
            endsAt: event.endsAt as number,
            venueName: event.venueName,
            venueAddress: event.venueAddress,
            expectedHeadcount: event.expectedHeadcount,
          });
          const signature = await googleCalendarEventSignature(resource);
          if (
            state?.connectionId === args.connectionId &&
            state.status === "synced" &&
            state.signature === signature
          ) {
            result.skipped += 1;
            continue;
          }
          await upsertGoogleCalendarEvent({
            accessToken,
            calendarId: context.connection.calendarId,
            eventId: googleEventId,
            resource,
            previouslySynced: state?.status === "synced",
          });
          await ctx.runMutation(internal.googleCalendar.recordEventSync, {
            tenantId: args.tenantId,
            eventId,
            connectionId: args.connectionId,
            googleEventId,
            signature,
            status: "synced",
            syncedAt: Date.now(),
            error: null,
          });
          result.createdOrUpdated += 1;
        } else if (state && state.status !== "deleted") {
          await deleteGoogleCalendarEvent({
            accessToken,
            calendarId: context.connection.calendarId,
            eventId: googleEventId,
          });
          await ctx.runMutation(internal.googleCalendar.recordEventSync, {
            tenantId: args.tenantId,
            eventId,
            connectionId: args.connectionId,
            googleEventId,
            signature: null,
            status: "deleted",
            syncedAt: Date.now(),
            error: null,
          });
          result.deleted += 1;
        } else {
          result.skipped += 1;
        }
      } catch (cause) {
        const error = safeGoogleProviderMessage(cause);
        await ctx.runMutation(internal.googleCalendar.recordEventSync, {
          tenantId: args.tenantId,
          eventId,
          connectionId: args.connectionId,
          googleEventId,
          signature: state?.signature ?? null,
          status: "failed",
          syncedAt: Date.now(),
          error,
        });
        result.failed += 1;
        result.status = "partial";
        result.error ??= error;
      }
    }

    await ctx.runMutation(internal.googleCalendar.recordReconciliation, {
      tenantId: args.tenantId,
      connectionId: args.connectionId,
      status: result.status,
      createdOrUpdated: result.createdOrUpdated,
      deleted: result.deleted,
      skipped: result.skipped,
      failed: result.failed,
      error: result.error ?? null,
      reconciledAt: Date.now(),
    });

    if (args.scheduleNext) {
      const active: ConnectionPayload | null = await ctx.runQuery(
        internal.googleCalendar.loadActiveConnection,
        { tenantId: args.tenantId },
      );
      if (active?.connectionId === args.connectionId) {
        await ctx.scheduler.runAfter(
          SYNC_INTERVAL_MS,
          internal.googleCalendar.reconcileTenant,
          args,
        );
      }
    }
    return result;
  },
});
