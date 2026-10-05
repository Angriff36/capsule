import { useUser } from "@clerk/react";
import { useAction, useQuery } from "convex/react";
import { type ReactNode, useEffect } from "react";
import { api } from "../lib/api";
import {
  OfflineAuthProvider,
  OfflineReadOnlyBanner,
} from "../lib/offlineAuthContext";
import {
  offlineAuthRestorePolicy,
  offlineAuthSnapshotStore,
  type StoredAuthStatus,
} from "../lib/offlineAuthSnapshot";
import {
  type AuthStatusSnapshot,
  workspaceMembershipPolicy,
} from "./auth/WorkspaceMembershipPolicy";
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
    // The server says this sign-in has no workspace now (switched off or
    // removed): the old saved access must not reopen the app offline.
    if (!workspaceMembershipPolicy.isReady(live as AuthStatusSnapshot)) {
      offlineAuthSnapshotStore.forget(user.id);
      return;
    }
    if (!live.personId || !live.tenantId) {
      // A new organization must not retain the previous organization's offline access.
      offlineAuthSnapshotStore.forget(user.id);
      return;
    }
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
        <p className="text-ink-2">Checking which workspace you belong to.</p>
      </GateShell>
    );
  }
  if (!workspaceMembershipPolicy.isReady(status as AuthStatusSnapshot)) {
    return <MembershipRequired />;
  }
  if (!status.personId) {
    // The backend has confirmed workspace membership and role. A staff profile
    // is needed for personal workflows, not for entering an empty organization.
    return (
      <>
        <BackgroundProfileSetup key={`${user?.id}:${status.tenantId}`} />
        {children}
      </>
    );
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

function BackgroundProfileSetup() {
  const ensureProfile = useAction(api.authLink.ensureAccountProfile);
  useEffect(() => {
    void ensureProfile({})
      .then((result) => {
        if (!result.linked)
          console.warn("Capsule staff profile setup:", result.reason);
      })
      .catch(() => {
        console.warn("Capsule staff profile setup is unavailable.");
      });
  }, [ensureProfile]);
  return null;
}
