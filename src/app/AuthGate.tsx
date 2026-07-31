import {
  OrganizationSwitcher,
  SignIn,
  SignOutButton,
  useOrganization,
} from "@clerk/react";
import {
  Authenticated,
  AuthLoading,
  AuthRefreshing,
  Unauthenticated,
  useQuery,
} from "convex/react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import {
  type AuthStatusSnapshot,
  workspaceMembershipPolicy,
} from "./auth/WorkspaceMembershipPolicy";

/** True once VITE_CLERK_PUBLISHABLE_KEY exists in the (uncommitted) local env. */
export function isAuthConfigured(
  env: Record<string, unknown> = import.meta.env,
): boolean {
  return Boolean(env.VITE_CLERK_PUBLISHABLE_KEY);
}

export function AuthGate({ children }: { children?: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <GateShell title="Checking your session…">
          <p className="text-ink-2">Signing you in.</p>
        </GateShell>
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
    </>
  );
}

function ClaimGate({ children }: { children?: ReactNode }) {
  const status = useQuery(api.authStatus.getAuthStatus, {});
  if (status === undefined) {
    return (
      <GateShell title="Loading workspace…">
        <p className="text-ink-2">Confirming your workspace membership.</p>
      </GateShell>
    );
  }
  if (!workspaceMembershipPolicy.isReady(status as AuthStatusSnapshot)) {
    return (
      <MembershipRequired
        hasRole={status.hasRole}
        hasTenant={status.hasTenant}
      />
    );
  }
  return <>{children}</>;
}

function SignInScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6 py-10">
      <div className="flex flex-col items-center gap-6">
        <CapsuleWordmark />
        <SignIn />
        <p className="max-w-90 text-center text-xs leading-relaxed text-ink-3">
          Operations access is granted by your workspace administrator. Signing
          in does not create a workspace.
        </p>
      </div>
    </div>
  );
}

function MembershipRequired({
  hasRole,
  hasTenant,
}: {
  hasRole: boolean;
  hasTenant: boolean;
}) {
  const { organization } = useOrganization();
  const missing = workspaceMembershipPolicy.missingRequirements({
    authenticated: true,
    hasRole,
    hasTenant,
  });
  return (
    <GateShell title="Workspace membership setup required">
      <p className="leading-relaxed text-ink-2">
        You are signed in, but your account has not been given {missing} yet, so
        Capsule keeps everything locked. Choose or create your workspace below.
        If it still won't unlock, ask whoever set up your sign-in to add the{" "}
        <code className="font-mono">role</code> and{" "}
        <code className="font-mono">tenantId</code> details to your account.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
        />
        {organization ? (
          <span className="text-sm text-ink-3">
            Active org: <span className="font-mono">{organization.id}</span>
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <SignOutButton>
          <button type="button" className="btn btn-ghost">
            Sign out
          </button>
        </SignOutButton>
        <span className="text-sm text-ink-3">
          Setup reference for your technician:{" "}
          <span className="font-mono">
            {`{"role":"{{org.role}}","tenantId":"{{org.id}}"}`}
          </span>
        </span>
      </div>
    </GateShell>
  );
}

export function AuthSetupRequired() {
  return (
    <GateShell title="Authentication setup required">
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
          Convex deployment (
          <code className="font-mono">npx convex env set</code>).
        </li>
        <li>
          Confirm the Clerk application has the Convex integration enabled and
          session-token claims <code className="font-mono">role</code> and{" "}
          <code className="font-mono">tenantId</code>.
        </li>
      </ol>
    </GateShell>
  );
}

function GateShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6">
      <div className="card max-w-130 px-6 py-6">
        <CapsuleWordmark />
        <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function CapsuleWordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 place-items-center rounded-xs bg-accent font-mono text-sm font-bold text-white">
        C
      </span>
      <span className="text-base font-semibold tracking-[0.14em] uppercase">
        Capsule
      </span>
    </div>
  );
}
