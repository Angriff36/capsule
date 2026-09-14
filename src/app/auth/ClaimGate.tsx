import { useUser } from "@clerk/react";
import { useAction, useQuery } from "convex/react";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  OfflineAuthProvider,
  OfflineReadOnlyBanner,
} from "../../lib/offlineAuthContext";
import {
  offlineAuthRestorePolicy,
  offlineAuthSnapshotStore,
  type StoredAuthStatus,
} from "../../lib/offlineAuthSnapshot";
import {
  type AuthStatusSnapshot,
  workspaceMembershipPolicy,
} from "./WorkspaceMembershipPolicy";
import { GateShell } from "./GateShell";
import { MembershipRequired } from "./MembershipRequired";

export function ClaimGate({ children }: { readonly children?: ReactNode }) {
  const { user } = useUser();
  const live = useQuery(api.authStatus.getAuthStatus, {});
  const online =
    typeof navigator === "undefined" ? true : navigator.onLine !== false;
  const snapshot = user?.id ? offlineAuthSnapshotStore.read(user.id) : null;
  const restore = offlineAuthRestorePolicy.canRestore({
    clerkUserId: user?.id,
    liveAccountId: live?.accountId,
    snapshot,
    online,
  });
  const status =
    live?.accountId === user?.id
      ? live
      : restore && snapshot
        ? snapshot
        : undefined;

  useEffect(() => {
    if (!user?.id || !live || live.accountId !== user.id) return;
    if (!workspaceMembershipPolicy.isReady(live as AuthStatusSnapshot)) return;
    if (!live.personId || !live.tenantId) return;
    offlineAuthSnapshotStore.write({
      accountId: live.accountId,
      capturedAt: Date.now(),
      authenticated: live.authenticated,
      hasRole: live.hasRole,
      hasTenant: live.hasTenant,
      role: live.role,
      roleSource: live.roleSource,
      personId: live.personId,
      tenantId: live.tenantId,
      profile: live.profile,
      disabledCapabilities: live.disabledCapabilities,
    });
  }, [live, user?.id]);

  if (status === undefined || status.accountId !== user?.id) {
    return (
      <GateShell title="Loading workspace…">
        <p className="text-ink-2">Confirming your workspace membership.</p>
      </GateShell>
    );
  }
  if (!workspaceMembershipPolicy.isReady(status as AuthStatusSnapshot)) {
    return <MembershipRequired />;
  }
  if (!status.personId) {
    return <AccountProfileSetup key={`${user?.id}:${status.tenantId}`} />;
  }
  const stored = status as StoredAuthStatus;
  const readOnly = restore;
  return (
    <OfflineAuthProvider
      value={{
        status: stored,
        source: readOnly ? "snapshot" : "live",
        readOnly,
      }}
    >
      {readOnly && snapshot ? (
        <OfflineReadOnlyBanner capturedAt={snapshot.capturedAt} />
      ) : null}
      {children}
    </OfflineAuthProvider>
  );
}

function AccountProfileSetup() {
  const ensureProfile = useAction(api.authLink.ensureAccountProfile);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    void ensureProfile({})
      .then((result) => {
        if (active && !result.linked) setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [ensureProfile, attempt]);
  return (
    <GateShell
      title={failed ? "Couldn’t open your profile" : "Opening Capsule…"}
    >
      <p role="status" className="text-ink-2">
        {failed
          ? "Your sign-in is saved. We couldn’t load your Capsule account. Try again without signing out."
          : "Loading your account and workspace."}
      </p>
      {failed && (
        <button
          className="btn btn-primary mt-4 min-h-11"
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Try again
        </button>
      )}
    </GateShell>
  );
}
