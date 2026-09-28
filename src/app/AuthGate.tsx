import { useUser } from "@clerk/react";
import { type ReactNode } from "react";
import {
  Authenticated,
  AuthLoading,
  AuthRefreshing,
  Unauthenticated,
} from "convex/react";
import {
  offlineAuthRestorePolicy,
  offlineAuthSnapshotStore,
} from "../lib/offlineAuthSnapshot";
import { SessionPersistenceBoundary } from "./SessionPersistenceBoundary";
import { PasswordSignIn } from "./PasswordSignIn";
import { PushRevokeOnSignout } from "./PushRevokeOnSignout";
import { ClaimGate } from "./ClaimGate";
import { CapsuleWordmark, GateShell } from "./GateShell";

/** True once VITE_CLERK_PUBLISHABLE_KEY exists in the (uncommitted) local env. */
export function isAuthConfigured(
  env: Record<string, unknown> = import.meta.env,
): boolean {
  return Boolean(env.VITE_CLERK_PUBLISHABLE_KEY);
}

export function AuthGate({ children }: { children?: ReactNode }) {
  return (
    <SessionPersistenceBoundary>
      <PushRevokeOnSignout />
      <AuthLoading>
        <OfflineAuthLoadingFallback>{children}</OfflineAuthLoadingFallback>
      </AuthLoading>
      <Unauthenticated>
        <SignInScreen />
      </Unauthenticated>
      <Authenticated>
        <ClaimGate>{children}</ClaimGate>
      </Authenticated>
      <AuthRefreshing>
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-1 text-sm font-medium text-warn"
        >
          Refreshing your session… your work is untouched.
        </div>
      </AuthRefreshing>
    </SessionPersistenceBoundary>
  );
}

function OfflineAuthLoadingFallback({
  children,
}: {
  readonly children?: ReactNode;
}) {
  const { user, isLoaded } = useUser();
  const online =
    typeof navigator === "undefined" ? true : navigator.onLine !== false;
  const snapshot = user?.id ? offlineAuthSnapshotStore.read(user.id) : null;
  if (
    isLoaded &&
    offlineAuthRestorePolicy.canRestore({
      clerkUserId: user?.id,
      liveAccountId: undefined,
      snapshot,
      online,
    })
  ) {
    return <ClaimGate>{children}</ClaimGate>;
  }
  return (
    <GateShell title="Checking your session…">
      <p className="text-ink-2">Signing you in.</p>
    </GateShell>
  );
}

function SignInScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6 py-10">
      <div className="flex flex-col items-center gap-6">
        <CapsuleWordmark />
        <PasswordSignIn />
      </div>
    </div>
  );
}

export function AuthSetupRequired() {
  return (
    <GateShell title="Sign-in isn't set up yet">
      <p className="leading-relaxed text-ink-2">
        Capsule can't start until sign-in is configured. Finish this one-time
        setup to continue:
      </p>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
        <li>
          Put <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> in{" "}
          <code className="font-mono">.env.local</code> (never commit it).
        </li>
        <li>
          Set <code className="font-mono">CLERK_JWT_ISSUER_DOMAIN</code> on the
          app's server (<code className="font-mono">npx convex env set</code>).
        </li>
        <li>
          Check that the sign-in service is connected to the app's server and
          sends <code className="font-mono">role</code> and{" "}
          <code className="font-mono">tenantId</code>.
        </li>
      </ol>
    </GateShell>
  );
}
