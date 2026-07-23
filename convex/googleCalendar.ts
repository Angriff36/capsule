import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { decrypt, encrypt } from "./lib/encryption";
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

const CONNECTION_ENTITY = "GoogleCalendarConnection";
const CALENDAR_EVENT_ENTITY = "GoogleCalendarEvent";
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

interface EncryptedRefreshToken {
  ciphertext: string;
  keyId: string;
}

interface ConnectionPayload {
  tenantId: string;
  connectionId: string;
  calendarId: string;
  connectedAt: number;
  connectedBy: string;
  refreshToken: EncryptedRefreshToken;
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

function parseConnection(payload: unknown): ConnectionPayload | null {
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
    calendarId,
    connectedAt,
    connectedBy,
    refreshToken: { ciphertext, keyId },
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

function latestActiveConnection(
  rows: Array<{
    type: string;
    entity: string;
    payload: unknown;
    createdAt: number;
  }>,
): ConnectionPayload | null {
  const latest = rows
    .filter(
      (row) =>
        row.entity === CONNECTION_ENTITY &&
        (row.type === "GoogleCalendarConnected" ||
          row.type === "GoogleCalendarDisconnected"),
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  return latest?.type === "GoogleCalendarConnected"
    ? parseConnection(latest.payload)
    : null;
}

export const getConnectionStatus = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
      .collect();
    const connection = latestActiveConnection(rows);
    const lastSync = rows
      .filter(
        (row) =>
          row.entity === CONNECTION_ENTITY &&
          row.type === "GoogleCalendarReconciled",
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    const sync = asRecord(lastSync?.payload);
    return {
      connected: connection != null,
      calendarId: connection?.calendarId ?? null,
      connectedAt: connection?.connectedAt ?? null,
      providerConfigured: providerConfigured(),
      redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ?? null,
      canManage: canManage(auth.role),
      lastSync:
        lastSync == null
          ? null
          : {
              at: lastSync.createdAt,
              status: stringValue(sync.status) ?? "unknown",
              createdOrUpdated: numberValue(sync.createdOrUpdated) ?? 0,
              deleted: numberValue(sync.deleted) ?? 0,
              skipped: numberValue(sync.skipped) ?? 0,
              failed: numberValue(sync.failed) ?? 0,
              error: stringValue(sync.error),
            },
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
      const encrypted = await encrypt(tokens.refreshToken, {
        ctx,
        entity: CONNECTION_ENTITY,
        property: "refreshToken",
      });
      const connectionId = crypto.randomUUID();
      await ctx.runMutation(internal.googleCalendar.recordConnection, {
        tenantId,
        connectionId,
        calendarId: CALENDAR_ID,
        connectedAt: Date.now(),
        connectedBy: auth.id,
        refreshToken: encrypted,
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
      disconnectedAt: Date.now(),
      disconnectedBy: auth.id,
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
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
      .collect();
    return latestActiveConnection(rows);
  },
});

export const loadReconciliationContext = internalQuery({
  args: { tenantId: v.string(), connectionId: v.string() },
  handler: async (ctx, args): Promise<ReconciliationContext | null> => {
    const connectionRows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
      .collect();
    const connection = latestActiveConnection(connectionRows);
    if (!connection || connection.connectionId !== args.connectionId) {
      return null;
    }
    const [events, syncRows] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", CALENDAR_EVENT_ENTITY))
        .collect(),
    ]);
    const latestByEvent = new Map<string, EventSyncState>();
    for (const row of syncRows.sort(
      (left, right) => right.createdAt - left.createdAt,
    )) {
      const payload = asRecord(row.payload);
      if (payload.tenantId !== args.tenantId) continue;
      const state = parseSyncState(row.payload);
      if (state && !latestByEvent.has(state.eventId)) {
        latestByEvent.set(state.eventId, state);
      }
    }
    return { connection, events, syncStates: [...latestByEvent.values()] };
  },
});

export const recordConnection = internalMutation({
  args: {
    tenantId: v.string(),
    connectionId: v.string(),
    calendarId: v.string(),
    connectedAt: v.number(),
    connectedBy: v.string(),
    refreshToken: v.object({ ciphertext: v.string(), keyId: v.string() }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
      type: "GoogleCalendarConnected",
      entity: CONNECTION_ENTITY,
      entityId: args.tenantId,
      payload: args,
      createdAt: args.connectedAt,
    });
  },
});

export const recordDisconnection = internalMutation({
  args: {
    tenantId: v.string(),
    disconnectedAt: v.number(),
    disconnectedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
      type: "GoogleCalendarDisconnected",
      entity: CONNECTION_ENTITY,
      entityId: args.tenantId,
      payload: args,
      createdAt: args.disconnectedAt,
    });
  },
});

export const recordEventSync = internalMutation({
  args: {
    tenantId: v.string(),
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
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
      type:
        args.status === "synced"
          ? "GoogleCalendarEventSynced"
          : args.status === "deleted"
            ? "GoogleCalendarEventDeleted"
            : "GoogleCalendarEventSyncFailed",
      entity: CALENDAR_EVENT_ENTITY,
      entityId: args.eventId,
      payload: args,
      createdAt: args.syncedAt,
    });
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
    await ctx.db.insert("manifestEvents", {
      type: "GoogleCalendarReconciled",
      entity: CONNECTION_ENTITY,
      entityId: args.tenantId,
      payload: args,
      createdAt: args.reconciledAt,
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
      args,
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
