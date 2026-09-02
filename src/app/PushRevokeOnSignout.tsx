import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../lib/api";

/** Drop this browser's push subscription, retrying a few times. */
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
 * Mounted while the app is unauthenticated (AuthGate). `<Unauthenticated>`
 * renders only when there is genuinely no session — a real sign-out or an
 * expired one, never an org switch or a token refresh (those are
 * `<AuthRefreshing>`). So this is the reliable "session ended" signal: it
 * drops this browser's push subscription and retires the server row by its
 * endpoint (a no-auth mutation, since the token is already gone), so a
 * signed-out shared device stops receiving direct-message and mention
 * notifications.
 */
export function PushRevokeOnSignout() {
  const releaseByEndpoint = useMutation(
    api.pushSubscriptions.releaseByEndpoint,
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let endpoint: string | null = null;
      try {
        endpoint = await dropBrowserSubscription();
      } catch {
        // Best effort on the browser side.
      }
      if (cancelled || !endpoint) return;
      // Retire the server row too, so no delivery is even attempted.
      await releaseByEndpoint({ endpoint }).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseByEndpoint]);
  return null;
}
