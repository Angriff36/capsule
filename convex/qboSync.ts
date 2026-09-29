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
  buildQboCustomer,
  buildQboInvoice,
  buildQboPayment,
  buildQboAuthorizationUrl,
  createQboOAuthState,
  createQboEntity,
  exchangeQboAuthorizationCode,
  findQboCustomerId,
  qboApiBaseUrl,
  qboCustomerDisplayName,
  refreshQboAccessToken,
  resolveQboServiceItemId,
  revokeQboToken,
  safeQboProviderMessage,
  verifyQboOAuthState,
  type QboOAuthConfig,
} from "./lib/qboSync";

// Connection and per-record sync state live on IntegrationConnection (provider
// quickbooks, externalAccountId = realm id) and IntegrationSyncRecord (record
// types customer / invoice / payment), written by generated commands
// (convex/lib/oauthConnectionStore.ts). The pseudo-entity names below belong
// to the manifestEvents ledger rows written before 2026-09-29; those rows are
// only read, for tenants not yet moved over.
const PROVIDER = "quickbooks" as const;
const CONNECTION_ENTITY = "QuickBooksConnection";
const CUSTOMER_ENTITY = "QuickBooksCustomerLink";
const INVOICE_ENTITY = "QuickBooksInvoiceLink";
const PAYMENT_ENTITY = "QuickBooksPaymentLink";
const LEDGER_LIFECYCLE = new Set([
  "QuickBooksConnected",
  "QuickBooksDisconnected",
]);
const LEDGER_RECONCILED = new Set(["QuickBooksReconciled"]);
const SYNC_INTERVAL_MS = 5 * 60_000;
const RETRY_INTERVAL_MS = 15 * 60_000;
const OAUTH_STATE_TTL_MS = 10 * 60_000;
// Invoices that represent confirmed accounts-receivable in QuickBooks.
const INVOICE_ELIGIBLE_STATUS = new Set([
  "sent",
  "viewed",
  "overdue",
  "partial",
  "paid",
]);

interface ConnectionPayload extends OAuthConnection {
  realmId: string;
}

interface EntitySyncState {
  status: "synced" | "failed";
  qboId: string | null;
  connectionId: string;
  syncedAt: number;
  error: string | null;
}

interface CustomerLink {
  clientId: string;
  qboCustomerId: string;
}

interface ReconciliationContext {
  connection: ConnectionPayload;
  invoices: Doc<"invoices">[];
  payments: Doc<"payments">[];
  clientsById: Record<string, Doc<"clients">>;
  customerLinks: CustomerLink[];
  invoiceStates: Record<string, EntitySyncState>;
  paymentStates: Record<string, EntitySyncState>;
  /** Ledger state still to copy into IntegrationSyncRecord (first run only). */
  ledger: LedgerState;
}

interface LedgerState {
  customerLinks: Array<
    CustomerLink & { connectionId: string; linkedAt: number }
  >;
  invoiceStates: Record<string, EntitySyncState>;
  paymentStates: Record<string, EntitySyncState>;
}

interface ReconciliationResult {
  status: "ok" | "partial" | "needs_reconnect" | "needs_setup" | "disconnected";
  invoicesSynced: number;
  paymentsSynced: number;
  skipped: number;
  failed: number;
  error?: string;
}

function providerEnvironment(): QboOAuthConfig {
  const clientId = process.env.QBO_CLIENT_ID?.trim();
  const clientSecret = process.env.QBO_CLIENT_SECRET?.trim();
  const redirectUri = process.env.QBO_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ConvexError(
      "QuickBooks needs QBO_CLIENT_ID, QBO_CLIENT_SECRET, and QBO_REDIRECT_URI in the Convex environment.",
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
      throw new Error("QuickBooks requires HTTPS outside localhost");
    }
  } catch {
    throw new ConvexError(
      "QBO_REDIRECT_URI must be an authorized HTTPS URL (or localhost URL for development).",
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    apiBaseUrl: qboApiBaseUrl(process.env.QBO_ENVIRONMENT),
  };
}

function providerConfigured(): boolean {
  return Boolean(
    process.env.QBO_CLIENT_ID?.trim() &&
    process.env.QBO_CLIENT_SECRET?.trim() &&
    process.env.QBO_REDIRECT_URI?.trim(),
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
      "Only an organization manager can change the QuickBooks connection.",
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

/** A legacy ledger `QuickBooksConnected` payload. */
function parseLedgerConnection(payload: unknown): ConnectionPayload | null {
  const value = asRecord(payload);
  const token = asRecord(value.refreshToken);
  const tenantId = stringValue(value.tenantId);
  const connectionId = stringValue(value.connectionId);
  const realmId = stringValue(value.realmId);
  const connectedAt = numberValue(value.connectedAt);
  const connectedBy = stringValue(value.connectedBy);
  const ciphertext = stringValue(token.ciphertext);
  const keyId = stringValue(token.keyId);
  if (
    !tenantId ||
    !connectionId ||
    !realmId ||
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
    externalAccountId: realmId,
    realmId,
    connectedAt,
    connectedBy,
    refreshToken: { ciphertext, keyId },
    source: "ledger",
    ledgerImported: false,
  };
}

function parseSyncState(payload: unknown): EntitySyncState | null {
  const value = asRecord(payload);
  const status = stringValue(value.status);
  const connectionId = stringValue(value.connectionId);
  const syncedAt = numberValue(value.syncedAt);
  if (
    !connectionId ||
    syncedAt == null ||
    (status !== "synced" && status !== "failed")
  ) {
    return null;
  }
  return {
    status,
    qboId: stringValue(value.qboId),
    connectionId,
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
        ? { ...connection, realmId: connection.externalAccountId }
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
      latest?.type === "QuickBooksConnected"
        ? parseLedgerConnection(latest.payload)
        : null,
  };
}

function latestStatesByEntity(
  rows: Array<{ entityId: string; payload: unknown }>,
): Record<string, EntitySyncState> {
  const result: Record<string, EntitySyncState> = {};
  for (const row of rows) {
    const state = parseSyncState(row.payload);
    if (state) result[row.entityId] = state;
  }
  return result;
}

function stateFromRecord(
  record: Doc<"integrationSyncRecords">,
): EntitySyncState | null {
  if (record.status !== "synced" && record.status !== "failed") return null;
  if (record.lastSyncedAt == null) return null;
  return {
    status: record.status,
    qboId: record.externalId ?? null,
    connectionId: record.engagementId ?? "",
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
      invoicesSynced: number;
      paymentsSynced: number;
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
              invoicesSynced:
                numberValue(entitySync.summary.invoicesSynced) ?? 0,
              paymentsSynced:
                numberValue(entitySync.summary.paymentsSynced) ?? 0,
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
              invoicesSynced: numberValue(sync.invoicesSynced) ?? 0,
              paymentsSynced: numberValue(sync.paymentsSynced) ?? 0,
              skipped: numberValue(sync.skipped) ?? 0,
              failed: numberValue(sync.failed) ?? 0,
              error: stringValue(sync.error),
            };
    }
    return {
      connected: connection != null,
      realmId: connection?.realmId ?? null,
      connectedAt: connection?.connectedAt ?? null,
      providerConfigured: providerConfigured(),
      redirectUri: process.env.QBO_REDIRECT_URI?.trim() ?? null,
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
    const state = await createQboOAuthState(
      {
        actorId: auth.id,
        tenantId,
        nonce: crypto.randomUUID(),
        expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
      },
      environment.clientSecret,
    );
    return {
      authorizationUrl: buildQboAuthorizationUrl(environment, state),
    };
  },
});

export const completeConnection = action({
  args: { code: v.string(), state: v.string(), realmId: v.string() },
  handler: async (ctx, args): Promise<{ connected: true }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    if (
      args.code.length > 4096 ||
      args.state.length > 8192 ||
      args.realmId.length > 64
    ) {
      throw new ConvexError(
        "QuickBooks returned an invalid authorization response.",
      );
    }
    const environment = providerEnvironment();
    const state = await verifyQboOAuthState(
      args.state,
      environment.clientSecret,
    );
    if (!state || state.actorId !== auth.id || state.tenantId !== tenantId) {
      throw new ConvexError(
        "The QuickBooks connection request expired or belongs to another session. Start the connection again.",
      );
    }

    try {
      const tokens = await exchangeQboAuthorizationCode(environment, args.code);
      if (!tokens.refreshToken) {
        throw new ConvexError(
          "QuickBooks did not return a refresh token. Start the connection again.",
        );
      }
      const connectionId = crypto.randomUUID();
      // The generated command seals the token (IntegrationConnection
      // oauthRefreshToken is `encrypted`).
      await ctx.runMutation(internal.qboSync.recordConnection, {
        tenantId,
        connectionId,
        realmId: args.realmId,
        connectedAt: Date.now(),
        connectedBy: auth.id,
        refreshToken: tokens.refreshToken,
      });
      await ctx.scheduler.runAfter(0, internal.qboSync.reconcileTenant, {
        tenantId,
        connectionId,
        scheduleNext: true,
      });
      return { connected: true };
    } catch (cause) {
      if (cause instanceof ConvexError) throw cause;
      throw new ConvexError(safeQboProviderMessage(cause));
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
      internal.qboSync.loadActiveConnection,
      { tenantId },
    );
    if (connection) {
      try {
        const refreshToken = await decrypt(
          connection.refreshToken.ciphertext,
          connection.refreshToken.keyId,
          { ctx, entity: CONNECTION_ENTITY, property: "refreshToken" },
        );
        await revokeQboToken(providerEnvironment(), refreshToken);
      } catch {
        // Local disconnect must still work if QuickBooks already revoked the token.
      }
    }
    await ctx.runMutation(internal.qboSync.recordDisconnection, {
      tenantId,
      realmId: connection?.realmId ?? null,
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
      internal.qboSync.loadActiveConnection,
      { tenantId },
    );
    if (!connection) {
      throw new ConvexError(
        "Connect QuickBooks before syncing invoices and payments.",
      );
    }
    return ctx.runAction(internal.qboSync.reconcileTenant, {
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

/**
 * Until the tenant's ledger history is copied over (first reconcile), records
 * without a row take their state from the newest ledger row, keyed as before:
 * customer links by payload.clientId, invoice / payment state by entityId
 * (the Capsule record id), tenant in the payload.
 */
async function loadLedgerState(
  db: QueryCtx["db"],
  tenantId: string,
): Promise<LedgerState> {
  const [customerRows, invoiceRows, paymentRows] = await Promise.all([
    latestLedgerRowsByKey(db, tenantId, CUSTOMER_ENTITY, (row) =>
      stringValue(asRecord(row.payload).clientId),
    ),
    latestLedgerRowsByKey(db, tenantId, INVOICE_ENTITY, (row) => row.entityId),
    latestLedgerRowsByKey(db, tenantId, PAYMENT_ENTITY, (row) => row.entityId),
  ]);
  const customerLinks: LedgerState["customerLinks"] = [];
  for (const row of customerRows) {
    const payload = asRecord(row.payload);
    const clientId = stringValue(payload.clientId);
    const qboCustomerId = stringValue(payload.qboCustomerId);
    if (!clientId || !qboCustomerId) continue;
    customerLinks.push({
      clientId,
      qboCustomerId,
      connectionId: stringValue(payload.connectionId) ?? "",
      linkedAt: numberValue(payload.linkedAt) ?? row.createdAt,
    });
  }
  return {
    customerLinks,
    invoiceStates: latestStatesByEntity(invoiceRows),
    paymentStates: latestStatesByEntity(paymentRows),
  };
}

export const loadReconciliationContext = internalQuery({
  args: { tenantId: v.string(), connectionId: v.string() },
  handler: async (ctx, args): Promise<ReconciliationContext | null> => {
    const { connection } = await activeConnection(ctx.db, args.tenantId);
    if (!connection || connection.connectionId !== args.connectionId) {
      return null;
    }

    const [invoices, payments, clients, records] = await Promise.all([
      ctx.db
        .query("invoices")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      ctx.db
        .query("payments")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      ctx.db
        .query("clients")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      loadSyncRecords(ctx.db, args.tenantId, PROVIDER),
    ]);

    const eligibleInvoices = invoices.filter(
      (invoice) =>
        invoice.deletedAt == null &&
        INVOICE_ELIGIBLE_STATUS.has(String(invoice.status)),
    );
    const eligiblePayments = payments.filter(
      (payment) => payment.deletedAt == null && payment.status === "completed",
    );
    const clientsById: Record<string, Doc<"clients">> = {};
    for (const client of clients) clientsById[String(client._id)] = client;

    const customers = new Map<string, string>();
    const invoiceStates: Record<string, EntitySyncState> = {};
    const paymentStates: Record<string, EntitySyncState> = {};
    for (const record of records) {
      if (record.recordType === "customer") {
        if (record.externalId)
          customers.set(record.sourceId, record.externalId);
        continue;
      }
      const state = stateFromRecord(record);
      if (!state) continue;
      if (record.recordType === "invoice")
        invoiceStates[record.sourceId] = state;
      if (record.recordType === "payment")
        paymentStates[record.sourceId] = state;
    }

    const ledger: LedgerState = connection.ledgerImported
      ? { customerLinks: [], invoiceStates: {}, paymentStates: {} }
      : await loadLedgerState(ctx.db, args.tenantId);
    for (const link of ledger.customerLinks) {
      if (!customers.has(link.clientId)) {
        customers.set(link.clientId, link.qboCustomerId);
      }
    }
    for (const [id, state] of Object.entries(ledger.invoiceStates)) {
      invoiceStates[id] ??= state;
    }
    for (const [id, state] of Object.entries(ledger.paymentStates)) {
      paymentStates[id] ??= state;
    }

    return {
      connection,
      invoices: eligibleInvoices,
      payments: eligiblePayments,
      clientsById,
      customerLinks: [...customers.entries()].map(
        ([clientId, qboCustomerId]) => ({ clientId, qboCustomerId }),
      ),
      invoiceStates,
      paymentStates,
      ledger,
    };
  },
});

// Every write below goes through a generated command as the tenant's system
// identity (convex/lib/oauthConnectionStore.ts). Callers: completeConnection
// and disconnect (after requireManager) and the scheduled reconcileTenant.

export const recordConnection = internalMutation({
  args: {
    tenantId: v.string(),
    connectionId: v.string(),
    realmId: v.string(),
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
      externalAccountId: args.realmId,
      displayName: "QuickBooks",
      refreshToken: args.refreshToken,
      connectedById: args.connectedBy,
      grantedAt: args.connectedAt,
    });
  },
});

/** QuickBooks rotated the refresh token during a reconcile. */
export const rotateCredential = internalMutation({
  args: {
    tenantId: v.string(),
    connectionId: v.string(),
    /** Plaintext; IntegrationConnection seals it. */
    refreshToken: v.string(),
  },
  handler: async (ctx, args) => {
    await new OAuthConnectionStore(ctx, args.tenantId, PROVIDER).rotate(
      args.connectionId,
      args.refreshToken,
    );
  },
});

export const recordDisconnection = internalMutation({
  args: {
    tenantId: v.string(),
    realmId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const { connection, row } = await activeConnection(ctx.db, args.tenantId);
    // Never connected at all: nothing to record.
    if (!row && !connection) return;
    await new OAuthConnectionStore(ctx, args.tenantId, PROVIDER).disconnect(
      args.realmId,
      "QuickBooks",
    );
  },
});

export const recordCustomerLink = internalMutation({
  args: {
    tenantId: v.string(),
    clientId: v.string(),
    qboCustomerId: v.string(),
    connectionId: v.string(),
    linkedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await new OAuthConnectionStore(ctx, args.tenantId, PROVIDER).recordSync({
      tenantId: args.tenantId,
      provider: PROVIDER,
      recordType: "customer",
      sourceId: args.clientId,
      externalId: args.qboCustomerId,
      engagementId: args.connectionId,
      status: "linked",
      contentSignature: null,
      syncedAt: args.linkedAt,
      error: null,
    });
  },
});

export const recordEntitySync = internalMutation({
  args: {
    tenantId: v.string(),
    entity: v.union(v.literal("invoice"), v.literal("payment")),
    sourceId: v.string(),
    qboId: v.union(v.string(), v.null()),
    connectionId: v.string(),
    status: v.union(v.literal("synced"), v.literal("failed")),
    syncedAt: v.number(),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await new OAuthConnectionStore(ctx, args.tenantId, PROVIDER).recordSync({
      tenantId: args.tenantId,
      provider: PROVIDER,
      recordType: args.entity,
      sourceId: args.sourceId,
      externalId: args.qboId,
      engagementId: args.connectionId,
      status: args.status,
      contentSignature: null,
      syncedAt: args.syncedAt,
      error: args.error,
    });
  },
});

const ledgerSyncStateArgs = v.object({
  sourceId: v.string(),
  status: v.union(v.literal("synced"), v.literal("failed")),
  qboId: v.union(v.string(), v.null()),
  connectionId: v.string(),
  syncedAt: v.number(),
  error: v.union(v.string(), v.null()),
});

/**
 * First reconcile of a tenant still on the ledger: move the connection to
 * IntegrationConnection (keeping its connection id, so running chains carry
 * on) and copy the ledger's customer links and invoice / payment state into
 * IntegrationSyncRecord rows. Also runs once for a row connected after
 * 2026-09-29, so records synced by an earlier connection are not sent twice.
 */
export const adoptLedgerState = internalMutation({
  args: {
    tenantId: v.string(),
    connection: v.union(
      v.null(),
      v.object({
        connectionId: v.string(),
        realmId: v.string(),
        connectedAt: v.number(),
        connectedBy: v.string(),
        refreshToken: v.string(),
      }),
    ),
    customerLinks: v.array(
      v.object({
        clientId: v.string(),
        qboCustomerId: v.string(),
        connectionId: v.string(),
        linkedAt: v.number(),
      }),
    ),
    invoices: v.array(ledgerSyncStateArgs),
    payments: v.array(ledgerSyncStateArgs),
  },
  handler: async (ctx, args) => {
    const store = new OAuthConnectionStore(ctx, args.tenantId, PROVIDER);
    if (args.connection && !(await store.row())) {
      await store.grant({
        tenantId: args.tenantId,
        provider: PROVIDER,
        engagementId: args.connection.connectionId,
        externalAccountId: args.connection.realmId,
        displayName: "QuickBooks",
        refreshToken: args.connection.refreshToken,
        connectedById: args.connection.connectedBy,
        grantedAt: args.connection.connectedAt,
      });
    }
    for (const link of args.customerLinks) {
      await store.importLedgerSync({
        tenantId: args.tenantId,
        provider: PROVIDER,
        recordType: "customer",
        sourceId: link.clientId,
        externalId: link.qboCustomerId,
        engagementId: link.connectionId || null,
        status: "linked",
        contentSignature: null,
        syncedAt: link.linkedAt,
        error: null,
      });
    }
    for (const [recordType, states] of [
      ["invoice", args.invoices],
      ["payment", args.payments],
    ] as const) {
      for (const state of states) {
        await store.importLedgerSync({
          tenantId: args.tenantId,
          provider: PROVIDER,
          recordType,
          sourceId: state.sourceId,
          externalId: state.qboId,
          engagementId: state.connectionId,
          status: state.status,
          contentSignature: null,
          syncedAt: state.syncedAt,
          error: state.error,
        });
      }
    }
    await store.markLedgerImported();
  },
});

export const recordReconciliation = internalMutation({
  args: {
    tenantId: v.string(),
    connectionId: v.string(),
    status: v.string(),
    invoicesSynced: v.number(),
    paymentsSynced: v.number(),
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
        invoicesSynced: args.invoicesSynced,
        paymentsSynced: args.paymentsSynced,
        skipped: args.skipped,
      },
    });
  },
});

function ledgerStateList(states: Record<string, EntitySyncState>) {
  return Object.entries(states).map(([sourceId, state]) => ({
    sourceId,
    status: state.status,
    qboId: state.qboId,
    connectionId: state.connectionId,
    syncedAt: state.syncedAt,
    error: state.error,
  }));
}

export const reconcileTenant = internalAction({
  args: {
    tenantId: v.string(),
    connectionId: v.string(),
    scheduleNext: v.boolean(),
  },
  handler: async (ctx, args): Promise<ReconciliationResult> => {
    const context: ReconciliationContext | null = await ctx.runQuery(
      internal.qboSync.loadReconciliationContext,
      // Only the fields it declares: passing `args` whole (with scheduleNext)
      // failed argument validation, so no reconcile ever ran (fixed 2026-09-29).
      { tenantId: args.tenantId, connectionId: args.connectionId },
    );
    if (!context) {
      return {
        status: "disconnected",
        invoicesSynced: 0,
        paymentsSynced: 0,
        skipped: 0,
        failed: 0,
      };
    }

    const environment = providerEnvironment();
    const pending = context.invoices.length + context.payments.length;

    let accessToken: string;
    let newRefreshToken: string | undefined;
    try {
      const refreshToken = await decrypt(
        context.connection.refreshToken.ciphertext,
        context.connection.refreshToken.keyId,
        { ctx, entity: CONNECTION_ENTITY, property: "refreshToken" },
      );
      if (!context.connection.ledgerImported) {
        await ctx.runMutation(internal.qboSync.adoptLedgerState, {
          tenantId: args.tenantId,
          connection:
            context.connection.source === "ledger"
              ? {
                  connectionId: context.connection.connectionId,
                  realmId: context.connection.realmId,
                  connectedAt: context.connection.connectedAt,
                  connectedBy: context.connection.connectedBy,
                  refreshToken,
                }
              : null,
          customerLinks: context.ledger.customerLinks,
          invoices: ledgerStateList(context.ledger.invoiceStates),
          payments: ledgerStateList(context.ledger.paymentStates),
        });
      }
      const tokens = await refreshQboAccessToken(environment, refreshToken);
      accessToken = tokens.accessToken;
      newRefreshToken = tokens.refreshToken;
    } catch (cause) {
      const error = safeQboProviderMessage(cause);
      const needsReconnect = /invalid_grant|revoked|expired/iu.test(error);
      await ctx.runMutation(internal.qboSync.recordReconciliation, {
        tenantId: args.tenantId,
        connectionId: args.connectionId,
        status: needsReconnect ? "needs_reconnect" : "partial",
        invoicesSynced: 0,
        paymentsSynced: 0,
        skipped: 0,
        failed: pending,
        error,
        reconciledAt: Date.now(),
      });
      if (args.scheduleNext && !needsReconnect) {
        await ctx.scheduler.runAfter(
          RETRY_INTERVAL_MS,
          internal.qboSync.reconcileTenant,
          args,
        );
      }
      return {
        status: needsReconnect ? "needs_reconnect" : "partial",
        invoicesSynced: 0,
        paymentsSynced: 0,
        skipped: 0,
        failed: pending,
        error,
      };
    }

    // QuickBooks rotates the refresh token on every refresh; persist the new one
    // so the next reconcile keeps working.
    if (newRefreshToken) {
      await ctx.runMutation(internal.qboSync.rotateCredential, {
        tenantId: args.tenantId,
        connectionId: context.connection.connectionId,
        refreshToken: newRefreshToken,
      });
    }

    const itemId = await resolveQboServiceItemId({
      config: environment,
      realmId: context.connection.realmId,
      accessToken,
    }).catch(() => null);
    if (!itemId) {
      const error =
        "QuickBooks has no active Service item to invoice against. Add a Service item in QuickBooks, then sync again.";
      await ctx.runMutation(internal.qboSync.recordReconciliation, {
        tenantId: args.tenantId,
        connectionId: args.connectionId,
        status: "needs_setup",
        invoicesSynced: 0,
        paymentsSynced: 0,
        skipped: 0,
        failed: pending,
        error,
        reconciledAt: Date.now(),
      });
      if (args.scheduleNext) {
        await ctx.scheduler.runAfter(
          RETRY_INTERVAL_MS,
          internal.qboSync.reconcileTenant,
          args,
        );
      }
      return {
        status: "needs_setup",
        invoicesSynced: 0,
        paymentsSynced: 0,
        skipped: 0,
        failed: pending,
        error,
      };
    }

    const result: ReconciliationResult = {
      status: "ok",
      invoicesSynced: 0,
      paymentsSynced: 0,
      skipped: 0,
      failed: 0,
    };
    const customerCache = new Map(
      context.customerLinks.map(
        (link) => [link.clientId, link.qboCustomerId] as const,
      ),
    );
    const invoiceIdMap = new Map<string, string>();
    for (const [invoiceId, state] of Object.entries(context.invoiceStates)) {
      if (state.status === "synced" && state.qboId) {
        invoiceIdMap.set(invoiceId, state.qboId);
      }
    }

    async function ensureCustomer(client: Doc<"clients">): Promise<string> {
      const clientId = String(client._id);
      const cached = customerCache.get(clientId);
      if (cached) return cached;
      const displayName = qboCustomerDisplayName(client);
      let qboCustomerId = await findQboCustomerId({
        config: environment,
        realmId: context!.connection.realmId,
        accessToken,
        displayName,
      });
      if (!qboCustomerId) {
        qboCustomerId = await createQboEntity({
          config: environment,
          realmId: context!.connection.realmId,
          accessToken,
          entity: "customer",
          resource: buildQboCustomer(client),
        });
      }
      customerCache.set(clientId, qboCustomerId);
      await ctx.runMutation(internal.qboSync.recordCustomerLink, {
        tenantId: args.tenantId,
        clientId,
        qboCustomerId,
        connectionId: args.connectionId,
        linkedAt: Date.now(),
      });
      return qboCustomerId;
    }

    for (const invoice of context.invoices) {
      const invoiceId = String(invoice._id);
      const state = context.invoiceStates[invoiceId];
      if (state?.status === "synced") {
        result.skipped += 1;
        continue;
      }
      const client = context.clientsById[String(invoice.clientId)];
      if (!client) {
        result.skipped += 1;
        continue;
      }
      try {
        const qboCustomerId = await ensureCustomer(client);
        const qboInvoiceId = await createQboEntity({
          config: environment,
          realmId: context.connection.realmId,
          accessToken,
          entity: "invoice",
          resource: buildQboInvoice({
            qboCustomerId,
            itemId,
            invoiceNumber: invoice.invoiceNumber ?? null,
            total: invoice.total,
            issuedAt: invoice.issuedAt ?? null,
            dueDate: invoice.dueDate ?? null,
          }),
        });
        invoiceIdMap.set(invoiceId, qboInvoiceId);
        await ctx.runMutation(internal.qboSync.recordEntitySync, {
          tenantId: args.tenantId,
          entity: "invoice",
          sourceId: invoiceId,
          qboId: qboInvoiceId,
          connectionId: args.connectionId,
          status: "synced",
          syncedAt: Date.now(),
          error: null,
        });
        result.invoicesSynced += 1;
      } catch (cause) {
        const error = safeQboProviderMessage(cause);
        await ctx.runMutation(internal.qboSync.recordEntitySync, {
          tenantId: args.tenantId,
          entity: "invoice",
          sourceId: invoiceId,
          qboId: null,
          connectionId: args.connectionId,
          status: "failed",
          syncedAt: Date.now(),
          error,
        });
        result.failed += 1;
        result.status = "partial";
        result.error ??= error;
      }
    }

    for (const payment of context.payments) {
      const paymentId = String(payment._id);
      const state = context.paymentStates[paymentId];
      if (state?.status === "synced") {
        result.skipped += 1;
        continue;
      }
      const qboInvoiceId = invoiceIdMap.get(String(payment.invoiceId));
      const qboCustomerId = customerCache.get(String(payment.clientId));
      if (!qboInvoiceId || !qboCustomerId) {
        // Invoice not synced yet — this payment is picked up on the next pass.
        result.skipped += 1;
        continue;
      }
      try {
        const qboPaymentId = await createQboEntity({
          config: environment,
          realmId: context.connection.realmId,
          accessToken,
          entity: "payment",
          resource: buildQboPayment({
            qboCustomerId,
            qboInvoiceId,
            amount: payment.amount,
            recordedAt: payment.recordedAt ?? null,
          }),
        });
        await ctx.runMutation(internal.qboSync.recordEntitySync, {
          tenantId: args.tenantId,
          entity: "payment",
          sourceId: paymentId,
          qboId: qboPaymentId,
          connectionId: args.connectionId,
          status: "synced",
          syncedAt: Date.now(),
          error: null,
        });
        result.paymentsSynced += 1;
      } catch (cause) {
        const error = safeQboProviderMessage(cause);
        await ctx.runMutation(internal.qboSync.recordEntitySync, {
          tenantId: args.tenantId,
          entity: "payment",
          sourceId: paymentId,
          qboId: null,
          connectionId: args.connectionId,
          status: "failed",
          syncedAt: Date.now(),
          error,
        });
        result.failed += 1;
        result.status = "partial";
        result.error ??= error;
      }
    }

    await ctx.runMutation(internal.qboSync.recordReconciliation, {
      tenantId: args.tenantId,
      connectionId: args.connectionId,
      status: result.status,
      invoicesSynced: result.invoicesSynced,
      paymentsSynced: result.paymentsSynced,
      skipped: result.skipped,
      failed: result.failed,
      error: result.error ?? null,
      reconciledAt: Date.now(),
    });

    if (args.scheduleNext) {
      const active: ConnectionPayload | null = await ctx.runQuery(
        internal.qboSync.loadActiveConnection,
        { tenantId: args.tenantId },
      );
      if (active?.connectionId === args.connectionId) {
        await ctx.scheduler.runAfter(
          SYNC_INTERVAL_MS,
          internal.qboSync.reconcileTenant,
          args,
        );
      }
    }
    return result;
  },
});
