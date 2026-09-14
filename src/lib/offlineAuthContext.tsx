import { createContext, useContext, type ReactNode } from "react";
import type { StoredAuthStatus } from "./offlineAuthSnapshot";

export interface OfflineAuthValue {
  status: StoredAuthStatus;
  source: "live" | "snapshot";
  readOnly: boolean;
}

const OfflineAuthContext = createContext<OfflineAuthValue | null>(null);

export function OfflineAuthProvider({
  value,
  children,
}: {
  readonly value: OfflineAuthValue;
  readonly children: ReactNode;
}) {
  return (
    <OfflineAuthContext.Provider value={value}>
      {children}
    </OfflineAuthContext.Provider>
  );
}

export function useOfflineAuth(): OfflineAuthValue | null {
  return useContext(OfflineAuthContext);
}

export function OfflineReadOnlyBanner({
  capturedAt,
}: {
  readonly capturedAt: number;
}) {
  const when = new Date(capturedAt).toLocaleString();
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-1 text-sm font-medium text-warn"
    >
      Offline — showing the last confirmed workspace from {when}. Changes wait
      until you reconnect.
    </div>
  );
}
