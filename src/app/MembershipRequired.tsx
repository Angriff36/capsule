import {
  OrganizationSwitcher,
  SignOutButton,
  useOrganization,
  useOrganizationList,
  useSession,
  useUser,
} from "@clerk/react";
import { useAction } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { waitForSessionTenantClaim } from "./auth/sessionTenantClaim";
import { GateShell } from "./GateShell";

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
export function MembershipRequired() {
  const { user } = useUser();
  const { session } = useSession();
  const { organization } = useOrganization();
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: false, pageSize: 10 },
  });
  const memberships = userMemberships?.data ?? [];
  const hasOrgMemberships = memberships.length > 0;
  const activeOrgId = organization?.id ?? "";
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const linkSelf = useAction(api.authLink.ensureAccountProfile);
  const [outcome, setOutcome] = useState<LinkOutcome>("linking");
  const attempt = useCallback(() => {
    setOutcome("linking");
    linkSelf({})
      .then((result) => setOutcome(result.reason))
      .catch(() => setOutcome("error"));
  }, [linkSelf]);
  const readSessionToken = useCallback(async () => {
    if (!session) return null;
    return await session.getToken({ skipCache: true });
  }, [session]);
  useEffect(() => {
    if (!activeOrgId) {
      attempt();
      return;
    }
    let cancelled = false;
    void waitForSessionTenantClaim({
      organizationId: activeOrgId,
      getToken: readSessionToken,
    }).then((ready) => {
      if (!cancelled && ready) attempt();
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, activeOrgId, readSessionToken]);

  const openWorkspace = useCallback(
    async (organizationId: string) => {
      setOutcome("linking");
      if (!setActive) {
        setOutcome("error");
        return;
      }
      try {
        await setActive({ organization: organizationId });
      } catch {
        setOutcome("error");
        return;
      }
      const jwtReady = await waitForSessionTenantClaim({
        organizationId,
        getToken: readSessionToken,
      });
      if (!jwtReady) {
        setOutcome("error");
        return;
      }
      attempt();
    },
    [attempt, setActive, readSessionToken],
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
      "More than one staff profile uses this email. Open the workspace you want, then tap Try again if it does not open on its own.",
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
