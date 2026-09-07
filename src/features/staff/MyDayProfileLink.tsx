import { useAction } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

/** Recovery only; AuthGate normally loads the account before this page opens. */
export function MyDayProfileLink({
  hasLinkedProfile,
  canManage,
}: {
  hasLinkedProfile: boolean;
  canManage: boolean;
}) {
  const linkSelf = useAction(api.authLink.ensureAccountProfile);
  const [outcome, setOutcome] = useState("linking");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (hasLinkedProfile) return;
    let active = true;
    setOutcome("linking");
    void linkSelf({})
      .then((result) => {
        if (active) setOutcome(result.reason);
      })
      .catch(() => {
        if (active) setOutcome("error");
      });
    return () => {
      active = false;
    };
  }, [hasLinkedProfile, linkSelf, attempt]);
  const messages: Record<string, string> = {
    linking: "Opening your Capsule profile…",
    already: "Your Capsule profile is ready. Loading your records…",
    matched: "Your Capsule profile is ready. Loading your records…",
    no_match:
      "Your account does not have workspace access yet. Imported staff records do not grant account access.",
    released:
      "Access to this workspace was removed. Contact your workspace administrator to restore access.",
    ambiguous:
      "Your workspace could not be resolved. Open the workspace you want to use.",
    not_configured:
      "Account setup is unavailable. Your sign-in is saved; the service needs to be restored.",
    provider_error:
      "Your account could not be checked because the sign-in service is unavailable. Try again without signing out.",
    error: "Your account could not be checked. Try again without signing out.",
    no_email: "Your sign-in account needs a primary email address.",
    email_unverified: "Verify your sign-in account’s primary email address.",
    unauthenticated:
      "Your session could not be confirmed. Wait for the app to refresh it, then try again.",
    needs_admin_link:
      "Your account needs workspace access. Contact your workspace administrator.",
  };
  return (
    <section className="card px-4 py-4">
      <h2 className="text-lg font-semibold">You’re signed in</h2>
      <p role="status" className="mt-2 text-base leading-relaxed text-ink-2">
        {hasLinkedProfile
          ? "Your Capsule profile is temporarily unavailable in this workspace. Your sign-in is saved."
          : (messages[outcome] ?? messages.error)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!hasLinkedProfile && (
          <button
            type="button"
            className="btn btn-primary min-h-11"
            disabled={outcome === "linking"}
            onClick={retry}
          >
            Try again
          </button>
        )}
        <Link className="btn btn-ghost min-h-11" to="/">
          Continue to full app
        </Link>
        {canManage && (
          <Link className="btn btn-ghost min-h-11" to="/admin">
            Manage team accounts
          </Link>
        )}
      </div>
      {!canManage && outcome !== "linking" && (
        <p className="mt-3 text-base text-ink-2">
          You do not need another sign-in or a different profile.
        </p>
      )}
    </section>
  );
}
