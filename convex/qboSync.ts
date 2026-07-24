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

const CONNECTION_ENTITY = "QuickBooksConnection";
const CUSTOMER_ENTITY = "QuickBooksCustomerLink";
const INVOICE_ENTITY = "QuickBooksInvoiceLink";
const PAYMENT_ENTITY = "QuickBooksPaymentLink";
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

interface EncryptedRefreshToken {
  ciphertext: string;
  keyId: string;
}

interface ConnectionPayload {
  tenantId: string;
  connectionId: string;
  realmId: string;
  connectedAt: number;
  connectedBy: string;
  refreshToken: EncryptedRefreshToken;
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

function parseConnection(payload: unknown): ConnectionPayload | null {
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
    realmId,
    connectedAt,
    connectedBy,
    refreshToken: { ciphertext, keyId },
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
        (row.type === "QuickBooksConnected" ||
          row.type === "QuickBooksDisconnected"),
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  return latest?.type === "QuickBooksConnected"
    ? parseConnection(latest.payload)
    : null;
}

function latestStatesByEntity(
  rows: Array<{ entityId: string; payload: unknown; createdAt: number }>,
  tenantId: string,
): Record<string, EntitySyncState> {
  const result: Record<string, EntitySyncState> = {};
  for (const row of rows.sort(
    (left, right) => right.createdAt - left.createdAt,
  )) {
    if (asRecord(row.payload).tenantId !== tenantId) continue;
    if (result[row.entityId]) continue;
    const state = parseSyncState(row.payload);
    if (state) result[row.entityId] = state;
  }
  return result;
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
          row.type === "QuickBooksReconciled",
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    const sync = asRecord(lastSync?.payload);
    return {
      connected: connection != null,
      realmId: connection?.realmId ?? null,
      connectedAt: connection?.connectedAt ?? null,
      providerConfigured: providerConfigured(),
      redirectUri: process.env.QBO_REDIRECT_URI?.trim() ?? null,
      canManage: canManage(auth.role),
      lastSync:
        lastSync == null
          ? null
          : {
              at: lastSync.createdAt,
              status: stringValue(sync.status) ?? "unknown",
              invoicesSynced: numberValue(sync.invoicesSynced) ?? 0,
              paymentsSynced: numberValue(sync.paymentsSynced) ?? 0,
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
      const encrypted = await encrypt(tokens.refreshToken, {
        ctx,
        entity: CONNECTION_ENTITY,
        property: "refreshToken",
      });
      const connectionId = crypto.randomUUID();
      await ctx.runMutation(internal.qboSync.recordConnection, {
        tenantId,
        connectionId,
        realmId: args.realmId,
        connectedAt: Date.now(),
        connectedBy: auth.id,
        refreshToken: encrypted,
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

    const [
      invoices,
      payments,
      clients,
      customerRows,
      invoiceRows,
      paymentRows,
    ] = await Promise.all([
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
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", CUSTOMER_ENTITY))
        .collect(),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", INVOICE_ENTITY))
        .collect(),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", PAYMENT_ENTITY))
        .collect(),
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

    const customerLinks: CustomerLink[] = [];
    const seenClient = new Set<string>();
    for (const row of customerRows.sort(
      (left, right) => right.createdAt - left.createdAt,
    )) {
      const payload = asRecord(row.payload);
      if (payload.tenantId !== args.tenantId) continue;
      const clientId = stringValue(payload.clientId);
      const qboCustomerId = stringValue(payload.qboCustomerId);
      if (!clientId || !qboCustomerId || seenClient.has(clientId)) continue;
      seenClient.add(clientId);
      customerLinks.push({ clientId, qboCustomerId });
    }

    return {
      connection,
      invoices: eligibleInvoices,
      payments: eligiblePayments,
      clientsById,
      customerLinks,
      invoiceStates: latestStatesByEntity(invoiceRows, args.tenantId),
      paymentStates: latestStatesByEntity(paymentRows, args.tenantId),
    };
  },
});

export const recordConnection = internalMutation({
  args: {
    tenantId: v.string(),
    connectionId: v.string(),
    realmId: v.string(),
    connectedAt: v.number(),
    connectedBy: v.string(),
    refreshToken: v.object({ ciphertext: v.string(), keyId: v.string() }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
      type: "QuickBooksConnected",
      entity: CONNECTION_ENTITY,
      entityId: args.tenantId,
      payload: args,
      createdAt: Date.now(),
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
      type: "QuickBooksDisconnected",
      entity: CONNECTION_ENTITY,
      entityId: args.tenantId,
      payload: args,
      createdAt: args.disconnectedAt,
    });
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
    await ctx.db.insert("manifestEvents", {
      type: "QuickBooksCustomerLinked",
      entity: CUSTOMER_ENTITY,
      entityId: args.clientId,
      payload: args,
      createdAt: args.linkedAt,
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
    await ctx.db.insert("manifestEvents", {
      type:
        args.entity === "invoice"
          ? args.status === "synced"
            ? "QuickBooksInvoiceSynced"
            : "QuickBooksInvoiceSyncFailed"
          : args.status === "synced"
            ? "QuickBooksPaymentSynced"
            : "QuickBooksPaymentSyncFailed",
      entity: args.entity === "invoice" ? INVOICE_ENTITY : PAYMENT_ENTITY,
      entityId: args.sourceId,
      payload: {
        tenantId: args.tenantId,
        qboId: args.qboId,
        connectionId: args.connectionId,
        status: args.status,
        syncedAt: args.syncedAt,
        error: args.error,
      },
      createdAt: args.syncedAt,
    });
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
    await ctx.db.insert("manifestEvents", {
      type: "QuickBooksReconciled",
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
      internal.qboSync.loadReconciliationContext,
      args,
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
      const encrypted = await encrypt(newRefreshToken, {
        ctx,
        entity: CONNECTION_ENTITY,
        property: "refreshToken",
      });
      await ctx.runMutation(internal.qboSync.recordConnection, {
        tenantId: context.connection.tenantId,
        connectionId: context.connection.connectionId,
        realmId: context.connection.realmId,
        connectedAt: context.connection.connectedAt,
        connectedBy: context.connection.connectedBy,
        refreshToken: encrypted,
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
