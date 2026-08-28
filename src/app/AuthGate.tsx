import {
  OrganizationSwitcher,
  SignIn,
  SignOutButton,
  useOrganization,
  useOrganizationList,
  useUser,
} from "@clerk/react";
import {
  Authenticated,
  AuthLoading,
  AuthRefreshing,
  Unauthenticated,
  useAction,
  useQuery,
} from "convex/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
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
    return <MembershipRequired />;
  }
  return <>{children}</>;
}

function SignInScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6 py-10">
      <div className="flex flex-col items-center gap-6">
        <CapsuleWordmark />
        <SignIn
          withSignUp={false}
          fallbackRedirectUrl="/"
          forceRedirectUrl="/"
        />
        <p className="max-w-90 text-center text-xs leading-relaxed text-ink-3">
          Use the sign-in email you received when you were hired. Ask your
          manager to send another one if you need it.
        </p>
      </div>
    </div>
  );
}

type LinkOutcome =
  | "linking"
  | "already"
  | "matched"
  | "unauthenticated"
  | "not_configured"
  | "provider_error"
  | "no_email"
  | "email_unverified"
  | "no_match"
  | "ambiguous"
  | "released"
  | "needs_admin_link"
  | "error";

/**
 * Signed in, but no tenant/role yet. First try to link this sign-in to the
 * Person that carries the same verified email (convex/authLink.ts). When that
 * works the auth-status query re-renders and the app opens on its own. When it
 * cannot, say exactly why and what the manager must do — no identity-provider
 * screens, no ids to paste.
 */
function MembershipRequired() {
  const { user } = useUser();
  const { organization } = useOrganization();
  // Legacy org-based sign-ins (no linked Person yet) that have memberships
  // but no active organization still need a way to pick one. Selecting a
  // workspace must actually setActive so the JWT tenant hint reaches the
  // self-link pick — the Clerk popover alone was a no-op on an already-
  // displayed org while the gate stayed up.
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: false, pageSize: 10 },
  });
  const memberships = userMemberships?.data ?? [];
  const hasOrgMemberships = memberships.length > 0;
  const activeOrgId = organization?.id ?? "";
  // Display only — the server re-reads the verified email from the provider.
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const linkSelf = useAction(api.authLink.linkSelfByEmail);
  const [outcome, setOutcome] = useState<LinkOutcome>("linking");
  const attempt = useCallback(() => {
    setOutcome("linking");
    linkSelf({})
      .then((result) => setOutcome(result.reason))
      .catch(() => setOutcome("error"));
  }, [linkSelf]);
  useEffect(() => {
    attempt();
  }, [attempt, activeOrgId]);

  const openWorkspace = useCallback(
    async (organizationId: string) => {
      setOutcome("linking");
      try {
        await setActive?.({ organization: organizationId });
      } catch {
        // setActive failed — still try the email pick so the gate can clear.
      }
      attempt();
    },
    [attempt, setActive],
  );

  const who = email ? (
    <>
      You are signed in as <span className="font-mono">{email}</span>.
    </>
  ) : (
    "You are signed in."
  );
  const copy: Record<LinkOutcome, string> = {
    linking: "Matching your sign-in to your staff profile…",
    already: "Your profile is linked. Opening Capsule…",
    matched: "Your profile is linked. Opening Capsule…",
    unauthenticated: "Your session ended. Sign in again.",
    not_configured:
      "Self-link is not set up on this deployment yet (CLERK_SECRET_KEY). Ask your manager to link your account under Team roles.",
    provider_error:
      "The sign-in service could not be reached to confirm your email. Tap Try again in a moment.",
    no_email:
      "Your sign-in has no email address, so it cannot be matched to a staff profile. Sign in with an email or Google account.",
    email_unverified:
      "Your email is not verified yet. Check your inbox for the verification message, then tap Try again.",
    no_match:
      "No staff profile uses this email yet. Ask your manager to add you under Administration → Permissions → Team roles with this exact email, then tap Try again.",
    ambiguous:
      "More than one staff profile uses this email. Open the workspace you want, or tap Try again — Capsule will use the admin profile if one exists, otherwise the oldest live profile.",
    released:
      "An admin unlinked this sign-in from your staff profile. Ask them to link it again under Administration → Permissions → Team roles.",
    needs_admin_link:
      "Ask your manager to email you a sign-in from Administration → Permissions → Team roles.",
    error: "The link could not be checked. Tap Try again.",
  };

  return (
    <GateShell title="One more step">
      <p className="leading-relaxed text-ink-2">
        {who} {copy[outcome]}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-11"
          disabled={outcome === "linking"}
          onClick={attempt}
        >
          Try again
        </button>
        <SignOutButton>
          <button type="button" className="btn btn-ghost min-h-11">
            Sign out
          </button>
        </SignOutButton>
      </div>
      {hasOrgMemberships ? (
        <div className="mt-4 flex flex-col gap-3">
          <span className="text-sm text-ink-3">
            Or open the workspace your account already belongs to:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {memberships.map((membership) => {
              const orgId = membership.organization.id;
              const role = String(membership.role ?? "").replace(/^org:/, "");
              const selected = orgId === activeOrgId;
              return (
                <button
                  key={orgId}
                  type="button"
                  className={
                    selected
                      ? "btn btn-primary min-h-11"
                      : "btn btn-ghost min-h-11"
                  }
                  disabled={outcome === "linking"}
                  onClick={() => void openWorkspace(orgId)}
                >
                  {membership.organization.name}
                  {role ? ` / ${role}` : ""}
                </button>
              );
            })}
          </div>
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" />
        </div>
      ) : null}
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
