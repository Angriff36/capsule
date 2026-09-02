import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../lib/api";

/** Best-effort: drop this browser's push subscription, retrying a few times. */
async function dropBrowserSubscription(): Promise<string | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (await subscription.unsubscribe()) return endpoint;
    } catch {
      // keep trying
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return endpoint;
}

/**
 * Mounted inside <Authenticated> (AuthGate): its unmount is the sign-out /
 * session-loss moment while the Convex client still has a token, so it
 * retires the server row (unregister) AND drops the browser subscription.
 * PushRevokeOnSignout on the <Unauthenticated> side is the fallback when this
 * cleanup cannot finish.
 */
export function PushRevokeGuard() {
  const unregister = useMutation(api.pushSubscriptions.unregister);
  const unregisterRef = useRef(unregister);
  unregisterRef.current = unregister;
  useEffect(() => {
    return () => {
      void (async () => {
        const endpoint = await dropBrowserSubscription().catch(() => null);
        if (endpoint) {
          await unregisterRef.current({ endpoint }).catch(() => undefined);
        }
      })();
    };
  }, []);
  return null;
}

/**
 * Mounted while the app is unauthenticated. A signed-out or expired session
 * must not keep this browser subscribed: it retries the browser unsubscribe
 * so a signed-out shared device stops receiving notifications even if the
 * authenticated cleanup above did not complete. Client-only (no auth needed);
 * the server row is pruned on its next failed delivery.
 */
export function PushRevokeOnSignout() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await dropBrowserSubscription();
      } catch {
        // Best effort.
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
