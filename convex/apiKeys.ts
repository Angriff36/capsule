// AUTHOR-OWNED — not generated. Personal API keys for remote agents.
//
// The signed-in user manages keys that belong to THEIR OWN Clerk user
// (subject = identity.subject) through the Clerk Backend API. A key acts as
// that user on the command API (src/agent/CapsuleApiKeyGateway.ts). Clerk's
// <APIKeys /> component is not used: with an active organization it manages
// organization keys, and the gateway only accepts user keys.
import { v } from "convex/values";
import { action } from "./_generated/server";

const BAPI = "https://api.clerk.com/v1";

export type ApiKeySummary = {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  revoked: boolean;
  expired: boolean;
};

type ClerkApiKey = {
  id: string;
  name?: string | null;
  created_at?: number;
  createdAt?: number;
  last_used_at?: number | null;
  lastUsedAt?: number | null;
  revoked?: boolean;
  expired?: boolean;
  secret?: string;
};

function summarize(key: ClerkApiKey): ApiKeySummary {
  return {
    id: key.id,
    name: key.name ?? "",
    createdAt: key.created_at ?? key.createdAt ?? 0,
    lastUsedAt: key.last_used_at ?? key.lastUsedAt ?? null,
    revoked: key.revoked === true,
    expired: key.expired === true,
  };
}

async function ownerSubject(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to manage API keys.");
  if (!identity.subject.startsWith("user_")) {
    throw new Error("API keys are personal — sign in as a user.");
  }
  return identity.subject;
}

function secretKey(): string {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "API keys are not configured on this deployment (CLERK_SECRET_KEY).",
    );
  }
  return secret;
}

async function clerk<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${BAPI}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `The sign-in service refused the API-key request (${response.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return (await response.json()) as T;
}

/** The caller's own keys, newest first (revoked ones included, flagged). */
export const listMine = action({
  args: {},
  handler: async (ctx): Promise<ApiKeySummary[]> => {
    const subject = await ownerSubject(ctx);
    const page = await clerk<{ data?: ClerkApiKey[] } | ClerkApiKey[]>(
      `/api_keys?subject=${encodeURIComponent(subject)}&include_invalid=true&limit=100`,
    );
    const rows = Array.isArray(page) ? page : (page.data ?? []);
    return rows.map(summarize);
  },
});

/** Create a key for the caller. The secret is returned ONCE, here only. */
export const createMine = action({
  args: { name: v.string() },
  handler: async (
    ctx,
    { name },
  ): Promise<{ key: ApiKeySummary; secret: string }> => {
    const subject = await ownerSubject(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Give the key a name.");
    const created = await clerk<ClerkApiKey>("/api_keys", {
      method: "POST",
      body: { name: trimmed, subject },
    });
    if (!created.secret) {
      throw new Error("The sign-in service did not return the key secret.");
    }
    return { key: summarize(created), secret: created.secret };
  },
});

/** Revoke one of the caller's own keys. Other users' keys are untouchable. */
export const revokeMine = action({
  args: { apiKeyId: v.string() },
  handler: async (ctx, { apiKeyId }): Promise<ApiKeySummary> => {
    const subject = await ownerSubject(ctx);
    const existing = await clerk<ClerkApiKey & { subject?: string }>(
      `/api_keys/${encodeURIComponent(apiKeyId)}`,
    );
    if (existing.subject !== subject) throw new Error("Key not found.");
    const revoked = await clerk<ClerkApiKey>(
      `/api_keys/${encodeURIComponent(apiKeyId)}/revoke`,
      { method: "POST", body: { revocation_reason: "Revoked in Capsule" } },
    );
    return summarize(revoked);
  },
});
