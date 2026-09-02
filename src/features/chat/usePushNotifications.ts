import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

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
  /** This device is registered for the signed-in person. */
  readonly enabled: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly enable: () => Promise<void>;
  readonly disable: () => Promise<void>;
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
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // Production registers the worker on load; give it a moment. Dev has none.
  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), WORKER_WAIT_MS),
    ),
  ]);
}

function isIosSafariTab(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/**
 * Web push for team chat on THIS device: subscribe from a tap (the browsers
 * require a user gesture), register the subscription with Convex, and keep
 * the two in step. The server sends pushes only for direct messages and
 * @mentions (convex/teamChatPush.ts).
 */
export function usePushNotifications(): PushState {
  const publicKey = useQuery(api.pushSubscriptions.vapidPublicKey, {});
  const mine = useQuery(api.pushSubscriptions.mine, {});
  const register = useMutation(api.pushSubscriptions.register);
  const unregister = useMutation(api.pushSubscriptions.unregister);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    [],
  );

  // This device's current browser subscription, if any.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setEndpoint(subscription?.endpoint ?? null);
    })();
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === "capsule:push-changed") {
        void navigator.serviceWorker
          .getRegistration()
          .then((registration) => registration?.pushManager.getSubscription())
          .then((subscription) => {
            if (!cancelled) setEndpoint(subscription?.endpoint ?? null);
          });
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [supported]);

  const registered = useMemo(
    () =>
      endpoint != null && (mine ?? []).some((row) => row.endpoint === endpoint),
    [endpoint, mine],
  );

  // A browser subscription the server does not know (the push service rotated
  // it, or the person signed in on a device that was registered before) is
  // re-registered for the signed-in person. register() is an upsert.
  useEffect(() => {
    if (!supported || endpoint == null || mine === undefined || registered)
      return;
    let cancelled = false;
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const keys = subscription?.toJSON().keys;
      if (cancelled || !subscription || !keys?.p256dh || !keys.auth) return;
      try {
        await register({
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: navigator.userAgent.slice(0, 200),
        });
      } catch {
        // Not linked to a profile yet, or offline: the toggle shows "off".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, mine, register, registered, supported]);

  const enable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!publicKey) {
        setError("Notifications are not set up on this deployment yet.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(
          permission === "denied"
            ? "Notifications are blocked for Capsule in your browser settings."
            : "Notifications were not allowed.",
        );
        return;
      }
      const registration = await workerRegistration();
      if (!registration) {
        setError(
          "Notifications need the installed app. Open Capsule from your home screen, or use the production site.",
        );
        return;
      }
      const subscription =
        (await registration.pushManager.getSubscription()) ??
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
      setEndpoint(subscription.endpoint);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Notifications could not be turned on.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, publicKey, register, supported]);

  const disable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unregister({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setEndpoint(null);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Notifications could not be turned off.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, supported, unregister]);

  return {
    supported,
    needsHomeScreen: supported ? isIosSafariTab() : false,
    keyMissing: publicKey === null,
    enabled: registered,
    busy,
    error,
    enable,
    disable,
  };
}
