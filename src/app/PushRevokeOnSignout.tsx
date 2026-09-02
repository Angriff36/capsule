import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useMutation } from "convex/react";
import { api } from "../lib/api";

type DropResult = { endpoint: string; dropped: boolean } | null;

/** Try once to drop this browser's push subscription. */
async function dropBrowserSubscription(): Promise<DropResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  let dropped = false;
  try {
    dropped = await subscription.unsubscribe();
  } catch {
    dropped = false;
  }
  return { endpoint: subscription.endpoint, dropped };
}

/**
 * Revokes this browser's push when — and only when — Clerk confirms the user
 * is signed out. It watches Clerk's own `isSignedIn` (the source of truth),
 * not Convex's auth state, so an org switch or a token refresh (which briefly
 * drop Convex auth while the user stays signed in) never disable notifications.
 *
 * Revocation is not treated as done until it actually succeeds: both the
 * browser unsubscribe and the server-row release (a no-auth mutation, since
 * the token is gone) must complete. If either fails — e.g. the device is
 * offline at sign-out — it retries on the next `online` event and on a short
 * timer, so a signed-out shared device cannot start receiving pushes again
 * when it reconnects. Mounted once, above the auth-state branches.
 */
export function PushRevokeOnSignout() {
  const { isLoaded, isSignedIn } = useAuth();
  const releaseByEndpoint = useMutation(
    api.pushSubscriptions.releaseByEndpoint,
  );
  const releaseRef = useRef(releaseByEndpoint);
  releaseRef.current = releaseByEndpoint;

  useEffect(() => {
    if (!isLoaded || isSignedIn) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // One attempt; resolves true only when the device is fully clean.
    const attempt = async (): Promise<boolean> => {
      let result: DropResult = null;
      try {
        result = await dropBrowserSubscription();
      } catch {
        return false;
      }
      if (result === null) return true; // nothing subscribed on this browser
      if (!result.dropped) return false; // unsubscribe failed; retry later
      try {
        await releaseRef.current({ endpoint: result.endpoint });
        return true;
      } catch {
        return false; // server unreachable; retry later
      }
    };

    const onOnline = () => void run();
    const cleanupListeners = () => {
      window.removeEventListener("online", onOnline);
      if (timer) clearTimeout(timer);
    };

    const run = async () => {
      if (cancelled) return;
      if (await attempt()) {
        cleanupListeners();
        return;
      }
      if (cancelled) return;
      timer = setTimeout(() => void run(), 15000);
    };

    window.addEventListener("online", onOnline);
    void run();
    return () => {
      cancelled = true;
      cleanupListeners();
    };
  }, [isLoaded, isSignedIn]);

  return null;
}
