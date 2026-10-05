/**
 * PL-MONITORING (AC-165): QuickBooks says when its refresh token stops working
 * (x_refresh_token_expires_in). Capsule keeps that date with the connection,
 * moves it forward when QuickBooks hands out a new token, and the connection
 * status shows it, so System health can warn before sending stops.
 * QuickBooks is a fake fetch; synthetic workspace.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { encrypt } from "../../convex/lib/encryption";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-qbo-access-end";
const DAY = 24 * 60 * 60_000;

beforeEach(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
  vi.stubEnv("QBO_CLIENT_ID", "proof-client");
  vi.stubEnv("QBO_CLIENT_SECRET", "proof-secret");
  vi.stubEnv("QBO_REDIRECT_URI", "https://proof.example/callback");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("QuickBooks access end date", () => {
  it("a token refresh stores the new end date and the status shows it", async () => {
    const t = convexTest(schema, modules);
    const refreshToken = await encrypt("proof-refresh-token", {
      entity: "QuickBooksConnection",
      property: "refreshToken",
    } as Parameters<typeof encrypt>[1]);
    const oldEnd = Date.now() + 3 * DAY;
    await t.run(async (ctx) => {
      await ctx.db.insert("manifestEvents", {
        type: "QuickBooksConnected",
        entity: "QuickBooksConnection",
        entityId: TENANT,
        payload: {
          tenantId: TENANT,
          connectionId: "qbo-conn",
          realmId: "realm-1",
          connectedAt: Date.now() - 97 * DAY,
          connectedBy: "proof-manager",
          refreshToken,
          refreshTokenExpiresAt: oldEnd,
        },
        createdAt: Date.now() - 60_000,
      });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/oauth2/v1/tokens/bearer")
          ? Response.json({
              access_token: "proof-access",
              refresh_token: "proof-refresh-token-2",
              expires_in: 3600,
              x_refresh_token_expires_in: 100 * 24 * 60 * 60,
            })
          : Response.json({ QueryResponse: {} }),
      ),
    );

    const manager = t.withIdentity({
      subject: "manager-qbo",
      org_id: TENANT,
      role: "admin",
    });
    const before = await manager.query(api.qboSync.getConnectionStatus, {});
    expect(before.accessEndsAt).toBe(oldEnd);

    await t.action(internal.qboSync.reconcileTenant, {
      tenantId: TENANT,
      connectionId: "qbo-conn",
      scheduleNext: false,
    });

    const after = await manager.query(api.qboSync.getConnectionStatus, {});
    expect(after.connected).toBe(true);
    expect(after.accessEndsAt).toBeGreaterThan(Date.now() + 99 * DAY);
    expect(after.accessEndsAt).toBeLessThanOrEqual(Date.now() + 100 * DAY);
  });
});
