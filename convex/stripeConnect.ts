import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery, type ActionCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

// Stripe Connect onboarding — spec §12.1 + issue #112.
//
// A tenant's invoice payments must settle to THAT tenant, not to the platform.
// We use Standard connected accounts with direct charges: the caterer owns the
// Stripe relationship (their own disputes, payouts, fees, and compliance), and
// Capsule never takes custody of their customers' money. Charges are created
// with the platform secret key plus a `Stripe-Account: acct_...` header, so no
// per-tenant secret is ever stored — only the account id, which lives on the
// tenant's IntegrationConnection row.

const STRIPE_PROVIDER = "stripe";

// Matches the IntegrationConnection `adminAccess` execute policy (admin extends
// manager; owner and system extend admin). A plain `*_manager` is NOT included.
const ADMIN_ROLES = new Set(["admin", "owner", "system"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeProviderMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.replace(/[\r\n]+/gu, " ").slice(0, 300);
}

function requirePlatformEnvironment(): {
  stripeSecretKey: string;
  appOrigin: string;
} {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const rawOrigin = process.env.CAPSULE_PUBLIC_APP_URL?.trim();
  if (!stripeSecretKey || !rawOrigin) {
    throw new ConvexError(
      "Stripe Connect needs STRIPE_SECRET_KEY and CAPSULE_PUBLIC_APP_URL in the Convex environment.",
    );
  }
  let appOrigin: string;
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
    appOrigin = parsed.origin;
  } catch {
    throw new ConvexError(
      "CAPSULE_PUBLIC_APP_URL must be a valid HTTP(S) application origin.",
    );
  }
  return { stripeSecretKey, appOrigin };
}

async function stripeForm(
  path: string,
  stripeSecretKey: string,
  body: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = asRecord(await response.json().catch(() => null));
  if (!response.ok) {
    const error = asRecord(payload.error);
    throw new Error(
      stringValue(error.message) || `Stripe call failed (${response.status}).`,
    );
  }
  return payload;
}

/**
 * The caller-tenant's Stripe connection. Internal so the payment path can read
 * it without a manageAccess role — the client paying an invoice is not staff.
 */
export const loadStripeConnection = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args): Promise<Doc<"integrationConnections"> | null> => {
    const rows = await ctx.db
      .query("integrationConnections")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    return (
      rows.find(
        (row) => row.provider === STRIPE_PROVIDER && row.deletedAt == null,
      ) ?? null
    );
  },
});

export interface StripeConnectionView {
  /**
   * Whether THIS caller may run the connect/refresh/disconnect commands.
   * Mirrors the entity's `adminAccess` execute policy so the UI never offers a
   * button the server will refuse — binding a payout account is admin-only.
   */
  canManage: boolean;
  connectionId: string | null;
  status: string;
  externalAccountId: string | null;
  displayName: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  lastErrorMessage: string | null;
}

export const getStripeConnection = action({
  args: {},
  handler: async (ctx): Promise<StripeConnectionView> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) {
      throw new ConvexError("Workspace unavailable. Check your access.");
    }
    const canManage = ADMIN_ROLES.has(auth.role);
    const row = await ctx.runQuery(
      internal.stripeConnect.loadStripeConnection,
      {
        tenantId: auth.tenantId,
      },
    );
    if (!row) {
      return {
        canManage,
        connectionId: null,
        status: "disconnected",
        externalAccountId: null,
        displayName: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        lastErrorMessage: null,
      };
    }
    return {
      canManage,
      connectionId: String(row._id),
      status: String(row.status),
      externalAccountId: stringValue(row.externalAccountId),
      displayName: stringValue(row.displayName),
      chargesEnabled: Boolean(row.chargesEnabled),
      payoutsEnabled: Boolean(row.payoutsEnabled),
      lastErrorMessage: stringValue(row.lastErrorMessage),
    };
  },
});

/**
 * Create (or reuse) this tenant's Standard connected account and hand back a
 * Stripe-hosted onboarding link. Stripe collects the caterer's business and
 * bank details directly — Capsule never sees them.
 */
export const startStripeOnboarding = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ onboardingUrl: string; accountId: string }> => {
    const environment = requirePlatformEnvironment();
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) {
      throw new ConvexError("Workspace unavailable. Check your access.");
    }

    const existing = await ctx.runQuery(
      internal.stripeConnect.loadStripeConnection,
      { tenantId: auth.tenantId },
    );

    // Reuse an account that already exists so re-running onboarding never
    // strands a second acct_ id on the same tenant.
    let accountId = stringValue(existing?.externalAccountId);
    let connectionId = existing ? String(existing._id) : null;

    if (!accountId) {
      const account = await stripeForm(
        "accounts",
        environment.stripeSecretKey,
        new URLSearchParams({
          type: "standard",
          "metadata[tenantId]": auth.tenantId,
        }),
      );
      accountId = stringValue(account.id);
      if (!accountId) {
        throw new ConvexError("Stripe did not return a connected account id.");
      }
    }

    if (!connectionId) {
      const created: { docId: string } = await ctx.runMutation(
        api.mutations.IntegrationConnection_createViaAuthorize,
        {
          provider: STRIPE_PROVIDER,
          externalAccountId: accountId,
          displayName: "Stripe",
          idempotencyKey: `stripe-connect/${auth.tenantId}/authorize`,
        },
      );
      connectionId = String(created.docId);
    }

    const returnUrl = new URL(environment.appOrigin);
    returnUrl.pathname = "/admin/integrations";
    returnUrl.searchParams.set("stripe_connect", "return");
    const refreshUrl = new URL(environment.appOrigin);
    refreshUrl.pathname = "/admin/integrations";
    refreshUrl.searchParams.set("stripe_connect", "refresh");

    const link = await stripeForm(
      "account_links",
      environment.stripeSecretKey,
      new URLSearchParams({
        account: accountId,
        type: "account_onboarding",
        return_url: returnUrl.toString(),
        refresh_url: refreshUrl.toString(),
      }),
    );
    const onboardingUrl = stringValue(link.url);
    if (!onboardingUrl) {
      throw new ConvexError("Stripe did not return an onboarding link.");
    }
    return { onboardingUrl, accountId };
  },
});

/**
 * Pull the connected account's current capabilities from Stripe and record
 * them. This is the poll-based substitute for the `account.updated` webhook,
 * which is blocked by issue #52 (the generated Convex webhook verifier cannot
 * parse Stripe's `t=...,v1=...` signature).
 */
export const refreshStripeConnection = action({
  args: {},
  handler: async (ctx): Promise<StripeConnectionView> => {
    const environment = requirePlatformEnvironment();
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) {
      throw new ConvexError("Workspace unavailable. Check your access.");
    }
    const existing = await ctx.runQuery(
      internal.stripeConnect.loadStripeConnection,
      { tenantId: auth.tenantId },
    );
    const accountId = stringValue(existing?.externalAccountId);
    if (!existing || !accountId) {
      throw new ConvexError("Connect a Stripe account before refreshing it.");
    }

    try {
      const response = await fetch(
        `https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`,
        {
          headers: { Authorization: `Bearer ${environment.stripeSecretKey}` },
        },
      );
      const account = asRecord(await response.json().catch(() => null));
      if (!response.ok) {
        const error = asRecord(account.error);
        throw new Error(
          stringValue(error.message) ||
            `Stripe account lookup failed (${response.status}).`,
        );
      }
      const businessProfile = asRecord(account.business_profile);
      await ctx.runMutation(api.mutations.IntegrationConnection_markConnected, {
        docId: existing._id as Id<"integrationConnections">,
        externalAccountId: accountId,
        displayName:
          stringValue(businessProfile.name) ||
          stringValue(account.email) ||
          "Stripe",
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
      });
    } catch (cause) {
      // §12.1: a provider outage leaves a visible failed state, it does not
      // roll back unrelated user work.
      await ctx.runMutation(api.mutations.IntegrationConnection_recordFailure, {
        docId: existing._id as Id<"integrationConnections">,
        reason: safeProviderMessage(cause),
      });
      throw new ConvexError(
        `Stripe refresh failed: ${safeProviderMessage(cause)}`,
      );
    }

    return await ctx.runAction(api.stripeConnect.getStripeConnection, {});
  },
});

export const disconnectStripe = action({
  args: {},
  handler: async (ctx: ActionCtx): Promise<{ disconnected: boolean }> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) {
      throw new ConvexError("Workspace unavailable. Check your access.");
    }
    const existing = await ctx.runQuery(
      internal.stripeConnect.loadStripeConnection,
      { tenantId: auth.tenantId },
    );
    if (!existing) return { disconnected: false };
    // Capsule forgets the account; the caterer's Stripe account itself keeps
    // existing and is theirs. We never delete a live merchant account.
    await ctx.runMutation(api.mutations.IntegrationConnection_disconnect, {
      docId: existing._id as Id<"integrationConnections">,
      reason: "Disconnected from Capsule",
    });
    return { disconnected: true };
  },
});
