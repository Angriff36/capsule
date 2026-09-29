import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import { parseSealedEnvelope } from "./lib/oauthConnectionStore";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";

// Outbound webhook integrations. Operators register HTTP endpoints that receive
// a structured JSON payload when a subscribed domain event fires
// (EventApproved, InvoicePaymentApplied, DeliveryTransitStarted).
// ~~Endpoint registrations, dispatch ticks, and per-event delivery attempts are
// recorded on the manifestEvents outbox, matching the googleCalendar /
// invoicePayments author-seam precedent.~~
// Correction 2026-09-29: endpoints and delivery attempts are the
// OutboundWebhookEndpoint / OutboundWebhookDelivery entities
// (src/integrations/outbound-webhook.manifest), written only through their
// generated commands as the tenant's system identity after this file's own
// checks (manager role, endpoint limit, URL rules). Dispatch ticks and chain
// ownership are scheduler bookkeeping in the `webhookDispatchStates` table
// (storage-only WebhookDispatchState), written directly — see
// scripts/governed-write-exceptions.json. Rows written before that date under
// the ledger pseudo-entities WebhookEndpoint / WebhookDelivery are still read
// (same keys) until the tenant's next dispatch tick copies its endpoints over;
// nothing new is written to the ledger.
// Outbound delivery is an explicit Convex worker (action) — Manifest `webhook`
// is inbound only; see docs/generation/2026-07-17-command-api-surface-boundary.md.

const ENDPOINT_ENTITY = "WebhookEndpoint";
const DELIVERY_ENTITY = "WebhookDelivery";

const DISPATCH_INTERVAL_MS = 60_000;
const IDLE_INTERVAL_MS = 5 * 60_000;
const TICK_COLLAPSE_MS = Math.round(DISPATCH_INTERVAL_MS * 0.5);
const HTTP_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MAX_EVENTS_PER_TYPE = 25;
const MAX_ENDPOINTS = 25;

// Subscribable domain events. Each maps a friendly trigger to the real outbox
// event type emitted by generated mutations. Adding a row here is all that is
// required to expose a new trigger to operators.
export const SUBSCRIBABLE_EVENTS = [
  {
    type: "EventApproved",
    label: "Event approved",
    entity: "Event",
    description: "An event was approved.",
  },
  {
    type: "InvoicePaymentApplied",
    label: "Invoice paid",
    entity: "Invoice",
    description: "A payment was applied to an invoice.",
  },
  {
    type: "DeliveryTransitStarted",
    label: "Delivery dispatched",
    entity: "Delivery",
    description: "A delivery started transit.",
  },
] as const;

const SUBSCRIBABLE_TYPES = new Set<string>(
  SUBSCRIBABLE_EVENTS.map((e) => e.type),
);

interface EncryptedSecret {
  ciphertext: string;
  keyId: string;
}

interface EndpointRecord {
  endpointId: string;
  tenantId: string;
  url: string;
  events: readonly string[];
  hasSecret: boolean;
  secret: EncryptedSecret | null;
  label: string;
  registeredAt: number;
  registeredBy: string;
  /** Newest delivered source event; null until the first success. */
  deliveredThrough: number | null;
  /** `ledger`: still only in the pre-2026-09-29 manifestEvents rows. */
  source: "entity" | "ledger";
}

export interface EndpointView {
  endpointId: string;
  url: string;
  label: string;
  events: string[];
  eventLabels: string[];
  hasSecret: boolean;
  registeredAt: number;
  registeredBy: string;
}

export interface DeliveryView {
  deliveryId: string;
  endpointId: string;
  endpointLabel: string;
  eventType: string;
  status: "succeeded" | "failed";
  attempt: number;
  httpStatus: number | null;
  error: string | null;
  deliveredAt: number;
}

interface EndpointLogRow {
  type: string;
  payload: unknown;
  createdAt: number;
}

interface CandidateEvent {
  sourceEventId: string;
  eventType: string;
  occurredAt: number;
  payload: unknown;
  /** Delivery history of this (endpoint, event, type). */
  succeeded: boolean;
  failedAttempts: number;
}

interface LedgerAttempt {
  deliveryId: string;
  sourceEventId: string;
  eventType: string;
  status: "succeeded" | "failed";
  attempt: number;
  httpStatus: number | null;
  error: string | null;
  occurredAt: number;
  deliveredAt: number;
}

interface LedgerImport {
  endpoint: EndpointRecord;
  attempts: LedgerAttempt[];
}

interface DispatchContext {
  endpoints: EndpointRecord[];
  lastTickAt: number | null;
  currentChainId: string | null;
  /** Ledger endpoints (with their open delivery history) still to copy over. */
  ledgerImports: LedgerImport[] | null;
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
      "Only an organization manager can configure outbound webhooks.",
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

function normalizeUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConvexError("Provide a valid http(s) webhook URL.");
  }
  const localDevelopmentOrigin =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]");
  if (parsed.protocol !== "https:" && !localDevelopmentOrigin) {
    throw new ConvexError(
      "Webhook URLs must use https (use a localhost URL for local testing).",
    );
  }
  return parsed.toString();
}

function subscribable(events: readonly unknown[]): string[] {
  return events
    .map((entry) => stringValue(entry))
    .filter(
      (entry): entry is string =>
        entry !== null && SUBSCRIBABLE_TYPES.has(entry),
    );
}

/** A legacy ledger `WebhookEndpointRegistered` payload. */
function parseLedgerEndpoint(payload: unknown): EndpointRecord | null {
  const value = asRecord(payload);
  const endpointId = stringValue(value.endpointId);
  const tenantId = stringValue(value.tenantId);
  const url = stringValue(value.url);
  const label = stringValue(value.label) ?? "";
  const registeredAt = numberValue(value.registeredAt);
  const registeredBy = stringValue(value.registeredBy);
  if (
    !endpointId ||
    !tenantId ||
    !url ||
    registeredAt == null ||
    !registeredBy
  ) {
    return null;
  }
  const events = subscribable(Array.isArray(value.events) ? value.events : []);
  const secretRecord = asRecord(value.secret);
  const secretCiphertext = stringValue(secretRecord.ciphertext);
  const secretKeyId = stringValue(secretRecord.keyId);
  const secret =
    secretCiphertext && secretKeyId
      ? { ciphertext: secretCiphertext, keyId: secretKeyId }
      : null;
  return {
    endpointId,
    tenantId,
    url,
    events,
    hasSecret: Boolean(secret),
    secret,
    label,
    registeredAt,
    registeredBy,
    deliveredThrough: null,
    source: "ledger",
  };
}

function endpointFromRow(
  row: Doc<"outboundWebhookEndpoints">,
): EndpointRecord | null {
  if (row.status !== "active" || !row.endpointKey) return null;
  const secret = parseSealedEnvelope(row.signingSecret);
  return {
    endpointId: row.endpointKey,
    tenantId: row.tenantId,
    url: row.url,
    events: subscribable(row.events),
    hasSecret: Boolean(secret),
    secret,
    label: row.label,
    registeredAt: row.registeredAt ?? row._creationTime,
    registeredBy: row.registeredById ?? "",
    deliveredThrough: row.deliveredThrough ?? null,
    source: "entity",
  };
}

function toView(endpoint: EndpointRecord): EndpointView {
  const byType = new Map<string, string>(
    SUBSCRIBABLE_EVENTS.map((e) => [e.type, e.label]),
  );
  return {
    endpointId: endpoint.endpointId,
    url: endpoint.url,
    label: endpoint.label || endpoint.url,
    events: [...endpoint.events],
    eventLabels: endpoint.events.map((e) => byType.get(e) ?? e),
    hasSecret: endpoint.hasSecret,
    registeredAt: endpoint.registeredAt,
    registeredBy: endpoint.registeredBy,
  };
}

function latestEndpointState(rows: EndpointLogRow[]): EndpointRecord | null {
  const sorted = [...rows].sort(
    (left, right) => right.createdAt - left.createdAt,
  );
  for (const row of sorted) {
    if (row.type === "WebhookEndpointRemoved") return null;
    if (row.type === "WebhookEndpointRegistered") {
      return parseLedgerEndpoint(row.payload);
    }
  }
  return null;
}

async function dispatchState(
  db: QueryCtx["db"],
  tenantId: string,
): Promise<Doc<"webhookDispatchStates"> | null> {
  return await db
    .query("webhookDispatchStates")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .first();
}

async function endpointRow(
  db: QueryCtx["db"],
  tenantId: string,
  endpointKey: string,
): Promise<Doc<"outboundWebhookEndpoints"> | null> {
  const rows = await db
    .query("outboundWebhookEndpoints")
    .withIndex("by_endpointKey", (q) => q.eq("endpointKey", endpointKey))
    .collect();
  return rows.find((row) => row.tenantId === tenantId) ?? null;
}

/**
 * Active ledger endpoints of this tenant not (yet) copied to the entity. The
 * ledger rows name the tenant only in their payload, so this reads the frozen
 * WebhookEndpoint rows (registrations and removals only — no new ones since
 * 2026-09-29). It runs only until the tenant's first dispatch tick copies
 * them over and marks `legacyImportedAt`.
 */
async function ledgerOnlyEndpoints(
  db: QueryCtx["db"],
  tenantId: string,
  knownKeys: ReadonlySet<string>,
): Promise<EndpointRecord[]> {
  const rows = await db
    .query("manifestEvents")
    .withIndex("by_entity", (q) => q.eq("entity", ENDPOINT_ENTITY))
    .collect();
  const byEndpoint = new Map<string, EndpointLogRow[]>();
  for (const row of rows) {
    const payload = asRecord(row.payload);
    if (payload.tenantId !== tenantId) continue;
    const endpointId = stringValue(payload.endpointId);
    if (!endpointId || knownKeys.has(endpointId)) continue;
    const bucket = byEndpoint.get(endpointId) ?? [];
    bucket.push({
      type: row.type,
      payload: row.payload,
      createdAt: row.createdAt,
    });
    byEndpoint.set(endpointId, bucket);
  }
  const endpoints: EndpointRecord[] = [];
  for (const bucket of byEndpoint.values()) {
    const state = latestEndpointState(bucket);
    if (state) endpoints.push(state);
  }
  return endpoints;
}

/** The tenant's active endpoints with at least one subscribed event. */
async function activeEndpoints(
  db: QueryCtx["db"],
  tenantId: string,
): Promise<{ endpoints: EndpointRecord[]; legacyImported: boolean }> {
  const [rows, state] = await Promise.all([
    db
      .query("outboundWebhookEndpoints")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
    dispatchState(db, tenantId),
  ]);
  const endpoints: EndpointRecord[] = [];
  const known = new Set<string>();
  for (const row of rows) {
    if (row.endpointKey) known.add(row.endpointKey);
    const endpoint = endpointFromRow(row);
    if (endpoint) endpoints.push(endpoint);
  }
  const legacyImported = state?.legacyImportedAt != null;
  if (!legacyImported) {
    endpoints.push(...(await ledgerOnlyEndpoints(db, tenantId, known)));
  }
  return {
    endpoints: endpoints.filter((endpoint) => endpoint.events.length > 0),
    legacyImported,
  };
}

/**
 * The attempts a ledger endpoint's future dispatch still depends on: every
 * attempt at or after its newest success (and all of them before a first
 * success). Indexed: ledger delivery rows are keyed
 * `<endpointId>:<sourceEventId>`, so one prefix range reads one endpoint.
 */
async function ledgerAttempts(
  db: QueryCtx["db"],
  tenantId: string,
  endpointId: string,
): Promise<{ attempts: LedgerAttempt[]; watermark: number | null }> {
  const rows = await db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) =>
      q.gte("entityId", `${endpointId}:`).lt("entityId", `${endpointId};`),
    )
    .collect();
  const all: LedgerAttempt[] = [];
  let watermark: number | null = null;
  for (const row of rows) {
    if (row.entity !== DELIVERY_ENTITY) continue;
    const payload = asRecord(row.payload);
    if (payload.tenantId !== tenantId) continue;
    const status = stringValue(payload.status);
    const sourceEventId = stringValue(payload.sourceEventId);
    const eventType = stringValue(payload.eventType);
    if (
      (status !== "succeeded" && status !== "failed") ||
      !sourceEventId ||
      !eventType
    ) {
      continue;
    }
    const occurredAt = numberValue(payload.occurredAt) ?? row.createdAt;
    if (status === "succeeded") {
      watermark = Math.max(watermark ?? 0, occurredAt);
    }
    all.push({
      deliveryId: stringValue(payload.deliveryId) ?? String(row._id),
      sourceEventId,
      eventType,
      status,
      attempt: numberValue(payload.attempt) ?? 1,
      httpStatus: numberValue(payload.httpStatus),
      error: stringValue(payload.error),
      occurredAt,
      deliveredAt: row.createdAt,
    });
  }
  return {
    attempts: all.filter(
      (attempt) => watermark == null || attempt.occurredAt >= watermark,
    ),
    watermark,
  };
}

export const getCatalog = query({
  args: {},
  handler: async () => {
    return SUBSCRIBABLE_EVENTS.map((entry) => ({ ...entry }));
  },
});

export const listEndpoints = query({
  args: {},
  handler: async (ctx): Promise<EndpointView[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const { endpoints } = await activeEndpoints(ctx.db, auth.tenantId);
    return endpoints
      .map(toView)
      .sort((left, right) => left.registeredAt - right.registeredAt);
  },
});

/** An endpoint's label, from the entity or (for ledger ids) its ledger rows. */
async function endpointLabel(
  db: QueryCtx["db"],
  tenantId: string,
  endpointId: string,
): Promise<string | null> {
  const row = await endpointRow(db, tenantId, endpointId);
  if (row) return row.label || row.url;
  const ledger = await db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", endpointId))
    .collect();
  for (const entry of ledger) {
    if (
      entry.entity !== ENDPOINT_ENTITY ||
      entry.type !== "WebhookEndpointRegistered" ||
      asRecord(entry.payload).tenantId !== tenantId
    ) {
      continue;
    }
    const state = parseLedgerEndpoint(entry.payload);
    if (state) return state.label || state.url;
  }
  return null;
}

export const listDeliveries = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<DeliveryView[]> => {
    const auth = await getAuthContext(ctx);
    const tenantId = auth.tenantId;
    if (!tenantId) return [];
    const limit = Math.max(1, Math.min(50, args.limit ?? 20));
    const [entityRows, ledgerRows] = await Promise.all([
      ctx.db
        .query("outboundWebhookDeliveries")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .order("desc")
        .take(limit),
      // Attempts from before 2026-09-29: bounded, newest first, as before.
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", DELIVERY_ENTITY))
        .order("desc")
        .take(limit * 4),
    ]);
    const deliveries: Array<Omit<DeliveryView, "endpointLabel">> = [];
    const seen = new Set<string>();
    for (const row of entityRows) {
      const deliveryId = row.attemptId ?? String(row._id);
      seen.add(deliveryId);
      deliveries.push({
        deliveryId,
        endpointId: row.endpointKey,
        eventType: row.eventType,
        status: row.status,
        attempt: row.attempt,
        httpStatus: row.httpStatus ?? null,
        error: row.error ?? null,
        deliveredAt: row.deliveredAt ?? row._creationTime,
      });
    }
    for (const row of ledgerRows) {
      const payload = asRecord(row.payload);
      if (payload.tenantId !== tenantId) continue;
      const status = stringValue(payload.status);
      if (status !== "succeeded" && status !== "failed") continue;
      const endpointId = stringValue(payload.endpointId);
      const eventType = stringValue(payload.eventType);
      if (!endpointId || !eventType) continue;
      const deliveryId =
        stringValue(payload.deliveryId) ?? `${endpointId}:${eventType}`;
      // Copied into the entity on import: show it once.
      if (seen.has(deliveryId)) continue;
      deliveries.push({
        deliveryId,
        endpointId,
        eventType,
        status,
        attempt: numberValue(payload.attempt) ?? 1,
        httpStatus: numberValue(payload.httpStatus),
        error: stringValue(payload.error),
        deliveredAt: row.createdAt,
      });
    }
    const newest = deliveries
      .sort((left, right) => right.deliveredAt - left.deliveredAt)
      .slice(0, limit);
    const labels = new Map<string, string>();
    for (const delivery of newest) {
      if (labels.has(delivery.endpointId)) continue;
      labels.set(
        delivery.endpointId,
        (await endpointLabel(ctx.db, tenantId, delivery.endpointId)) ??
          delivery.endpointId,
      );
    }
    return newest.map((delivery) => ({
      ...delivery,
      endpointLabel: labels.get(delivery.endpointId) ?? delivery.endpointId,
    }));
  },
});

function validateEvents(events: string[]): string[] {
  if (events.length === 0) {
    throw new ConvexError("Select at least one event to subscribe to.");
  }
  const unique = Array.from(new Set(events));
  for (const entry of unique) {
    if (!SUBSCRIBABLE_TYPES.has(entry)) {
      throw new ConvexError(`Unsupported webhook event: ${entry}`);
    }
  }
  return unique;
}

export const registerEndpoint = action({
  args: {
    url: v.string(),
    label: v.string(),
    events: v.array(v.string()),
    secret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ endpointId: string }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    const url = normalizeUrl(args.url.trim());
    const label = args.label.trim().slice(0, 120);
    const events = validateEvents(args.events);
    if (url.length > 2048) {
      throw new ConvexError("Webhook URL is too long.");
    }
    const existing = await ctx.runQuery(
      internal.webhookIntegrations.countEndpoints,
      { tenantId },
    );
    if (existing >= MAX_ENDPOINTS) {
      throw new ConvexError(
        `This workspace already has the maximum of ${MAX_ENDPOINTS} webhook endpoints.`,
      );
    }
    const endpointId = crypto.randomUUID();
    // The generated command seals the secret (signingSecret is `encrypted`).
    await ctx.runMutation(internal.webhookIntegrations.recordEndpoint, {
      type: "WebhookEndpointRegistered",
      tenantId,
      endpointId,
      url,
      label,
      events,
      secret: args.secret?.trim() || null,
      registeredAt: Date.now(),
      registeredBy: auth.id,
    });
    // The newest chain owns the tenant; older chains end at their next tick,
    // so registering several endpoints never leaves several chains running.
    const chainId = crypto.randomUUID();
    await ctx.runMutation(internal.webhookIntegrations.recordChainStart, {
      tenantId,
      chainId,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.webhookIntegrations.dispatchPending,
      {
        tenantId,
        scheduleNext: true,
        chainId,
      },
    );
    return { endpointId };
  },
});

export const removeEndpoint = action({
  args: { endpointId: v.string() },
  handler: async (ctx, args): Promise<{ removed: true }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    const endpoint = await ctx.runQuery(
      internal.webhookIntegrations.loadEndpoint,
      { tenantId, endpointId: args.endpointId },
    );
    if (!endpoint) {
      throw new ConvexError("That webhook endpoint no longer exists.");
    }
    await ctx.runMutation(internal.webhookIntegrations.recordEndpoint, {
      type: "WebhookEndpointRemoved",
      tenantId,
      endpointId: args.endpointId,
      url: endpoint.url,
      label: endpoint.label,
      events: [...endpoint.events],
      secret: null,
      registeredAt: endpoint.registeredAt,
      registeredBy: endpoint.registeredBy,
    });
    return { removed: true };
  },
});

export const sendTest = action({
  args: { endpointId: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; httpStatus: number }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    const endpoint = await ctx.runQuery(
      internal.webhookIntegrations.loadEndpoint,
      { tenantId, endpointId: args.endpointId },
    );
    if (!endpoint) {
      throw new ConvexError("That webhook endpoint no longer exists.");
    }
    const payload = {
      message: "CapsuleX webhook test",
      endpointId: args.endpointId,
      tenantId,
    };
    const secret = await revealSecret(endpoint, ctx);
    const result = await postToEndpoint(
      endpoint.url,
      payload,
      "WebhookTest",
      secret,
    );
    await ctx.runMutation(internal.webhookIntegrations.recordDelivery, {
      tenantId,
      deliveryId: crypto.randomUUID(),
      endpointId: args.endpointId,
      sourceEventId: `test:${Date.now()}`,
      eventType: "WebhookTest",
      status: result.ok ? "succeeded" : "failed",
      attempt: 1,
      httpStatus: result.httpStatus,
      error: result.error,
      occurredAt: Date.now(),
      deliveredAt: Date.now(),
    });
    if (!result.ok) {
      throw new ConvexError(result.error ?? "Webhook test delivery failed.");
    }
    return { ok: true, httpStatus: result.httpStatus ?? 200 };
  },
});

export const countEndpoints = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args): Promise<number> => {
    return (await activeEndpoints(ctx.db, args.tenantId)).endpoints.length;
  },
});

export const loadEndpoint = internalQuery({
  args: { tenantId: v.string(), endpointId: v.string() },
  handler: async (ctx, args): Promise<EndpointRecord | null> => {
    const row = await endpointRow(ctx.db, args.tenantId, args.endpointId);
    if (row) return endpointFromRow(row);
    const state = await dispatchState(ctx.db, args.tenantId);
    if (state?.legacyImportedAt != null) return null;
    // Ledger endpoint rows are keyed entityId = endpointId.
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.endpointId))
      .collect();
    const bucket: EndpointLogRow[] = rows
      .filter(
        (entry) =>
          entry.entity === ENDPOINT_ENTITY &&
          asRecord(entry.payload).tenantId === args.tenantId,
      )
      .map((entry) => ({
        type: entry.type,
        payload: entry.payload,
        createdAt: entry.createdAt,
      }));
    const ledger = latestEndpointState(bucket);
    if (!ledger || ledger.tenantId !== args.tenantId) return null;
    return ledger;
  },
});

export const loadCandidateEvents = internalQuery({
  args: {
    tenantId: v.string(),
    eventType: v.string(),
    since: v.number(),
    endpointId: v.string(),
  },
  handler: async (ctx, args): Promise<CandidateEvent[]> => {
    // createdAt is stamped just before the insert, so every row with
    // createdAt >= since also has _creationTime >= since: an index range, not
    // a scan from the start of the event type.
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_type", (q) =>
        q.eq("type", args.eventType).gte("_creationTime", args.since),
      )
      .filter((q) => q.gte(q.field("createdAt"), args.since))
      .take(MAX_EVENTS_PER_TYPE * 4);
    const candidates: CandidateEvent[] = [];
    for (const row of rows) {
      if (asRecord(row.payload).tenantId !== args.tenantId) continue;
      candidates.push({
        sourceEventId: String(row._id),
        eventType: args.eventType,
        occurredAt: row.createdAt,
        payload: row.payload,
        succeeded: false,
        failedAttempts: 0,
      });
    }
    candidates.sort((left, right) => left.occurredAt - right.occurredAt);
    const selected = candidates.slice(0, MAX_EVENTS_PER_TYPE);
    for (const candidate of selected) {
      const attempts = await ctx.db
        .query("outboundWebhookDeliveries")
        .withIndex("by_deliveryKey", (q) =>
          q.eq(
            "deliveryKey",
            `${args.endpointId}:${candidate.sourceEventId}:${candidate.eventType}`,
          ),
        )
        .collect();
      for (const attempt of attempts) {
        if (attempt.tenantId !== args.tenantId) continue;
        if (attempt.status === "succeeded") candidate.succeeded = true;
        else candidate.failedAttempts += 1;
      }
    }
    return selected;
  },
});

export const loadDispatchContext = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args): Promise<DispatchContext> => {
    const [{ endpoints, legacyImported }, state] = await Promise.all([
      activeEndpoints(ctx.db, args.tenantId),
      dispatchState(ctx.db, args.tenantId),
    ]);
    let ledgerImports: LedgerImport[] | null = null;
    if (!legacyImported) {
      ledgerImports = [];
      for (const endpoint of endpoints) {
        if (endpoint.source !== "ledger") continue;
        const { attempts, watermark } = await ledgerAttempts(
          ctx.db,
          args.tenantId,
          endpoint.endpointId,
        );
        ledgerImports.push({
          endpoint: { ...endpoint, deliveredThrough: watermark },
          attempts,
        });
      }
    }
    return {
      endpoints,
      lastTickAt: state?.lastTickAt ?? null,
      currentChainId: state?.chainId ?? null,
      ledgerImports,
    };
  },
});

async function revealSecret(
  endpoint: EndpointRecord,
  ctx: unknown,
): Promise<string | null> {
  if (!endpoint.secret) return null;
  return decrypt(endpoint.secret.ciphertext, endpoint.secret.keyId, {
    ctx,
    entity: ENDPOINT_ENTITY,
    property: "secret",
  });
}

interface PostResult {
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
}

async function postToEndpoint(
  url: string,
  payload: unknown,
  eventType: string,
  secret: string | null,
): Promise<PostResult> {
  const body = JSON.stringify({
    eventType,
    occurredAt: Date.now(),
    data: payload,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Capsule-Event": eventType,
  };
  if (secret) {
    headers["X-Capsule-Signature"] = await signBody(body, secret);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      httpStatus: response.status,
      error: response.ok ? null : `Endpoint returned ${response.status}.`,
    };
  } catch (cause) {
    return {
      ok: false,
      httpStatus: null,
      error:
        cause instanceof DOMException && cause.name === "AbortError"
          ? "Endpoint timed out."
          : cause instanceof Error
            ? cause.message
            : "Endpoint delivery failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function signBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const bytes = new Uint8Array(signature);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

// Domain writes below go through the generated OutboundWebhookEndpoint /
// OutboundWebhookDelivery commands as the tenant's system identity (their
// guards admit only that identity). Callers: registerEndpoint / removeEndpoint
// / sendTest after requireManager, and the scheduled dispatchPending.

function systemContext(ctx: MutationCtx, tenantId: string): MutationCtx {
  return TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
}

async function registerEndpointRow(
  ctx: MutationCtx,
  input: {
    tenantId: string;
    endpointId: string;
    url: string;
    label: string;
    events: string[];
    secret: string | null;
    registeredAt: number;
    registeredBy: string;
    deliveredThrough: number | null;
  },
): Promise<void> {
  await systemContext(ctx, input.tenantId).runMutation(
    api.mutations.OutboundWebhookEndpoint_createViaRegister,
    {
      newEndpointKey: input.endpointId,
      url: input.url,
      label: input.label,
      events: input.events,
      signingSecret: input.secret ?? undefined,
      registeredById: input.registeredBy,
      registeredAt: input.registeredAt,
      deliveredThrough: input.deliveredThrough ?? undefined,
    },
  );
}

export const recordEndpoint = internalMutation({
  args: {
    type: v.union(
      v.literal("WebhookEndpointRegistered"),
      v.literal("WebhookEndpointRemoved"),
    ),
    tenantId: v.string(),
    endpointId: v.string(),
    url: v.string(),
    label: v.string(),
    events: v.array(v.string()),
    /** Plaintext signing secret; the generated command seals it. */
    secret: v.union(v.null(), v.string()),
    registeredAt: v.number(),
    registeredBy: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await endpointRow(ctx.db, args.tenantId, args.endpointId);
    if (args.type === "WebhookEndpointRegistered") {
      if (existing) return;
      await registerEndpointRow(ctx, { ...args, deliveredThrough: null });
      return;
    }
    // Removing an endpoint still only in the ledger: record it on the entity
    // first (without its secret), then remove it there.
    if (!existing) {
      await registerEndpointRow(ctx, {
        ...args,
        secret: null,
        deliveredThrough: null,
      });
    }
    const row = await endpointRow(ctx.db, args.tenantId, args.endpointId);
    if (!row || row.status !== "active") return;
    await systemContext(ctx, args.tenantId).runMutation(
      api.mutations.OutboundWebhookEndpoint_remove,
      { docId: row._id },
    );
  },
});

const attemptArgs = {
  deliveryId: v.string(),
  sourceEventId: v.string(),
  eventType: v.string(),
  status: v.union(v.literal("succeeded"), v.literal("failed")),
  attempt: v.number(),
  httpStatus: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
  occurredAt: v.number(),
  deliveredAt: v.number(),
};

async function recordAttempt(
  ctx: MutationCtx,
  tenantId: string,
  endpointId: string,
  attempt: {
    deliveryId: string;
    sourceEventId: string;
    eventType: string;
    status: "succeeded" | "failed";
    attempt: number;
    httpStatus: number | null;
    error: string | null;
    occurredAt: number;
    deliveredAt: number;
  },
): Promise<void> {
  await systemContext(ctx, tenantId).runMutation(
    api.mutations.OutboundWebhookDelivery_createViaRecord,
    {
      newAttemptId: attempt.deliveryId,
      endpointKey: endpointId,
      sourceEventId: attempt.sourceEventId,
      eventType: attempt.eventType,
      status: attempt.status,
      attempt: attempt.attempt,
      httpStatus: attempt.httpStatus ?? undefined,
      error: attempt.error ?? undefined,
      occurredAt: attempt.occurredAt,
      deliveredAt: attempt.deliveredAt,
    },
  );
}

export const recordDelivery = internalMutation({
  args: { tenantId: v.string(), endpointId: v.string(), ...attemptArgs },
  handler: async (ctx, args) => {
    await recordAttempt(ctx, args.tenantId, args.endpointId, args);
    if (args.status !== "succeeded") return;
    const row = await endpointRow(ctx.db, args.tenantId, args.endpointId);
    if (!row) return;
    await systemContext(ctx, args.tenantId).runMutation(
      api.mutations.OutboundWebhookEndpoint_recordDelivered,
      { docId: row._id, occurredAt: args.occurredAt },
    );
  },
});

/**
 * Copy one ledger endpoint (with its secret, watermark and the attempts its
 * dispatch still depends on) into the entities, in one transaction.
 */
export const importLedgerEndpoint = internalMutation({
  args: {
    tenantId: v.string(),
    endpointId: v.string(),
    url: v.string(),
    label: v.string(),
    events: v.array(v.string()),
    secret: v.union(v.null(), v.string()),
    registeredAt: v.number(),
    registeredBy: v.string(),
    deliveredThrough: v.union(v.null(), v.number()),
    attempts: v.array(v.object(attemptArgs)),
  },
  handler: async (ctx, args) => {
    if (await endpointRow(ctx.db, args.tenantId, args.endpointId)) return;
    await registerEndpointRow(ctx, args);
    for (const attempt of args.attempts) {
      await recordAttempt(ctx, args.tenantId, args.endpointId, attempt);
    }
  },
});

// Scheduler bookkeeping: one webhookDispatchStates row per tenant, written
// directly (infrastructure, not domain state — see the table's entry in
// scripts/governed-write-exceptions.json).
async function patchDispatchState(
  ctx: MutationCtx,
  tenantId: string,
  patch: {
    chainId?: string;
    lastTickAt?: number;
    legacyImportedAt?: number;
  },
): Promise<void> {
  const existing = await dispatchState(ctx.db, tenantId);
  const now = Date.now();
  if (existing) {
    // raw-write: webhookDispatchStates
    await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    return;
  }
  // raw-write: webhookDispatchStates
  await ctx.db.insert("webhookDispatchStates", {
    tenantId,
    ...patch,
    createdAt: now,
    updatedAt: now,
  });
}

export const recordTick = internalMutation({
  args: { tenantId: v.string(), tickAt: v.number() },
  handler: async (ctx, args) => {
    await patchDispatchState(ctx, args.tenantId, { lastTickAt: args.tickAt });
  },
});

export const recordChainStart = internalMutation({
  args: { tenantId: v.string(), chainId: v.string() },
  handler: async (ctx, args) => {
    await patchDispatchState(ctx, args.tenantId, { chainId: args.chainId });
  },
});

/**
 * A chain ticking for a tenant with no recorded owner (chains started before
 * 2026-09-29 kept their ownership in the ledger) claims the tenant; every
 * other chain then ends at its next tick. Returns the owning chain.
 */
export const claimDispatchChain = internalMutation({
  args: { tenantId: v.string(), chainId: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const existing = await dispatchState(ctx.db, args.tenantId);
    if (existing?.chainId) return existing.chainId;
    await patchDispatchState(ctx, args.tenantId, { chainId: args.chainId });
    return args.chainId;
  },
});

export const markLedgerImported = internalMutation({
  args: { tenantId: v.string() },
  handler: async (ctx, args) => {
    await patchDispatchState(ctx, args.tenantId, {
      legacyImportedAt: Date.now(),
    });
  },
});

export const dispatchPending = internalAction({
  args: {
    tenantId: v.string(),
    scheduleNext: v.boolean(),
    chainId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ delivered: number; attempted: number }> => {
    let context: DispatchContext = await ctx.runQuery(
      internal.webhookIntegrations.loadDispatchContext,
      { tenantId: args.tenantId },
    );

    // A newer chain owns this tenant: end this one without work or reschedule.
    if (args.scheduleNext && args.chainId !== undefined) {
      const owner: string =
        context.currentChainId ??
        (await ctx.runMutation(
          internal.webhookIntegrations.claimDispatchChain,
          {
            tenantId: args.tenantId,
            chainId: args.chainId,
          },
        ));
      if (owner !== args.chainId) return { delivered: 0, attempted: 0 };
    } else if (
      args.scheduleNext &&
      context.currentChainId != null &&
      args.chainId !== context.currentChainId
    ) {
      return { delivered: 0, attempted: 0 };
    }
    const next = {
      tenantId: args.tenantId,
      scheduleNext: true,
      chainId: args.chainId,
    };

    // First tick since 2026-09-29: copy the tenant's ledger endpoints over.
    if (context.ledgerImports) {
      for (const { endpoint, attempts } of context.ledgerImports) {
        await ctx.runMutation(
          internal.webhookIntegrations.importLedgerEndpoint,
          {
            tenantId: args.tenantId,
            endpointId: endpoint.endpointId,
            url: endpoint.url,
            label: endpoint.label,
            events: [...endpoint.events],
            secret: await revealSecret(endpoint, ctx),
            registeredAt: endpoint.registeredAt,
            registeredBy: endpoint.registeredBy,
            deliveredThrough: endpoint.deliveredThrough,
            attempts,
          },
        );
      }
      await ctx.runMutation(internal.webhookIntegrations.markLedgerImported, {
        tenantId: args.tenantId,
      });
      context = await ctx.runQuery(
        internal.webhookIntegrations.loadDispatchContext,
        { tenantId: args.tenantId },
      );
    }

    const now = Date.now();
    if (context.endpoints.length === 0) {
      if (args.scheduleNext) {
        await ctx.scheduler.runAfter(
          IDLE_INTERVAL_MS,
          internal.webhookIntegrations.dispatchPending,
          next,
        );
      }
      return { delivered: 0, attempted: 0 };
    }

    // Collapse duplicate scheduler chains: if another tick ran very recently,
    // defer to it but keep one chain alive.
    if (
      context.lastTickAt != null &&
      now - context.lastTickAt < TICK_COLLAPSE_MS
    ) {
      if (args.scheduleNext) {
        await ctx.scheduler.runAfter(
          DISPATCH_INTERVAL_MS,
          internal.webhookIntegrations.dispatchPending,
          next,
        );
      }
      return { delivered: 0, attempted: 0 };
    }

    let delivered = 0;
    let attempted = 0;

    for (const endpoint of context.endpoints) {
      const since = endpoint.deliveredThrough ?? endpoint.registeredAt;
      const secret = await revealSecret(endpoint, ctx);
      for (const eventType of endpoint.events) {
        const candidates: CandidateEvent[] = await ctx.runQuery(
          internal.webhookIntegrations.loadCandidateEvents,
          {
            tenantId: args.tenantId,
            eventType,
            since,
            endpointId: endpoint.endpointId,
          },
        );
        for (const candidate of candidates) {
          if (candidate.succeeded) continue;
          const priorAttempts = candidate.failedAttempts;
          if (priorAttempts >= MAX_ATTEMPTS) continue;
          attempted += 1;
          const result = await postToEndpoint(
            endpoint.url,
            candidate.payload,
            candidate.eventType,
            secret,
          );
          await ctx.runMutation(internal.webhookIntegrations.recordDelivery, {
            tenantId: args.tenantId,
            deliveryId: crypto.randomUUID(),
            endpointId: endpoint.endpointId,
            sourceEventId: candidate.sourceEventId,
            eventType: candidate.eventType,
            status: result.ok ? "succeeded" : "failed",
            attempt: priorAttempts + 1,
            httpStatus: result.httpStatus,
            error: result.error,
            occurredAt: candidate.occurredAt,
            deliveredAt: now,
          });
          if (result.ok) delivered += 1;
        }
      }
    }

    await ctx.runMutation(internal.webhookIntegrations.recordTick, {
      tenantId: args.tenantId,
      tickAt: now,
    });

    if (args.scheduleNext) {
      await ctx.scheduler.runAfter(
        DISPATCH_INTERVAL_MS,
        internal.webhookIntegrations.dispatchPending,
        next,
      );
    }
    return { delivered, attempted };
  },
});
