import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
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
 * Revokes this browser's push when — and only when — Clerk confirms the user
 * is signed out. It watches Clerk's own `isSignedIn` (the source of truth),
 * not Convex's auth state, so an org switch or a token refresh (which briefly
 * drop Convex auth while the user stays signed in) never disable notifications.
 * On a real sign-out or an expired session it unsubscribes the browser and
 * retires the server row by its endpoint (a no-auth mutation, since the token
 * is already gone), so a signed-out shared device receives nothing further.
 * Mounted once, above the auth-state branches.
 */
export function PushRevokeOnSignout() {
  const { isLoaded, isSignedIn } = useAuth();
  const releaseByEndpoint = useMutation(
    api.pushSubscriptions.releaseByEndpoint,
  );
  const releaseRef = useRef(releaseByEndpoint);
  releaseRef.current = releaseByEndpoint;
  // Revoke once per signed-out transition (reset when the user signs back in).
  // A first load while already signed out also clears any subscription a
  // prior session left on this browser.
  const revokedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      revokedRef.current = false;
      return;
    }
    if (revokedRef.current) return;
    revokedRef.current = true;
    let cancelled = false;
    void (async () => {
      const endpoint = await dropBrowserSubscription().catch(() => null);
      if (cancelled || !endpoint) return;
      await releaseRef.current({ endpoint }).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return null;
}
