import { type ReactNode, useEffect, useState } from "react";
import { WifiOffIcon } from "../../ui/icons";

/**
 * Boot-time offline state for the installed (cached) shell. If the app starts
 * with no connection, Clerk cannot load and nothing can sign in, so show an
 * explicit message instead of an endless "Checking your session…". Once the
 * browser reports `online`, the normal providers mount and AuthGate runs as
 * usual — nothing here authenticates, caches, or bypasses anything.
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
  if (bootOffline) return <OfflineShell />;
  return <>{children}</>;
}

export function OfflineShell() {
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
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
