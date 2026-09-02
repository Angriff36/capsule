import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useMutation } from "convex/react";
import { api } from "../lib/api";

/**
 * The endpoint of a push subscription that must be fully revoked. Persisted so
 * revocation survives the tab closing, a lost connection, AND the next user
 * signing in on a shared device — it is NEVER abandoned because someone else
 * signed in.
 */
const PENDING_KEY = "capsule-push-pending-revoke";
const RETRY_MS = 15000;

function readPending(): string | null {
  try {
    return window.localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}
function writePending(endpoint: string | null): void {
  try {
    if (endpoint) window.localStorage.setItem(PENDING_KEY, endpoint);
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: the in-memory loop below still runs for this session.
  }
}

type Release = (args: { endpoint: string }) => Promise<unknown>;

let running = false;

/**
 * Complete a stamped revocation and keep retrying until it truly succeeds:
 * the browser subscription for the pending endpoint is unsubscribed AND the
 * server row is released. Module-level and self-retrying, so it is not tied to
 * any component's lifecycle or to who is signed in.
 */
async function processPending(release: Release): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const endpoint = readPending();
      if (!endpoint) return;
      let browserClear = true;
      try {
        const registration =
          "serviceWorker" in navigator
            ? await navigator.serviceWorker.getRegistration()
            : null;
        const subscription = await registration?.pushManager.getSubscription();
        // Only this endpoint — never a new user's fresh subscription.
        if (subscription && subscription.endpoint === endpoint) {
          browserClear = await subscription.unsubscribe().catch(() => false);
        }
      } catch {
        browserClear = false;
      }
      if (browserClear) {
        try {
          await release({ endpoint });
          writePending(null);
          return;
        } catch {
          // server unreachable — fall through and retry
        }
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  } finally {
    running = false;
  }
}

async function currentEndpoint(): Promise<string | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

/**
 * Revokes this browser's push when — and only when — Clerk confirms the user
 * is signed out. It watches Clerk's own `isSignedIn` (the source of truth),
 * not Convex's auth state, so an org switch or a token refresh (which briefly
 * drop Convex auth while the user stays signed in) never disable notifications.
 *
 * On a confirmed sign-out it stamps the current subscription's endpoint as
 * pending, then a durable, self-retrying loop unsubscribes the browser and
 * releases the server row (a no-auth mutation, since the token is gone). The
 * loop is not abandoned if the next user signs in — so on a shared device a
 * departing user's notifications cannot keep arriving for whoever signs in
 * next. Any pending revocation is also resumed on mount. Mounted once, above
 * the auth-state branches.
 */
export function PushRevokeOnSignout() {
  const releaseByEndpoint = useMutation(
    api.pushSubscriptions.releaseByEndpoint,
  );

  // Resume a revocation left pending by a previous session, and retry on
  // reconnect — regardless of who (if anyone) is signed in now.
  useEffect(() => {
    const onOnline = () => void processPending(releaseByEndpoint);
    window.addEventListener("online", onOnline);
    if (readPending()) void processPending(releaseByEndpoint);
    return () => window.removeEventListener("online", onOnline);
  }, [releaseByEndpoint]);

  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    let cancelled = false;
    void (async () => {
      // Stamp the endpoint while the subscription still exists; the durable
      // loop below finishes the job even if this component unmounts or the
      // next user signs in first.
      if (!readPending()) {
        const endpoint = await currentEndpoint().catch(() => null);
        if (cancelled) return;
        if (endpoint) writePending(endpoint);
      }
      if (readPending()) void processPending(releaseByEndpoint);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, releaseByEndpoint]);

  return null;
}
