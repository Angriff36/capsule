import { useUser } from "@clerk/react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../lib/api";
import {
  EMAIL_NOTIFICATION_CATEGORIES,
  EMAIL_NOTIFICATION_CATEGORY_DETAILS,
  isEmailNotificationSubscribed,
  type EmailNotificationCategory,
  type EmailNotificationPreferences,
} from "../../lib/emailNotifications";
import {
  useCreateEmailNotificationSubscription,
  useEmailNotificationSubscriptionUpdateSubscriptions,
  useListEmailNotificationSubscription,
} from "../../lib/manifest-convex-react";
import { ErrorState, PageHeader, TableSkeleton } from "../../ui/primitives";

const PREVIEW_CONTENT: Record<
  EmailNotificationCategory,
  {
    title: string;
    summary: string;
    actionLabel: string;
    deepLinkPath: string;
    items: Array<{ label: string; value: string }>;
  }
> = {
  event_updates: {
    title: "Rivera dinner moved to approved",
    summary:
      "The event is ready for production planning. Review the latest headcount and service notes before the team starts prep.",
    actionLabel: "Open event",
    deepLinkPath: "/events",
    items: [
      { label: "Service", value: "Friday · 6:30 PM" },
      { label: "Guests", value: "84 confirmed" },
      { label: "Stage", value: "Approved" },
    ],
  },
  invoice_reminders: {
    title: "Invoice #1048 needs a follow-up",
    summary:
      "A customer balance is now past due. The invoice and payment history are ready for review in Capsule.",
    actionLabel: "Review invoice",
    deepLinkPath: "/finance/invoices",
    items: [
      { label: "Client", value: "Northwind Studio" },
      { label: "Balance", value: "$2,480.00" },
      { label: "Due", value: "3 days ago" },
    ],
  },
  low_stock_alerts: {
    title: "3 ingredients are below par",
    summary:
      "Stock changed after today's prep pull. Check the affected ingredients before the next purchasing run.",
    actionLabel: "Open stock book",
    deepLinkPath: "/inventory/stock",
    items: [
      { label: "Extra-virgin olive oil", value: "2.5 L remaining" },
      { label: "Meyer lemons", value: "18 each remaining" },
      { label: "Butter", value: "4 lb remaining" },
    ],
  },
  shift_changes: {
    title: "Saturday service shift changed",
    summary:
      "Your schedule was updated for the Rivera dinner. Confirm the new call time before service.",
    actionLabel: "View My Day",
    deepLinkPath: "/my",
    items: [
      { label: "Role", value: "Event staff" },
      { label: "Call time", value: "3:30 PM" },
      { label: "Location", value: "The Foundry" },
    ],
  },
};

const preferenceSnapshot = (
  row: EmailNotificationPreferences | null | undefined,
): Required<EmailNotificationPreferences> => ({
  eventUpdates: row?.eventUpdates !== false,
  invoiceReminders: row?.invoiceReminders !== false,
  lowStockAlerts: row?.lowStockAlerts !== false,
  shiftChanges: row?.shiftChanges !== false,
});

export function EmailNotificationSettingsPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const authStatus = useAuthStatus();
  const rows = useListEmailNotificationSubscription();
  const createPreferences = useCreateEmailNotificationSubscription();
  const updatePreferences =
    useEmailNotificationSubscriptionUpdateSubscriptions();
  const [previewCategory, setPreviewCategory] =
    useState<EmailNotificationCategory>("event_updates");
  const [optimistic, setOptimistic] =
    useState<Required<EmailNotificationPreferences> | null>(null);
  const [busy, setBusy] = useState<EmailNotificationCategory | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const record = rows?.[0] ?? null;
  const preferences = optimistic ?? preferenceSnapshot(record);
  const preview = PREVIEW_CONTENT[previewCategory];
  const previewResult = useQuery(
    api.emailNotifications.prepareMyDelivery,
    rows === undefined || !userLoaded
      ? "skip"
      : {
          category: previewCategory,
          ...preview,
          appOrigin: window.location.origin,
        },
  );

  async function setCategory(
    category: EmailNotificationCategory,
    subscribed: boolean,
  ) {
    if (busy || !userLoaded || !user || !authStatus) return;
    const field = EMAIL_NOTIFICATION_CATEGORY_DETAILS[category].preferenceField;
    const next = { ...preferences, [field]: subscribed };
    setOptimistic(next);
    setBusy(category);
    setNotice(null);
    setError(null);
    try {
      if (record) {
        await updatePreferences({
          docId: record._id,
          version: record.version,
          ...next,
        });
      } else {
        await createPreferences({
          ...next,
          // Scoped to the resolved staff profile (tenant-specific) plus the
          // sign-in, so a re-linked account never replays another tenant's
          // cached create.
          idempotencyKey: `email-notification-subscriptions:${authStatus.personId ?? `tenant:${authStatus.tenantId ?? "none"}`}:${user.id}`,
        });
      }
      const label = EMAIL_NOTIFICATION_CATEGORY_DETAILS[category].label;
      setNotice(
        `${label} ${subscribed ? "enabled" : "paused"}. Your other email categories did not change.`,
      );
    } catch (cause) {
      setOptimistic(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Your email preference could not be saved.",
      );
    } finally {
      setBusy(null);
      setOptimistic(null);
    }
  }

  if (rows === undefined || !userLoaded) {
    return <TableSkeleton rows={6} />;
  }

  const enabledCount = EMAIL_NOTIFICATION_CATEGORIES.filter((category) =>
    isEmailNotificationSubscribed(preferences, category),
  ).length;

  return (
    <div className="operations-stage space-y-6">
      <PageHeader
        title="Email dispatches"
        lead="Choose exactly which operational summaries reach your inbox. In-app notifications stay on, and changing one category never changes the others."
      />

      <section className="grid overflow-hidden rounded-sm border border-line-2 bg-panel shadow-[0_24px_70px_-52px_rgba(25,36,31,0.7)] xl:grid-cols-[minmax(0,0.88fr)_minmax(460px,1.12fr)]">
        <div className="border-line-2 p-6 xl:border-r">
          <div className="flex items-end justify-between gap-4 border-b border-line-2 pb-5">
            <div>
              <p className="eyebrow">Personal delivery board</p>
              <h2 className="mt-2 font-display text-xl">Your inbox mix</h2>
              <p className="mt-2 max-w-lg text-base leading-relaxed text-ink-2">
                Sent to{" "}
                {user?.primaryEmailAddress?.emailAddress ??
                  "your account email"}
                .
              </p>
            </div>
            <div className="shrink-0 text-right">
              <strong className="font-mono text-xl text-brand">
                {enabledCount}/4
              </strong>
              <span className="block text-2xs tracking-[0.12em] text-ink-3 uppercase">
                channels live
              </span>
            </div>
          </div>

          {error ? (
            <div className="mt-4">
              <ErrorState title="Preference not saved" detail={error} />
            </div>
          ) : null}
          {notice ? (
            <p
              className="mt-4 rounded-xs border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok"
              role="status"
            >
              {notice}
            </p>
          ) : null}

          <div className="mt-2 divide-y divide-line-2">
            {EMAIL_NOTIFICATION_CATEGORIES.map((category, index) => {
              const detail = EMAIL_NOTIFICATION_CATEGORY_DETAILS[category];
              const subscribed = isEmailNotificationSubscribed(
                preferences,
                category,
              );
              return (
                <article
                  key={category}
                  className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 py-5"
                  data-testid={`email-category-${category}`}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-line-2 bg-inset font-mono text-2xs font-bold text-ink-2">
                    0{index + 1}
                  </span>
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="text-left font-semibold hover:text-brand hover:underline"
                      onClick={() => setPreviewCategory(category)}
                    >
                      {detail.label}
                    </button>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">
                      {detail.description}
                    </p>
                    <p className="mt-1 font-mono text-2xs tracking-[0.09em] text-ink-3 uppercase">
                      {detail.cadence}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={subscribed}
                    aria-label={`${detail.label} email notifications`}
                    disabled={busy != null}
                    data-testid={`email-toggle-${category}`}
                    onClick={() => {
                      setPreviewCategory(category);
                      void setCategory(category, !subscribed);
                    }}
                    className={`relative h-7 w-12 rounded-full border transition-colors disabled:cursor-wait disabled:opacity-60 ${
                      subscribed
                        ? "border-brand bg-brand"
                        : "border-line bg-inset"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-white shadow-sm transition-transform ${
                        subscribed ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 bg-inset/60 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Branded HTML preview</p>
              <h2 className="mt-2 font-display text-xl">
                {EMAIL_NOTIFICATION_CATEGORY_DETAILS[previewCategory].label}
              </h2>
            </div>
            <span className="rounded-full border border-line-2 bg-panel px-3 py-1.5 font-mono text-2xs tracking-[0.1em] text-ink-3 uppercase">
              Server rendered
            </span>
          </div>
          <div className="relative mt-5 min-h-[560px] overflow-hidden rounded-sm border border-line-2 bg-[#f3f0e9] shadow-[0_20px_52px_-34px_rgba(25,36,31,0.72)]">
            {previewResult === undefined ? (
              <div className="p-6">
                <TableSkeleton rows={5} />
              </div>
            ) : previewResult.delivery ? (
              <iframe
                title={`${EMAIL_NOTIFICATION_CATEGORY_DETAILS[previewCategory].label} email preview`}
                data-testid="email-html-preview"
                sandbox=""
                srcDoc={previewResult.delivery.html}
                className="h-[560px] w-full border-0 bg-white"
              />
            ) : (
              <div
                className="grid min-h-[560px] place-items-center px-8 text-center"
                data-testid="email-preview-paused"
              >
                <div className="max-w-sm">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-line-2 bg-panel font-mono text-xs text-ink-3">
                    OFF
                  </span>
                  <h3 className="mt-5 font-display text-xl">
                    This email is paused
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-ink-2">
                    Nothing is being sent for this category right now. Turn it
                    back on whenever you want these summaries again.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
