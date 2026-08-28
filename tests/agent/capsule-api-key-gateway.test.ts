/**
 * Proof: a remote agent holding only a Clerk API key reaches the command API
 * through the app-host gateway. No browser session, no human JWT, no repo.
 * Authorization is the key OWNER's Capsule identity; nothing in the request
 * body can change it.
 */
import { describe, expect, it } from "vitest";
import { createApiKeyGateway } from "../../src/agent/CapsuleApiKeyGateway";

const VALID_KEY = "ak_live_valid";
const REVOKED_KEY = "ak_live_revoked";
const OWNER = "user_owner_of_key";
const CONVEX = "https://example.convex.site";

function harness() {
  const forwarded: Request[] = [];
  let clock = 1_000_000;
  const minted: string[] = [];
  const handle = createApiKeyGateway({
    convexSiteUrl: CONVEX,
    now: () => clock,
    verifyApiKey: async (secret) => {
      if (secret === VALID_KEY) return { subject: OWNER };
      throw new Error("API key is invalid, revoked, or expired");
    },
    mintSessionToken: async (userId) => {
      minted.push(userId);
      return `jwt-for-${userId}-${minted.length}`;
    },
    forward: async (request) => {
      forwarded.push(request);
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  return {
    handle,
    forwarded,
    minted,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const APP = "https://capsule.example";

describe("API-key gateway for the command API", () => {
  it("rejects a call with no credential", async () => {
    const h = harness();
    const res = await h.handle(new Request(`${APP}/api/manifest/commands`));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(h.forwarded).toHaveLength(0);
  });

  it("rejects an invalid or revoked key without touching Convex", async () => {
    const h = harness();
    const res = await h.handle(
      new Request(`${APP}/api/manifest/commands`, {
        headers: { Authorization: `Bearer ${REVOKED_KEY}` },
      }),
    );
    expect(res.status).toBe(401);
    expect(h.forwarded).toHaveLength(0);
    expect(h.minted).toHaveLength(0);
  });

  it("lets a valid key discover commands as the key owner", async () => {
    const h = harness();
    const res = await h.handle(
      new Request(`${APP}/api/manifest/commands`, {
        headers: { Authorization: `Bearer ${VALID_KEY}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(h.minted).toEqual([OWNER]);
    const sent = h.forwarded[0]!;
    expect(sent.url).toBe(`${CONVEX}/api/manifest/commands`);
    expect(sent.method).toBe("GET");
    // The API key never reaches Convex; the owner's session token does.
    expect(sent.headers.get("authorization")).toBe(`Bearer jwt-for-${OWNER}-1`);
  });

  it("executes a command as the key owner; body tenant/role/user values change nothing", async () => {
    const h = harness();
    const body = {
      clientType: "company",
      companyName: "Spoof Co",
      tenantId: "tenant-someone-else",
      role: "owner",
      userId: "user_admin",
      __auth: { role: "system" },
    };
    const res = await h.handle(
      new Request(`${APP}/api/manifest/Client/commands/register`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(200);
    const sent = h.forwarded[0]!;
    expect(sent.method).toBe("POST");
    expect(sent.url).toBe(`${CONVEX}/api/manifest/Client/commands/register`);
    // Identity is minted from the verified key subject only.
    expect(h.minted).toEqual([OWNER]);
    expect(sent.headers.get("authorization")).toBe(`Bearer jwt-for-${OWNER}-1`);
    // The body is passed through untouched; the generated dispatcher drops
    // tenantId/role/userId/__auth (DISPATCHER_FORBIDDEN_BODY_KEYS) and every
    // guard runs on the owner's Person row.
    expect(JSON.parse(await sent.text())).toEqual(body);
  });

  it("reuses the owner's session token briefly, then mints again", async () => {
    const h = harness();
    const call = () =>
      h.handle(
        new Request(`${APP}/api/manifest/commands`, {
          headers: { Authorization: `Bearer ${VALID_KEY}` },
        }),
      );
    await call();
    await call();
    expect(h.minted).toHaveLength(1);
    h.advance(46_000);
    await call();
    expect(h.minted).toHaveLength(2);
  });

  it("refuses keys that do not belong to a user", async () => {
    const forwarded: Request[] = [];
    const handle = createApiKeyGateway({
      convexSiteUrl: CONVEX,
      verifyApiKey: async () => ({ subject: "org_not_a_person" }),
      mintSessionToken: async () => "never",
      forward: async (request) => {
        forwarded.push(request);
        return new Response("{}");
      },
    });
    const res = await handle(
      new Request(`${APP}/api/manifest/commands`, {
        headers: { Authorization: "Bearer ak_org" },
      }),
    );
    expect(res.status).toBe(401);
    expect(forwarded).toHaveLength(0);
  });
});
