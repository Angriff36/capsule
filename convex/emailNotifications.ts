import { ConvexError, v } from "convex/values";
import {
  isEmailNotificationSubscribed,
  renderEmailNotificationSummary,
  type EmailNotificationCategory,
} from "../src/lib/emailNotifications";
import { query } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";

const category = v.union(
  v.literal("event_updates"),
  v.literal("invoice_reminders"),
  v.literal("low_stock_alerts"),
  v.literal("shift_changes"),
);

/**
 * Provider-neutral delivery gate. It returns no email payload when the current
 * user has disabled the requested category; callers cannot accidentally render
 * and send a subscribed-only email without passing this server-side check.
 */
export const prepareMyDelivery = query({
  args: {
    category,
    title: v.string(),
    summary: v.string(),
    actionLabel: v.string(),
    deepLinkPath: v.string(),
    appOrigin: v.string(),
    items: v.array(v.object({ label: v.string(), value: v.string() })),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!auth.id) {
      throw new ConvexError("Sign in to prepare an email notification.");
    }

    const [preferenceRows, organizations] = await Promise.all([
      ctx.db
        .query("emailNotificationSubscriptions")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("organizations")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
    ]);
    const preferences = preferenceRows.find((row) => row.ownerId === auth.id);
    const subscribed = isEmailNotificationSubscribed(
      preferences,
      args.category as EmailNotificationCategory,
    );
    if (!subscribed) {
      return {
        category: args.category,
        subscribed: false,
        preferencesConfigured: preferences != null,
        delivery: null,
      };
    }

    const organization =
      organizations.find(
        (row) => row.deletedAt == null && row.status === "active",
      ) ?? organizations.find((row) => row.deletedAt == null);

    try {
      return {
        category: args.category,
        subscribed: true,
        preferencesConfigured: preferences != null,
        delivery: renderEmailNotificationSummary({
          category: args.category as EmailNotificationCategory,
          title: args.title,
          summary: args.summary,
          actionLabel: args.actionLabel,
          deepLinkPath: args.deepLinkPath,
          appOrigin: args.appOrigin,
          items: args.items,
          branding: {
            displayName:
              organization?.brandDisplayName?.trim() ||
              organization?.name.trim() ||
              "Catering company",
            address: organization?.brandAddress ?? null,
            primaryColor: organization?.brandPrimaryColor ?? null,
            accentColor: organization?.brandAccentColor ?? null,
          },
        }),
      };
    } catch (cause) {
      throw new ConvexError(
        cause instanceof Error
          ? cause.message
          : "The email summary could not be prepared.",
      );
    }
  },
});
