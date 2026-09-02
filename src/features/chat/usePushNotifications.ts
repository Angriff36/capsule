import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStatus } from "../../lib/useAuthStatus";

/**
 * How long to wait for the app-shell worker before giving up. A first visit
 * installs it (it caches the shell first), which can take several seconds on
 * venue Wi-Fi; the dev server has no worker at all.
 */
const WORKER_WAIT_MS = 15000;

export type PushState = {
  /** The browser can do web push at all. */
  readonly supported: boolean;
  /** iPhone/iPad in a Safari tab: push works only from the Home Screen app. */
  readonly needsHomeScreen: boolean;
  /** The deployment has no VAPID key yet; nothing can subscribe. */
  readonly keyMissing: boolean;
  /** The ACCOUNT wants notifications (saved server-side, every device). */
  readonly accountEnabled: boolean;
  /** This browser is subscribed and receiving for the signed-in person. */
  readonly deviceActive: boolean;
  /** Account is on but THIS browser still needs a one-time permission tap. */
  readonly deviceNeedsSetup: boolean;
  /** This browser has blocked notifications in its settings. */
  readonly blocked: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  /** Turn notifications on for the account and this device. */
  readonly enable: () => Promise<void>;
  /** Turn notifications off for the account (every device stops). */
  readonly disable: () => Promise<void>;
  /** Account already on elsewhere: switch this device on too. */
  readonly activateThisDevice: () => Promise<void>;
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function workerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // navigator.serviceWorker.ready resolves only once a registration has an
  // ACTIVE worker — never one still installing, which pushManager cannot
  // subscribe against. On a first visit that install can take a few seconds.
  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), WORKER_WAIT_MS),
    ),
  ]);
}

/** True when the browser subscription was made with the current server key. */
function keyMatches(
  subscription: PushSubscription,
  publicKey: string,
): boolean {
  const applied = subscription.options.applicationServerKey;
  if (!applied) return false;
  const current = urlBase64ToUint8Array(publicKey);
  const have = new Uint8Array(applied as ArrayBuffer);
  if (have.length !== current.length) return false;
  for (let i = 0; i < have.length; i += 1) {
    if (have[i] !== current[i]) return false;
  }
  return true;
}

function isIosSafariTab(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function clearPendingRevoke(): void {
  try {
    window.localStorage.removeItem("capsule-push-pending-revoke");
  } catch {
    // storage blocked; the revoke loop only targets a matching endpoint
  }
}

/**
 * Team-chat push, driven by a per-ACCOUNT preference (convex/chatNotifyPreference).
 * The toggle turns notifications on or off for the whole account, so the choice
 * follows the person to every device. Each device keeps ITSELF in step with the
 * preference: where the browser already allows notifications it subscribes
 * automatically; a brand-new device or one whose data was cleared still needs a
 * single "allow" tap, because the browser requires it. The server sends pushes
 * only for direct messages and @mentions (convex/teamChatPush.ts).
 */
export function usePushNotifications(): PushState {
  const publicKey = useQuery(api.pushSubscriptions.vapidPublicKey, {});
  const mine = useQuery(api.pushSubscriptions.mine, {});
  const accountPref = useQuery(api.chatNotifyPreference.mine, {});
  const register = useMutation(api.pushSubscriptions.register);
  const unregister = useMutation(api.pushSubscriptions.unregister);
  const setPreference = useMutation(api.chatNotifyPreference.set);
  const authStatus = useAuthStatus();
  const myPersonId = authStatus?.personId ?? null;

  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [keyStale, setKeyStale] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconcilingRef = useRef(false);

  const supported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    [],
  );

  useEffect(() => {
    if (supported) setPermission(Notification.permission);
  }, [supported]);

  // This device's current browser subscription, if any.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const sync = (subscription: PushSubscription | null | undefined) => {
      if (cancelled) return;
      setEndpoint(subscription?.endpoint ?? null);
      setKeyStale(
        subscription != null &&
          publicKey != null &&
          !keyMatches(subscription, publicKey),
      );
    };
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      sync(await registration?.pushManager.getSubscription());
    })();
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === "capsule:push-changed") {
        void navigator.serviceWorker
          .getRegistration()
          .then((registration) => registration?.pushManager.getSubscription())
          .then(sync);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [supported, publicKey]);

  const deviceActive = useMemo(
    () =>
      endpoint != null &&
      !keyStale &&
      myPersonId != null &&
      (mine ?? []).some(
        (row) => row.endpoint === endpoint && row.personId === myPersonId,
      ),
    [endpoint, keyStale, mine, myPersonId],
  );

  // Subscribe + register THIS browser. `fromGesture` may prompt for permission;
  // without a gesture it proceeds only if permission is already granted.
  const subscribeThisDevice = useCallback(
    async (fromGesture: boolean): Promise<void> => {
      if (!publicKey) {
        if (fromGesture) {
          setError("Notifications are not set up on this deployment yet.");
        }
        return;
      }
      let state = Notification.permission;
      if (state === "default" && fromGesture) {
        state = await Notification.requestPermission();
        setPermission(state);
      }
      if (state !== "granted") {
        if (fromGesture) {
          setError(
            state === "denied"
              ? "Notifications are blocked for Capsule in your browser settings."
              : "Notifications were not allowed on this device.",
          );
        }
        return;
      }
      const registration = await workerRegistration();
      if (!registration) {
        if (fromGesture) {
          setError(
            "This device needs the installed app. Open Capsule from your home screen, or use the production site.",
          );
        }
        return;
      }
      let existing = await registration.pushManager.getSubscription();
      if (existing && !keyMatches(existing, publicKey)) {
        await existing.unsubscribe().catch(() => undefined);
        existing = null;
      }
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            publicKey,
          ) as BufferSource,
        }));
      const keys = subscription.toJSON().keys;
      if (!keys?.p256dh || !keys.auth) {
        throw new Error("The browser returned a subscription without keys.");
      }
      await register({
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: navigator.userAgent.slice(0, 200),
      });
      clearPendingRevoke();
      setEndpoint(subscription.endpoint);
      setKeyStale(false);
    },
    [publicKey, register],
  );

  // Unsubscribe + release THIS browser (server first, so no push is sent even
  // if the browser unsubscribe fails).
  const unsubscribeThisDevice = useCallback(async (): Promise<void> => {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await unregister({ endpoint: subscription.endpoint });
    await subscription.unsubscribe().catch(() => false);
    setEndpoint(null);
    setKeyStale(false);
  }, [unregister]);

  // Keep this device in step with the account preference automatically: turn
  // itself on where the browser already allows it, off when the account is off.
  useEffect(() => {
    if (!supported || busy || accountPref === undefined || mine === undefined) {
      return;
    }
    if (reconcilingRef.current) return;
    const wantsOn = accountPref === true;
    const shouldSubscribe =
      wantsOn && permission === "granted" && !deviceActive && !keyStale;
    const shouldUnsubscribe = !wantsOn && endpoint != null;
    if (!shouldSubscribe && !shouldUnsubscribe) return;
    reconcilingRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        if (shouldSubscribe) await subscribeThisDevice(false);
        else if (shouldUnsubscribe) await unsubscribeThisDevice();
      } catch {
        // silent — the toggle still reflects the account state
      } finally {
        if (!cancelled) reconcilingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      reconcilingRef.current = false;
    };
  }, [
    accountPref,
    busy,
    deviceActive,
    endpoint,
    keyStale,
    mine,
    permission,
    subscribeThisDevice,
    supported,
    unsubscribeThisDevice,
  ]);

  const enable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setPreference({ enabled: true });
      await subscribeThisDevice(true);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Notifications could not be turned on.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, setPreference, subscribeThisDevice, supported]);

  const activateThisDevice = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    try {
      await subscribeThisDevice(true);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Notifications could not be turned on for this device.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, subscribeThisDevice, supported]);

  const disable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setPreference({ enabled: false });
      await unsubscribeThisDevice();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Notifications could not be turned off.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, setPreference, supported, unsubscribeThisDevice]);

  const accountEnabled = accountPref === true;
  return {
    supported,
    needsHomeScreen: supported ? isIosSafariTab() : false,
    keyMissing: publicKey === null,
    accountEnabled,
    deviceActive,
    deviceNeedsSetup:
      accountEnabled &&
      !deviceActive &&
      supported &&
      publicKey != null &&
      permission !== "denied",
    blocked: permission === "denied",
    busy,
    error,
    enable,
    disable,
    activateThisDevice,
  };
}
