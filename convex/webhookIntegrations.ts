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
}

interface DispatchContext {
  endpoints: EndpointRecord[];
  succeededKeys: string[];
  attemptCounts: Array<{ key: string; attempts: number }>;
  successWatermarkByEndpoint: Array<{ endpointId: string; watermark: number }>;
  lastTickAt: number | null;
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

function activeEndpointsFor(
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

export const listDeliveries = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<DeliveryView[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const limit = Math.max(1, Math.min(50, args.limit ?? 20));
    const [deliveryRows, endpointRows] = await Promise.all([
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", DELIVERY_ENTITY))
        .order("desc")
        .take(limit * 4),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", ENDPOINT_ENTITY))
        .collect(),
    ]);
    const labelByEndpoint = new Map<string, string>();
    for (const row of endpointRows) {
      const payload = asRecord(row.payload);
      if (payload.tenantId !== auth.tenantId) continue;
      const endpointId = stringValue(payload.endpointId);
      if (!endpointId) continue;
      if (
        row.type === "WebhookEndpointRegistered" &&
        !labelByEndpoint.has(endpointId)
      ) {
        const state = parseEndpoint(row.payload);
        if (state) labelByEndpoint.set(endpointId, state.label || state.url);
      }
    }
    const deliveries: DeliveryView[] = [];
    for (const row of deliveryRows) {
      const payload = asRecord(row.payload);
      if (payload.tenantId !== auth.tenantId) continue;
      const status = stringValue(payload.status);
      if (status !== "succeeded" && status !== "failed") continue;
      const endpointId = stringValue(payload.endpointId);
      const eventType = stringValue(payload.eventType);
      if (!endpointId || !eventType) continue;
      deliveries.push({
        deliveryId:
          stringValue(payload.deliveryId) ?? `${endpointId}:${eventType}`,
        endpointId,
        endpointLabel: labelByEndpoint.get(endpointId) ?? endpointId,
        eventType,
        status,
        attempt: numberValue(payload.attempt) ?? 1,
        httpStatus: numberValue(payload.httpStatus),
        error: stringValue(payload.error),
        deliveredAt: row.createdAt,
      });
      if (deliveries.length >= limit) break;
    }
    return deliveries;
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
    await ctx.scheduler.runAfter(
      0,
      internal.webhookIntegrations.dispatchPending,
      {
        tenantId,
        scheduleNext: true,
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

    const attemptCounts = new Map<string, number>();
    const succeededKeys: string[] = [];
    const successWatermarkByEndpoint = new Map<string, number>();
    for (const row of deliveryRows) {
      const payload = asRecord(row.payload);
      if (payload.tenantId !== args.tenantId) continue;
      const endpointId = stringValue(payload.endpointId);
      const sourceEventId = stringValue(payload.sourceEventId);
      const eventType = stringValue(payload.eventType);
      if (!endpointId || !sourceEventId || !eventType) continue;
      const key = `${endpointId}:${sourceEventId}:${eventType}`;
      const status = stringValue(payload.status);
      if (status === "succeeded") {
        succeededKeys.push(key);
        const occurredAt = numberValue(payload.occurredAt) ?? row.createdAt;
        successWatermarkByEndpoint.set(
          endpointId,
          Math.max(successWatermarkByEndpoint.get(endpointId) ?? 0, occurredAt),
        );
      } else {
        attemptCounts.set(key, (attemptCounts.get(key) ?? 0) + 1);
      }
    }

    let lastTickAt: number | null = null;
    for (const row of tickRows) {
      if (asRecord(row.payload).tenantId !== args.tenantId) continue;
      if (row.createdAt > (lastTickAt ?? 0)) lastTickAt = row.createdAt;
    }

    return {
      endpoints,
      succeededKeys,
      attemptCounts: [...attemptCounts.entries()].map(([key, attempts]) => ({
        key,
        attempts,
      })),
      successWatermarkByEndpoint: [...successWatermarkByEndpoint.entries()].map(
        ([endpointId, watermark]) => ({ endpointId, watermark }),
      ),
      lastTickAt,
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

export const dispatchPending = internalAction({
  args: { tenantId: v.string(), scheduleNext: v.boolean() },
  handler: async (
    ctx,
    args,
  ): Promise<{ delivered: number; attempted: number }> => {
    const context: DispatchContext = await ctx.runQuery(
      internal.webhookIntegrations.loadDispatchContext,
      { tenantId: args.tenantId },
    );

    const now = Date.now();
    if (context.endpoints.length === 0) {
      if (args.scheduleNext) {
        await ctx.scheduler.runAfter(
          IDLE_INTERVAL_MS,
          internal.webhookIntegrations.dispatchPending,
          { tenantId: args.tenantId, scheduleNext: true },
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
          { tenantId: args.tenantId, scheduleNext: true },
        );
      }
      return { delivered: 0, attempted: 0 };
    }

    const succeeded = new Set(context.succeededKeys);
    const attemptCounts = new Map<string, number>(
      context.attemptCounts.map((entry) => [entry.key, entry.attempts]),
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
      for (const eventType of endpoint.events) {
        const candidates = await ctx.runQuery(
          internal.webhookIntegrations.loadCandidateEvents,
          { tenantId: args.tenantId, eventType, since },
        );
        for (const candidate of candidates) {
          const key = `${endpoint.endpointId}:${candidate.sourceEventId}:${candidate.eventType}`;
          if (succeeded.has(key)) continue;
          const priorAttempts = attemptCounts.get(key) ?? 0;
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
          if (result.ok) {
            succeeded.add(key);
            delivered += 1;
          } else {
            attemptCounts.set(key, priorAttempts + 1);
          }
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
        { tenantId: args.tenantId, scheduleNext: true },
      );
    }
    return { delivered, attempted };
  },
});
