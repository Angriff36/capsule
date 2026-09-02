import { usePushNotifications } from "./usePushNotifications";

/**
 * Team-chat push notifications. The main control is an ACCOUNT setting — on or
 * off for every device you sign in on. A line beneath it shows what this
 * particular device is doing, and offers a one-tap "turn on for this device"
 * when the account is on but the browser has not been allowed here yet.
 */
export function ChatPushToggle() {
  const push = usePushNotifications();
  if (!push.supported) return null;

  const status = push.error
    ? push.error
    : push.keyMissing
      ? "Notifications are not set up on this deployment yet."
      : push.needsHomeScreen
        ? "On iPhone, add Capsule to your Home Screen first, then turn this on from there."
        : !push.accountEnabled
          ? "Get a notification for direct messages and @mentions on your devices."
          : push.deviceActive
            ? "On for your account. This device is receiving notifications."
            : push.blocked
              ? "On for your account, but this browser has blocked notifications in its settings."
              : "On for your account. Allow notifications on this device to receive them here.";

  return (
    <div className="chat-push">
      <button
        type="button"
        className={
          push.accountEnabled
            ? "btn btn-secondary btn-sm"
            : "btn btn-ghost btn-sm"
        }
        aria-pressed={push.accountEnabled}
        disabled={push.busy || (push.keyMissing && !push.accountEnabled)}
        onClick={() =>
          void (push.accountEnabled ? push.disable() : push.enable())
        }
      >
        {push.busy
          ? "Working…"
          : push.accountEnabled
            ? "Notifications on"
            : "Turn on notifications"}
      </button>
      {push.accountEnabled && push.deviceNeedsSetup && !push.busy ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm chat-push-device"
          onClick={() => void push.activateThisDevice()}
        >
          Allow on this device
        </button>
      ) : null}
      <p
        className={`mt-1 text-xs ${push.error ? "text-danger" : "text-ink-3"}`}
        role={push.error ? "alert" : undefined}
      >
        {status}
      </p>
    </div>
  );
}
