import { useEffect } from "react";

/**
 * Mounted only while the app is unauthenticated (see AuthGate). Whenever there
 * is no session — an explicit sign-out or a silently expired one — it drops
 * this browser's push subscription, so a signed-out shared device stops
 * receiving direct-message and mention notifications. Client-only: killing the
 * endpoint is enough (the server row is pruned on its next failed delivery),
 * and it needs no auth, so it also covers a lost session.
 */
export function PushRevokeOnSignout() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (!cancelled && subscription) await subscription.unsubscribe();
      } catch {
        // Best effort: a dead endpoint is pruned server-side on next send.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
