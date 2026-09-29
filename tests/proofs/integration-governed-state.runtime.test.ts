/**
 * Runtime proof (2026-09-29, governed writes): QuickBooks, Google Calendar and
 * outbound-webhook state is written only by generated commands, never by
 * hand-inserted manifestEvents rows.
 *
 * Proven here:
 * - a tenant connected before the change (state only in the old ledger rows,
 *   same keys as before) keeps working without reconnecting: its connection
 *   is read from the ledger, the next scheduled sync moves it onto
 *   IntegrationConnection (same connection id, token sealed at rest) and
 *   copies its per-record state, and nothing new is written to the ledger;
 * - QuickBooks' rotated refresh token lands on the entity, sealed;
 * - the refresh token and signing secret never come back from a generated read;
 * - the events are emitted by the commands (so reactions/hooks run);
 * - who may connect / disconnect / register is unchanged (manager yes, staff
 *   no) and the new commands refuse a person calling them directly;
 * - a ledger webhook endpoint keeps its secret and delivery history: the next
 *   tick copies it once, signs with the old secret and never resends an event
 *   the ledger already delivered.
 */
import { convexTest } from "convex-test";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { decrypt, encrypt } from "../../convex/lib/encryption";
import {
  buildGoogleCalendarEvent,
  googleCalendarEventId,
  googleCalendarEventSignature,
} from "../../convex/lib/googleCalendar";
import { parseSealedEnvelope } from "../../convex/lib/oauthConnectionStore";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

const TENANT = "tenant-governed-int";
const HOUR = 60 * 60_000;
const MINUTE = 60_000;

beforeAll(ensureTestFieldEncryptionKey);

beforeEach(() => {
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "proof-client");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "proof-secret");
  vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://proof.example/callback");
  vi.stubEnv("QBO_CLIENT_ID", "proof-client");
  vi.stubEnv("QBO_CLIENT_SECRET", "proof-secret");
  vi.stubEnv("QBO_REDIRECT_URI", "https://proof.example/qbo");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

const seal = (plaintext: string) =>
  encrypt(plaintext, {
    ctx: null,
    entity: "proof",
    property: "proof",
  });

const typedSetup = () => convexTest(schema, modules);
/** The proof-kit actor, typed as the convex-test accessor it wraps. */
type Actor = ReturnType<ReturnType<typeof typedSetup>["withIdentity"]>;

function actor(
  proof: ReturnType<typeof harness>,
  identity: { subject: string; role: string; tenantId: string },
): Actor {
  return proof.asRole(identity) as unknown as Actor;
}

async function ledgerRows(t: Actor, entities: string[]): Promise<number> {
  return (await t.run(async (ctx) => {
    let count = 0;
    for (const entity of entities) {
      count += (
        await ctx.db
          .query("manifestEvents")
          .withIndex("by_entity", (q) => q.eq("entity", entity))
          .collect()
      ).length;
    }
    return count;
  })) as number;
}

async function eventTypes(t: Actor): Promise<string[]> {
  return (await t.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).map((row) => row.type),
  )) as string[];
}

describe("Google Calendar state is governed; ledger tenants keep working", () => {
  it("moves a ledger-connected tenant onto IntegrationConnection on its next sync", async () => {
    const proof = harness();
    const system = actor(proof, {
      subject: "cal-system",
      role: "admin",
      tenantId: TENANT,
    });
    const writes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { method?: string }) => {
        if (url.startsWith("https://oauth2.googleapis.com/token")) {
          return Response.json({
            access_token: "proof-access",
            expires_in: 3600,
          });
        }
        writes.push(`${init.method ?? "GET"} ${url}`);
        return Response.json({ id: "x" });
      }),
    );

    const startsAt = Date.now() + 24 * HOUR;
    const endsAt = startsAt + 4 * HOUR;
    const eventId = (await system.run(async (ctx) =>
      String(
        await ctx.db.insert("events", {
          tenantId: TENANT,
          title: "Garden Wedding",
          eventType: "wedding",
          stage: "approved",
          startsAt,
          endsAt,
          version: 1,
        }),
      ),
    )) as string;
    const googleEventId = await googleCalendarEventId(eventId);
    const signature = await googleCalendarEventSignature(
      buildGoogleCalendarEvent({
        eventId,
        title: "Garden Wedding",
        startsAt,
        endsAt,
        venueName: undefined,
        venueAddress: undefined,
        expectedHeadcount: undefined,
      }),
    );
    const refreshToken = await seal("legacy-google-refresh");
    // Rows exactly as the pre-2026-09-29 seam wrote them.
    await system.run(async (ctx) => {
      await ctx.db.insert("manifestEvents", {
        type: "GoogleCalendarConnected",
        entity: "GoogleCalendarConnection",
        entityId: TENANT,
        payload: {
          tenantId: TENANT,
          connectionId: "legacy-cal",
          calendarId: "primary",
          connectedAt: Date.now() - HOUR,
          connectedBy: "legacy-manager",
          refreshToken,
        },
        createdAt: Date.now() - HOUR,
      });
      await ctx.db.insert("manifestEvents", {
        type: "GoogleCalendarEventSynced",
        entity: "GoogleCalendarEvent",
        entityId: eventId,
        payload: {
          tenantId: TENANT,
          eventId,
          connectionId: "legacy-cal",
          googleEventId,
          signature,
          status: "synced",
          syncedAt: Date.now() - HOUR,
          error: null,
        },
        createdAt: Date.now() - HOUR,
      });
    });
    const ledgerBefore = await ledgerRows(system, [
      "GoogleCalendarConnection",
      "GoogleCalendarEvent",
    ]);

    // Still connected, read from the ledger: no reconnect needed.
    const active = await system.query(
      internal.googleCalendar.loadActiveConnection,
      {
        tenantId: TENANT,
      },
    );
    expect(active).toMatchObject({
      connectionId: "legacy-cal",
      source: "ledger",
    });

    // The next scheduled sync honours the ledger state (unchanged → skipped).
    const result = await system.action(
      internal.googleCalendar.reconcileTenant,
      {
        tenantId: TENANT,
        connectionId: "legacy-cal",
        scheduleNext: false,
      },
    );
    expect(result).toMatchObject({
      status: "ok",
      createdOrUpdated: 0,
      skipped: 1,
    });
    expect(writes).toEqual([]);

    const row = (await system.run(
      async (ctx) =>
        (await ctx.db.query("integrationConnections").collect())[0],
    )) as Record<string, unknown>;
    expect(row).toMatchObject({
      provider: "google_calendar",
      status: "connected",
      engagementId: "legacy-cal",
      externalAccountId: "primary",
      connectedById: "legacy-manager",
      lastSyncStatus: "ok",
    });
    expect(row.ledgerImportedAt).toEqual(expect.any(Number));
    // Sealed at rest, and it opens to the original token.
    expect(String(row.oauthRefreshToken)).not.toContain(
      "legacy-google-refresh",
    );
    const sealed = parseSealedEnvelope(row.oauthRefreshToken)!;
    expect(
      await decrypt(sealed.ciphertext, sealed.keyId, {
        ctx: null,
        entity: "IntegrationConnection",
        property: "oauthRefreshToken",
      }),
    ).toBe("legacy-google-refresh");
    const records = (await system.run(async (ctx) =>
      ctx.db.query("integrationSyncRecords").collect(),
    )) as Array<Record<string, unknown>>;
    expect(records).toMatchObject([
      {
        syncKey: `google_calendar:event:${eventId}`,
        externalId: googleEventId,
        status: "synced",
      },
    ]);

    // Emitted by the commands; no ledger row was added.
    const types = await eventTypes(system);
    expect(types).toEqual(
      expect.arrayContaining([
        "IntegrationConnectionStarted",
        "IntegrationConnectionGranted",
        "IntegrationRecordSynced",
        "IntegrationLedgerImported",
        "IntegrationConnectionReconciled",
      ]),
    );
    expect(
      await ledgerRows(system, [
        "GoogleCalendarConnection",
        "GoogleCalendarEvent",
      ]),
    ).toBe(ledgerBefore);

    // A second sync reads the entity only and still skips.
    expect(
      await system.action(internal.googleCalendar.reconcileTenant, {
        tenantId: TENANT,
        connectionId: "legacy-cal",
        scheduleNext: false,
      }),
    ).toMatchObject({ skipped: 1, createdOrUpdated: 0 });
    expect(
      (await eventTypes(system)).filter(
        (type) => type === "IntegrationLedgerImported",
      ),
    ).toHaveLength(1);

    // No generated read returns the refresh token.
    const listed = (await system.query(
      api.queries.listIntegrationConnection,
      {} as never,
    )) as Array<Record<string, unknown>>;
    expect(listed.length).toBe(1);
    expect(listed[0]).not.toHaveProperty("oauthRefreshToken");
  });

  it("disconnect: staff are refused, a manager's disconnect lands on the entity and ends the sync chain", async () => {
    const proof = harness();
    const manager = actor(proof, {
      subject: "cal-mgr",
      role: "manager",
      tenantId: TENANT,
    });
    const staff = actor(proof, {
      subject: "cal-staff",
      role: "staff",
      tenantId: TENANT,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    await manager.mutation(internal.googleCalendar.recordConnection, {
      tenantId: TENANT,
      connectionId: "conn-1",
      calendarId: "primary",
      connectedAt: Date.now(),
      connectedBy: "cal-mgr",
      refreshToken: "proof-refresh",
    });

    await expect(
      staff.action(api.googleCalendar.disconnect, {}),
    ).rejects.toThrow(/organization manager/);
    await manager.action(api.googleCalendar.disconnect, {});

    const row = (await manager.run(
      async (ctx) =>
        (await ctx.db.query("integrationConnections").collect())[0],
    )) as Record<string, unknown>;
    expect(row.status).toBe("revoked");
    expect(row.oauthRefreshToken ?? null).toBeNull();
    expect(row.engagementId ?? null).toBeNull();
    expect(
      await manager.action(internal.googleCalendar.reconcileTenant, {
        tenantId: TENANT,
        connectionId: "conn-1",
        scheduleNext: true,
      }),
    ).toMatchObject({ status: "disconnected" });
    expect(await eventTypes(manager)).toContain("IntegrationConnectionRevoked");
    expect(await ledgerRows(manager, ["GoogleCalendarConnection"])).toBe(0);
  });

  it("the OAuth commands refuse a person calling them directly, even an admin", async () => {
    const proof = harness();
    const admin = actor(proof, {
      subject: "cal-admin",
      role: "admin",
      tenantId: TENANT,
    });
    const created = (await admin.mutation(
      api.mutations.IntegrationConnection_createViaAuthorize,
      { provider: "google_calendar" },
    )) as { docId: string };
    await expect(
      admin.mutation(api.mutations.IntegrationConnection_recordOAuthGrant, {
        docId: created.docId as never,
        engagementId: "forged",
        externalAccountId: "primary",
        refreshToken: "forged-token",
        connectedById: "someone",
        grantedAt: Date.now(),
      }),
    ).rejects.toThrow(/Guard 0 failed/);
  });
});

describe("QuickBooks state is governed; ledger tenants keep working", () => {
  it("adopts the ledger connection and keeps the rotated refresh token sealed on the entity", async () => {
    const proof = harness();
    const system = actor(proof, {
      subject: "qbo-sys",
      role: "admin",
      tenantId: TENANT,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/oauth2/v1/tokens/bearer")) {
          return Response.json({
            access_token: "qbo-access",
            refresh_token: "rotated-refresh",
            expires_in: 3600,
          });
        }
        if (url.includes("/query")) {
          return Response.json({ QueryResponse: { Item: [{ Id: "1" }] } });
        }
        return Response.json({});
      }),
    );
    await system.run(async (ctx) => {
      await ctx.db.insert("manifestEvents", {
        type: "QuickBooksConnected",
        entity: "QuickBooksConnection",
        entityId: TENANT,
        payload: {
          tenantId: TENANT,
          connectionId: "legacy-qbo",
          realmId: "realm-1",
          connectedAt: Date.now() - HOUR,
          connectedBy: "legacy-manager",
          refreshToken: await seal("legacy-qbo-refresh"),
        },
        createdAt: Date.now() - HOUR,
      });
      await ctx.db.insert("manifestEvents", {
        type: "QuickBooksInvoiceSynced",
        entity: "QuickBooksInvoiceLink",
        entityId: "invoice-1",
        payload: {
          tenantId: TENANT,
          qboId: "qbo-inv-1",
          connectionId: "legacy-qbo",
          status: "synced",
          syncedAt: Date.now() - HOUR,
          error: null,
        },
        createdAt: Date.now() - HOUR,
      });
    });
    const ledgerBefore = await ledgerRows(system, [
      "QuickBooksConnection",
      "QuickBooksInvoiceLink",
    ]);

    expect(
      await system.action(internal.qboSync.reconcileTenant, {
        tenantId: TENANT,
        connectionId: "legacy-qbo",
        scheduleNext: false,
      }),
    ).toMatchObject({ status: "ok" });

    const row = (await system.run(
      async (ctx) =>
        (await ctx.db.query("integrationConnections").collect())[0],
    )) as Record<string, unknown>;
    expect(row).toMatchObject({
      provider: "quickbooks",
      engagementId: "legacy-qbo",
      externalAccountId: "realm-1",
      status: "connected",
    });
    const sealed = parseSealedEnvelope(row.oauthRefreshToken)!;
    expect(
      await decrypt(sealed.ciphertext, sealed.keyId, {
        ctx: null,
        entity: "IntegrationConnection",
        property: "oauthRefreshToken",
      }),
    ).toBe("rotated-refresh");
    expect(
      (await system.run(async (ctx) =>
        ctx.db.query("integrationSyncRecords").collect(),
      )) as Array<Record<string, unknown>>,
    ).toMatchObject([
      {
        syncKey: "quickbooks:invoice:invoice-1",
        externalId: "qbo-inv-1",
        status: "synced",
      },
    ]);
    expect(await eventTypes(system)).toContain("IntegrationCredentialRotated");
    expect(
      await ledgerRows(system, [
        "QuickBooksConnection",
        "QuickBooksInvoiceLink",
      ]),
    ).toBe(ledgerBefore);

    // The next run uses the rotated token straight from the entity.
    expect(
      await system.query(internal.qboSync.loadActiveConnection, {
        tenantId: TENANT,
      }),
    ).toMatchObject({
      connectionId: "legacy-qbo",
      source: "entity",
      ledgerImported: true,
    });
  });
});

describe("outbound webhooks are governed; ledger endpoints keep working", () => {
  async function hmac(body: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const bytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
    );
    return [...bytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  it("copies a ledger endpoint once, signs with its old secret and never resends a delivered event", async () => {
    const proof = harness();
    const manager = actor(proof, {
      subject: "wh-mgr",
      role: "manager",
      tenantId: TENANT,
    });
    const calls: Array<{ body: string; signature: string | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (
          _url: string,
          init: { body: string; headers: Record<string, string> },
        ) => {
          calls.push({
            body: init.body,
            signature: init.headers["X-Capsule-Signature"],
          });
          return new Response(null, { status: 200 });
        },
      ),
    );
    const secret = await seal("legacy-signing-secret");
    const [delivered, pending] = (await manager.run(async (ctx) => {
      await ctx.db.insert("manifestEvents", {
        type: "WebhookEndpointRegistered",
        entity: "WebhookEndpoint",
        entityId: "legacy-ep",
        payload: {
          tenantId: TENANT,
          endpointId: "legacy-ep",
          url: "https://hooks.example.test/legacy",
          label: "Legacy hook",
          events: ["EventApproved"],
          secret,
          registeredAt: Date.now() - 30 * MINUTE,
          registeredBy: "legacy-manager",
        },
        createdAt: Date.now() - 30 * MINUTE,
      });
      const first = String(
        await ctx.db.insert("manifestEvents", {
          type: "EventApproved",
          entity: "Event",
          entityId: "event-1",
          payload: { tenantId: TENANT, eventId: "event-1" },
          createdAt: Date.now() - 20 * MINUTE,
        }),
      );
      await ctx.db.insert("manifestEvents", {
        type: "WebhookDeliverySucceeded",
        entity: "WebhookDelivery",
        entityId: `legacy-ep:${first}`,
        payload: {
          tenantId: TENANT,
          deliveryId: "legacy-attempt-1",
          endpointId: "legacy-ep",
          sourceEventId: first,
          eventType: "EventApproved",
          status: "succeeded",
          attempt: 1,
          httpStatus: 200,
          error: null,
          occurredAt: Date.now() - 20 * MINUTE,
        },
        createdAt: Date.now() - 19 * MINUTE,
      });
      const second = String(
        await ctx.db.insert("manifestEvents", {
          type: "EventApproved",
          entity: "Event",
          entityId: "event-2",
          payload: { tenantId: TENANT, eventId: "event-2" },
          createdAt: Date.now() - 5 * MINUTE,
        }),
      );
      return [first, second];
    })) as [string, string];
    const ledgerBefore = await ledgerRows(manager, [
      "WebhookEndpoint",
      "WebhookDelivery",
      "WebhookDispatchTick",
    ]);

    // Listed from the ledger before anything moved.
    expect(
      await manager.query(api.webhookIntegrations.listEndpoints, {}),
    ).toMatchObject([
      { endpointId: "legacy-ep", hasSecret: true, label: "Legacy hook" },
    ]);

    expect(
      await manager.action(internal.webhookIntegrations.dispatchPending, {
        tenantId: TENANT,
        scheduleNext: false,
      }),
    ).toEqual({ delivered: 1, attempted: 1 });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!.body)).toMatchObject({
      eventType: "EventApproved",
    });
    expect(calls[0]!.signature).toBe(
      await hmac(calls[0]!.body, "legacy-signing-secret"),
    );

    const endpoints = (await manager.run(async (ctx) =>
      ctx.db.query("outboundWebhookEndpoints").collect(),
    )) as Array<Record<string, unknown>>;
    expect(endpoints).toMatchObject([
      { endpointKey: "legacy-ep", status: "active", hasSigningSecret: true },
    ]);
    expect(String(endpoints[0]!.signingSecret)).not.toContain(
      "legacy-signing-secret",
    );
    const deliveries = (await manager.run(async (ctx) =>
      ctx.db.query("outboundWebhookDeliveries").collect(),
    )) as Array<Record<string, unknown>>;
    expect(deliveries.map((row) => [row.attemptId, row.sourceEventId])).toEqual(
      [
        ["legacy-attempt-1", delivered],
        [expect.any(String), pending],
      ],
    );

    // Later ticks: nothing re-sent, nothing re-imported, no ledger writes.
    await manager.run(async (ctx) => {
      for (const state of await ctx.db
        .query("webhookDispatchStates")
        .collect()) {
        await ctx.db.patch(state._id, {
          lastTickAt: (state.lastTickAt ?? 0) - 2 * MINUTE,
        });
      }
    });
    expect(
      await manager.action(internal.webhookIntegrations.dispatchPending, {
        tenantId: TENANT,
        scheduleNext: false,
      }),
    ).toEqual({ delivered: 0, attempted: 0 });
    expect(
      (
        (await manager.run(async (ctx) =>
          ctx.db.query("outboundWebhookEndpoints").collect(),
        )) as unknown[]
      ).length,
    ).toBe(1);
    expect(
      await ledgerRows(manager, [
        "WebhookEndpoint",
        "WebhookDelivery",
        "WebhookDispatchTick",
      ]),
    ).toBe(ledgerBefore);
    expect(await eventTypes(manager)).toEqual(
      expect.arrayContaining([
        "WebhookEndpointRegistered",
        "WebhookDeliveryAttempted",
      ]),
    );
    // The generated read never returns the signing secret.
    const listed = (await manager.query(
      api.queries.listOutboundWebhookEndpoint,
      {} as never,
    )) as Array<Record<string, unknown>>;
    expect(listed[0]).not.toHaveProperty("signingSecret");
  });

  it("registering and removing stay manager-only; the command refuses a person directly", async () => {
    const proof = harness();
    const manager = actor(proof, {
      subject: "wh-mgr2",
      role: "manager",
      tenantId: TENANT,
    });
    const staff = actor(proof, {
      subject: "wh-staff",
      role: "staff",
      tenantId: TENANT,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const input = {
      url: "https://hooks.example.test/new",
      label: "New hook",
      events: ["EventApproved"],
      secret: "s3cret",
    };
    await expect(
      staff.action(api.webhookIntegrations.registerEndpoint, input),
    ).rejects.toThrow(/organization manager/);
    await expect(
      manager.mutation(
        api.mutations.OutboundWebhookEndpoint_createViaRegister,
        {
          newEndpointKey: "forged",
          url: input.url,
          label: input.label,
          events: input.events,
          registeredById: "wh-mgr2",
          registeredAt: Date.now(),
        },
      ),
    ).rejects.toThrow(/Guard 0 failed/);

    const { endpointId } = await manager.action(
      api.webhookIntegrations.registerEndpoint,
      input,
    );
    expect(
      await manager.query(api.webhookIntegrations.listEndpoints, {}),
    ).toMatchObject([
      { endpointId, hasSecret: true, registeredBy: expect.any(String) },
    ]);
    await expect(
      staff.action(api.webhookIntegrations.removeEndpoint, { endpointId }),
    ).rejects.toThrow(/organization manager/);
    await manager.action(api.webhookIntegrations.removeEndpoint, {
      endpointId,
    });
    expect(
      await manager.query(api.webhookIntegrations.listEndpoints, {}),
    ).toEqual([]);
    const types = await eventTypes(manager);
    expect(types).toEqual(
      expect.arrayContaining([
        "WebhookEndpointRegistered",
        "WebhookEndpointRemoved",
      ]),
    );
    expect(
      await ledgerRows(manager, ["WebhookEndpoint", "WebhookDispatchTick"]),
    ).toBe(0);
  });
});
