import { type ReactNode, useEffect, useState } from "react";
import { WifiOffIcon } from "../../ui/icons";

/**
 * Boot-time offline state for the installed (cached) shell. If the app starts
 * with no connection, Clerk cannot load and nothing can sign in, so show an
 * explicit message instead of an endless "Checking your session…". Once the
 * browser reports `online` — or the user taps "Try again" — the normal
 * providers mount and AuthGate runs as usual. Nothing here authenticates,
 * caches, or bypasses anything; a wrong `onLine=false` only costs one tap.
 */
export function OfflineGate({ children }: { readonly children: ReactNode }) {
  const [bootOffline, setBootOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );
  useEffect(() => {
    if (!bootOffline) return;
    const up = () => setBootOffline(false);
    window.addEventListener("online", up);
    return () => window.removeEventListener("online", up);
  }, [bootOffline]);
  if (bootOffline)
    return <OfflineShell onRetry={() => setBootOffline(false)} />;
  return <>{children}</>;
}

export function OfflineShell({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div
      className="grid min-h-dvh place-items-center bg-canvas px-6 py-10"
      data-testid="offline-shell"
    >
      <div className="card max-w-sm p-6 text-center">
        <WifiOffIcon className="mx-auto text-ink-3" width={28} height={28} />
        <h1 className="mt-3 font-display text-xl font-semibold">
          You are offline
        </h1>
        <p className="mt-2 text-base leading-relaxed text-ink-2">
          Capsule is installed, but sign-in and event data need a connection.
          Reconnect and this screen will continue on its own.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-4 min-h-11"
          onClick={onRetry}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

const SLOW_SIGN_IN_MS = 12_000;

/**
 * Rendered under Clerk's <ClerkLoading>: the browser says it is online but
 * clerk-js has not loaded for a while (captive portal, blocked CDN). Says so
 * instead of leaving "Checking your session…" up forever. Read-only notice;
 * it never changes auth state.
 */
export function SlowSignInNotice() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_SIGN_IN_MS);
    return () => window.clearTimeout(timer);
  }, []);
  if (!slow) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-2 border-t border-warn/30 bg-warn-soft px-4 py-2 text-base font-medium text-warn"
    >
      <WifiOffIcon width={14} height={14} />
      Sign-in cannot reach its servers. Check the connection, then reload.
      <button
        type="button"
        className="btn btn-ghost min-h-11"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  );
}
