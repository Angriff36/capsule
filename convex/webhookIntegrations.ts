import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import {
  classifyDeliveryError,
  DEFAULT_DELIVERY_POLICY,
  isDue,
  summarizeDelivery,
  type DeliveryAttemptRow,
  type DeliveryErrorClass,
} from "./lib/deliveryState";
import { decrypt, encrypt } from "./lib/encryption";

// Outbound webhook integrations. Operators register HTTP endpoints that receive
// a structured JSON payload when a subscribed domain event fires
// (EventApproved, InvoicePaymentApplied, DeliveryTransitStarted). Endpoint
// registrations, dispatch ticks, and per-event delivery attempts are recorded
// on the manifestEvents outbox, matching the googleCalendar / invoicePayments
// author-seam precedent. Outbound delivery is an explicit Convex worker
// (action) — Manifest `webhook` is inbound only; see
// docs/generation/2026-07-17-command-api-surface-boundary.md.

const ENDPOINT_ENTITY = "WebhookEndpoint";
const DELIVERY_ENTITY = "WebhookDelivery";
const TICK_ENTITY = "WebhookDispatchTick";
const CHAIN_START_TYPE = "WebhookDispatchChainStarted";

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
}

export interface DeliveryHistory {
  key: string;
  endpointId: string;
  sourceEventId: string;
  eventType: string;
  occurredAt: number;
  rows: DeliveryAttemptRow[];
}

interface DispatchContext {
  endpoints: EndpointRecord[];
  history: DeliveryHistory[];
  successWatermarkByEndpoint: Array<{ endpointId: string; watermark: number }>;
  lastTickAt: number | null;
  currentChainId: string | null;
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

export function requireManager(role: string): void {
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

function parseEndpoint(payload: unknown): EndpointRecord | null {
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
  const eventsRaw = Array.isArray(value.events) ? value.events : [];
  const events = eventsRaw
    .map((entry) => stringValue(entry))
    .filter(
      (entry): entry is string =>
        entry !== null && SUBSCRIBABLE_TYPES.has(entry),
    );
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
      return parseEndpoint(row.payload);
    }
  }
  return null;
}

export function activeEndpointsFor(
  rows: EndpointLogRow[],
  tenantId: string,
): EndpointRecord[] {
  const byEndpoint = new Map<string, EndpointLogRow[]>();
  for (const row of rows) {
    if (asRecord(row.payload).tenantId !== tenantId) continue;
    const endpointId = stringValue(asRecord(row.payload).endpointId);
    if (!endpointId) continue;
    const bucket = byEndpoint.get(endpointId) ?? [];
    bucket.push(row);
    byEndpoint.set(endpointId, bucket);
  }
  const endpoints: EndpointRecord[] = [];
  for (const bucket of byEndpoint.values()) {
    const state = latestEndpointState(bucket);
    if (state && state.events.length > 0) endpoints.push(state);
  }
  return endpoints;
}

export function deliveryKey(
  endpointId: string,
  sourceEventId: string,
  eventType: string,
): string {
  return `${endpointId}:${sourceEventId}:${eventType}`;
}

const DELIVERY_ERROR_CLASSES = new Set<string>([
  "timeout",
  "throttled",
  "not_authorized",
  "not_found",
  "rejected",
  "provider_down",
  "network",
  "not_set_up",
  "unknown",
]);

/** Group the tenant's webhook ledger rows into one history per delivery. */
export function deliveryHistoryFor(
  rows: ReadonlyArray<{ payload: unknown; createdAt: number }>,
  tenantId: string,
): DeliveryHistory[] {
  const byKey = new Map<string, DeliveryHistory>();
  for (const row of rows) {
    const payload = asRecord(row.payload);
    if (payload.tenantId !== tenantId) continue;
    const endpointId = stringValue(payload.endpointId);
    const sourceEventId = stringValue(payload.sourceEventId);
    const eventType = stringValue(payload.eventType);
    const status = stringValue(payload.status);
    if (!endpointId || !sourceEventId || !eventType) continue;
    if (
      status !== "succeeded" &&
      status !== "failed" &&
      status !== "retry_requested"
    ) {
      continue;
    }
    const key = deliveryKey(endpointId, sourceEventId, eventType);
    const entry = byKey.get(key) ?? {
      key,
      endpointId,
      sourceEventId,
      eventType,
      occurredAt: numberValue(payload.occurredAt) ?? row.createdAt,
      rows: [],
    };
    const httpStatus = numberValue(payload.httpStatus);
    const storedClass = stringValue(payload.errorClass);
    entry.rows.push({
      outcome: status,
      at: row.createdAt,
      httpStatus,
      errorClass:
        status !== "failed"
          ? null
          : storedClass && DELIVERY_ERROR_CLASSES.has(storedClass)
            ? (storedClass as DeliveryErrorClass)
            : classifyDeliveryError({ httpStatus, networkFailure: true }),
    });
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

export const WEBHOOK_DELIVERY_POLICY = {
  ...DEFAULT_DELIVERY_POLICY,
  maxAttempts: MAX_ATTEMPTS,
};

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
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entity", (q) => q.eq("entity", ENDPOINT_ENTITY))
      .collect();
    const endpoints = activeEndpointsFor(rows, auth.tenantId);
    return endpoints
      .map(toView)
      .sort((left, right) => left.registeredAt - right.registeredAt);
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
    let encryptedSecret: EncryptedSecret | null = null;
    const secretValue = args.secret?.trim();
    if (secretValue) {
      encryptedSecret = await encrypt(secretValue, {
        ctx,
        entity: ENDPOINT_ENTITY,
        property: "secret",
      });
    }
    const endpointId = crypto.randomUUID();
    await ctx.runMutation(internal.webhookIntegrations.recordEndpoint, {
      type: "WebhookEndpointRegistered",
      tenantId,
      endpointId,
      url,
      label,
      events,
      secret: encryptedSecret,
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
    const sourceEventId = `test:${Date.now()}`;
    const result = await postToEndpoint(
      endpoint.url,
      payload,
      "WebhookTest",
      secret,
      deliveryKey(args.endpointId, sourceEventId, "WebhookTest"),
    );
    await ctx.runMutation(internal.webhookIntegrations.recordDelivery, {
      tenantId,
      deliveryId: crypto.randomUUID(),
      endpointId: args.endpointId,
      sourceEventId,
      eventType: "WebhookTest",
      status: result.ok ? "succeeded" : "failed",
      attempt: 1,
      httpStatus: result.httpStatus,
      error: result.error,
      errorClass: result.errorClass ?? undefined,
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
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entity", (q) => q.eq("entity", ENDPOINT_ENTITY))
      .collect();
    return activeEndpointsFor(rows, args.tenantId).length;
  },
});

export const loadEndpoint = internalQuery({
  args: { tenantId: v.string(), endpointId: v.string() },
  handler: async (ctx, args): Promise<EndpointRecord | null> => {
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entity", (q) => q.eq("entity", ENDPOINT_ENTITY))
      .filter((q) => q.eq(q.field("entityId"), args.endpointId))
      .collect();
    const bucket: EndpointLogRow[] = rows
      .filter((row) => asRecord(row.payload).tenantId === args.tenantId)
      .map((row) => ({
        type: row.type,
        payload: row.payload,
        createdAt: row.createdAt,
      }));
    const state = latestEndpointState(bucket);
    if (!state || state.tenantId !== args.tenantId) return null;
    return state;
  },
});

export const loadCandidateEvents = internalQuery({
  args: { tenantId: v.string(), eventType: v.string(), since: v.number() },
  handler: async (ctx, args): Promise<CandidateEvent[]> => {
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_type", (q) => q.eq("type", args.eventType))
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
      });
    }
    candidates.sort((left, right) => left.occurredAt - right.occurredAt);
    return candidates.slice(0, MAX_EVENTS_PER_TYPE);
  },
});

export const loadSourceEvent = internalQuery({
  args: {
    tenantId: v.string(),
    sourceEventId: v.string(),
    eventType: v.string(),
  },
  handler: async (ctx, args): Promise<CandidateEvent | null> => {
    const id = ctx.db.normalizeId("manifestEvents", args.sourceEventId);
    if (!id) return null;
    const row = await ctx.db.get(id);
    if (!row || row.type !== args.eventType) return null;
    if (asRecord(row.payload).tenantId !== args.tenantId) return null;
    return {
      sourceEventId: String(row._id),
      eventType: row.type,
      occurredAt: row.createdAt,
      payload: row.payload,
    };
  },
});

export const loadDispatchContext = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args): Promise<DispatchContext> => {
    const [endpointRows, deliveryRows, tickRows] = await Promise.all([
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", ENDPOINT_ENTITY))
        .collect(),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", DELIVERY_ENTITY))
        .collect(),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", TICK_ENTITY))
        .collect(),
    ]);

    const endpoints = activeEndpointsFor(
      endpointRows.map((row) => ({
        type: row.type,
        payload: row.payload,
        createdAt: row.createdAt,
      })),
      args.tenantId,
    );

    const history = deliveryHistoryFor(deliveryRows, args.tenantId);
    const successWatermarkByEndpoint = new Map<string, number>();
    for (const entry of history) {
      if (!entry.rows.some((row) => row.outcome === "succeeded")) continue;
      successWatermarkByEndpoint.set(
        entry.endpointId,
        Math.max(
          successWatermarkByEndpoint.get(entry.endpointId) ?? 0,
          entry.occurredAt,
        ),
      );
    }

    let lastTickAt: number | null = null;
    let currentChainId: string | null = null;
    for (const row of tickRows) {
      const payload = asRecord(row.payload);
      if (payload.tenantId !== args.tenantId) continue;
      if (row.type === CHAIN_START_TYPE) {
        // Rows come in insertion order, so the last one is the newest chain.
        currentChainId = stringValue(payload.chainId) ?? currentChainId;
        continue;
      }
      if (row.createdAt > (lastTickAt ?? 0)) lastTickAt = row.createdAt;
    }

    return {
      endpoints,
      history,
      successWatermarkByEndpoint: [...successWatermarkByEndpoint.entries()].map(
        ([endpointId, watermark]) => ({ endpointId, watermark }),
      ),
      lastTickAt,
      currentChainId,
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
  errorClass: DeliveryErrorClass | null;
}

async function postToEndpoint(
  url: string,
  payload: unknown,
  eventType: string,
  secret: string | null,
  deliveryId: string,
): Promise<PostResult> {
  const body = JSON.stringify({
    eventType,
    deliveryId,
    occurredAt: Date.now(),
    data: payload,
  });
  // The delivery id is the same on every try of one event to one endpoint, so
  // a receiver that got a send whose answer Capsule never saw can drop the
  // repeat instead of acting twice.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Capsule-Event": eventType,
    "X-Capsule-Delivery-Id": deliveryId,
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
    const ok = response.status >= 200 && response.status < 300;
    return {
      ok,
      httpStatus: response.status,
      error: ok ? null : `Endpoint returned ${response.status}.`,
      errorClass: ok
        ? null
        : classifyDeliveryError({ httpStatus: response.status }),
    };
  } catch (cause) {
    const timedOut =
      cause instanceof DOMException && cause.name === "AbortError";
    return {
      ok: false,
      httpStatus: null,
      // Only fixed words: a fetch error message can repeat the URL and its
      // query string, which may hold the receiver's token.
      error: timedOut
        ? "Endpoint timed out."
        : "Endpoint could not be reached.",
      errorClass: classifyDeliveryError({ timedOut, networkFailure: true }),
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
    secret: v.union(
      v.null(),
      v.object({ ciphertext: v.string(), keyId: v.string() }),
    ),
    registeredAt: v.number(),
    registeredBy: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
      type: args.type,
      entity: ENDPOINT_ENTITY,
      entityId: args.endpointId,
      payload: {
        tenantId: args.tenantId,
        endpointId: args.endpointId,
        url: args.url,
        label: args.label,
        events: args.events,
        secret: args.secret,
        registeredAt: args.registeredAt,
        registeredBy: args.registeredBy,
      },
      createdAt: Date.now(),
    });
  },
});

export const recordDelivery = internalMutation({
  args: {
    tenantId: v.string(),
    deliveryId: v.string(),
    endpointId: v.string(),
    sourceEventId: v.string(),
    eventType: v.string(),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    attempt: v.number(),
    httpStatus: v.union(v.number(), v.null()),
    error: v.union(v.string(), v.null()),
    errorClass: v.optional(v.string()),
    occurredAt: v.number(),
    deliveredAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
      type:
        args.status === "succeeded"
          ? "WebhookDeliverySucceeded"
          : "WebhookDeliveryFailed",
      entity: DELIVERY_ENTITY,
      entityId: `${args.endpointId}:${args.sourceEventId}`,
      payload: {
        tenantId: args.tenantId,
        deliveryId: args.deliveryId,
        endpointId: args.endpointId,
        sourceEventId: args.sourceEventId,
        eventType: args.eventType,
        status: args.status,
        attempt: args.attempt,
        httpStatus: args.httpStatus,
        error: args.error,
        ...(args.errorClass ? { errorClass: args.errorClass } : {}),
        occurredAt: args.occurredAt,
      },
      createdAt: args.deliveredAt,
    });
  },
});

export const recordTick = internalMutation({
  args: { tenantId: v.string(), tickAt: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
      type: "WebhookDispatchTick",
      entity: TICK_ENTITY,
      entityId: args.tenantId,
      payload: { tenantId: args.tenantId, tickAt: args.tickAt },
      createdAt: args.tickAt,
    });
  },
});

export const recordChainStart = internalMutation({
  args: { tenantId: v.string(), chainId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
      type: CHAIN_START_TYPE,
      entity: TICK_ENTITY,
      entityId: args.tenantId,
      payload: { tenantId: args.tenantId, chainId: args.chainId },
      createdAt: Date.now(),
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
    const context: DispatchContext = await ctx.runQuery(
      internal.webhookIntegrations.loadDispatchContext,
      { tenantId: args.tenantId },
    );

    // A newer chain owns this tenant: end this one without work or reschedule.
    if (
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

    const historyByKey = new Map(
      context.history.map((entry) => [entry.key, entry]),
    );
    const successWatermarkByEndpoint = new Map<string, number>(
      context.successWatermarkByEndpoint.map((entry) => [
        entry.endpointId,
        entry.watermark,
      ]),
    );

    let delivered = 0;
    let attempted = 0;

    for (const endpoint of context.endpoints) {
      const since =
        successWatermarkByEndpoint.get(endpoint.endpointId) ??
        endpoint.registeredAt;
      const secret = await revealSecret(endpoint, ctx);
      const candidates: CandidateEvent[] = [];
      for (const eventType of endpoint.events) {
        candidates.push(
          ...(await ctx.runQuery(
            internal.webhookIntegrations.loadCandidateEvents,
            { tenantId: args.tenantId, eventType, since },
          )),
        );
      }
      // Failures older than the success watermark (a later event got through
      // first) or reopened by a person's "Try again" are not in the window
      // above; send them by id.
      const seen = new Set(
        candidates.map((candidate) =>
          deliveryKey(
            endpoint.endpointId,
            candidate.sourceEventId,
            candidate.eventType,
          ),
        ),
      );
      for (const entry of context.history) {
        if (entry.endpointId !== endpoint.endpointId) continue;
        if (seen.has(entry.key)) continue;
        if (!endpoint.events.includes(entry.eventType)) continue;
        const summary = summarizeDelivery(
          entry.rows,
          now,
          WEBHOOK_DELIVERY_POLICY,
        );
        if (!isDue(summary, now)) continue;
        const source = await ctx.runQuery(
          internal.webhookIntegrations.loadSourceEvent,
          {
            tenantId: args.tenantId,
            sourceEventId: entry.sourceEventId,
            eventType: entry.eventType,
          },
        );
        if (source) candidates.push(source);
      }

      for (const candidate of candidates) {
        const key = deliveryKey(
          endpoint.endpointId,
          candidate.sourceEventId,
          candidate.eventType,
        );
        const summary = summarizeDelivery(
          historyByKey.get(key)?.rows ?? [],
          now,
          WEBHOOK_DELIVERY_POLICY,
        );
        if (!isDue(summary, now)) continue;
        attempted += 1;
        const result = await postToEndpoint(
          endpoint.url,
          candidate.payload,
          candidate.eventType,
          secret,
          key,
        );
        await ctx.runMutation(internal.webhookIntegrations.recordDelivery, {
          tenantId: args.tenantId,
          deliveryId: crypto.randomUUID(),
          endpointId: endpoint.endpointId,
          sourceEventId: candidate.sourceEventId,
          eventType: candidate.eventType,
          status: result.ok ? "succeeded" : "failed",
          attempt: summary.attemptCount + 1,
          httpStatus: result.httpStatus,
          error: result.error,
          errorClass: result.errorClass ?? undefined,
          occurredAt: candidate.occurredAt,
          deliveredAt: now,
        });
        if (result.ok) delivered += 1;
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
