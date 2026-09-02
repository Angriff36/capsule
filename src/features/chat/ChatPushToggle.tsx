import { usePushNotifications } from "./usePushNotifications";

/**
 * "Notify this device": web push for new direct messages and @mentions.
 * One button, one line of state; the hook holds the browser rules.
 */
export function ChatPushToggle() {
  const push = usePushNotifications();
  if (!push.supported) return null;

  const hint = push.error
    ? push.error
    : push.needsHomeScreen
      ? "On iPhone, add Capsule to your Home Screen first, then turn this on from there."
      : push.enabled
        ? "This device gets a notification for new direct messages and @mentions."
        : "Get a notification on this device for direct messages and @mentions.";

  return (
    <div className="chat-push">
      <button
        type="button"
        className={
          push.enabled ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"
        }
        aria-pressed={push.enabled}
        disabled={push.busy || push.keyMissing}
        onClick={() => void (push.enabled ? push.disable() : push.enable())}
      >
        {push.busy
          ? "Working…"
          : push.enabled
            ? "Notifications on"
            : "Notify this device"}
      </button>
      <p
        className={`mt-1 text-xs ${push.error ? "text-danger" : "text-ink-3"}`}
        role={push.error ? "alert" : undefined}
      >
        {push.keyMissing
          ? "Notifications are not set up on this deployment yet."
          : hint}
      </p>
    </div>
  );
}
