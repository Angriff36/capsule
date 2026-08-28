/**
 * API-key gateway for the Capsule command API.
 *
 * Remote agents send `Authorization: Bearer <Clerk API key>` (ak_…, long-lived,
 * valid until revoked) to `/api/manifest/*` on the APP host. Convex only
 * understands JWTs and `convex/http.ts` is generated, so this gateway verifies
 * the key with Clerk, takes the key's OWNER (a Capsule user), mints that
 * user's short-lived Clerk session token server-side, and forwards the call
 * unchanged to the generated dispatcher. Every guard, policy, and tenant rule
 * then runs exactly as if that user had clicked the button: tenant + role come
 * from the owner's Person row (convex/lib/authContext.ts), never from the
 * request. Revoking the key in Capsule Admin → API keys ends access at once.
 */
import { createClerkClient } from "@clerk/backend";
import { createHash } from "node:crypto";

export interface ApiKeyGatewayDeps {
  /** Throws when the key is invalid, revoked, or expired. */
  verifyApiKey: (secret: string) => Promise<{ subject: string }>;
  /** Clerk session JWT for the key owner, accepted by Convex auth. */
  mintSessionToken: (userId: string) => Promise<string>;
  forward: (request: Request) => Promise<Response>;
  convexSiteUrl: string;
  now?: () => number;
}

const TOKEN_CACHE_MS = 45_000; // Convex session JWTs live ~60s.

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createApiKeyGateway(deps: ApiKeyGatewayDeps) {
  const now = deps.now ?? Date.now;
  const tokens = new Map<string, { jwt: string; at: number }>();

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/manifest/")) {
      return json(404, { error: "Not found" });
    }
    const header = request.headers.get("authorization") ?? "";
    const secret = header.replace(/^Bearer\s+/i, "").trim();
    if (!secret) return json(401, { error: "Unauthorized" });

    let subject: string;
    try {
      subject = (await deps.verifyApiKey(secret)).subject;
    } catch {
      return json(401, { error: "Unauthorized" });
    }
    if (!subject.startsWith("user_")) {
      return json(401, {
        error: "Unauthorized: API key must belong to a Capsule user",
      });
    }

    const cacheKey = createHash("sha256").update(secret).digest("hex");
    const cached = tokens.get(cacheKey);
    let jwt = cached && now() - cached.at < TOKEN_CACHE_MS ? cached.jwt : "";
    if (!jwt) {
      try {
        jwt = await deps.mintSessionToken(subject);
      } catch (err) {
        return json(502, {
          error: `Sign-in service error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      tokens.set(cacheKey, { jwt, at: now() });
    }

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${jwt}`);
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.text();
    const upstream = await deps.forward(
      new Request(`${deps.convexSiteUrl}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body,
      }),
    );
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  };
}

/** Production deps: Clerk Backend API + fetch. */
export function createClerkApiKeyGatewayDeps(
  env: Record<string, string | undefined>,
): ApiKeyGatewayDeps {
  const secretKey = env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
  const convexUrl = env.CONVEX_SITE_URL?.trim() || env.VITE_CONVEX_URL?.trim();
  if (!convexUrl) throw new Error("CONVEX_SITE_URL / VITE_CONVEX_URL not set");
  const clerk = createClerkClient({ secretKey });
  const sessions = new Map<string, string>();
  return {
    convexSiteUrl: convexUrl
      .replace(".convex.cloud", ".convex.site")
      .replace(/:3210$/, ":3211")
      .replace(/\/$/, ""),
    verifyApiKey: (secret) => clerk.apiKeys.verify(secret),
    mintSessionToken: async (userId) => {
      let sessionId = sessions.get(userId);
      if (!sessionId) {
        const active = await clerk.sessions.getSessionList({
          userId,
          status: "active",
        });
        sessionId =
          active.data[0]?.id ??
          (await clerk.sessions.createSession({ userId })).id;
        sessions.set(userId, sessionId);
      }
      try {
        return (await clerk.sessions.getToken(sessionId)).jwt;
      } catch (err) {
        sessions.delete(userId); // session ended — next call creates one
        throw err;
      }
    },
    forward: (request) => fetch(request),
  };
}
