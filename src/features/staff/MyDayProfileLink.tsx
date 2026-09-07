import { useAction } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

/** A staff association is not a second login. Only the server can establish it. */
export function MyDayProfileLink({
  hasLinkedProfile,
  canManage,
}: {
  hasLinkedProfile: boolean;
  canManage: boolean;
}) {
  const linkSelf = useAction(api.authLink.linkSelfByEmail);
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
    linking: "Connecting your existing sign-in to your staff profile…",
    already:
      "Your staff profile is linked. Waiting for your staff records to update…",
    matched:
      "Your staff profile is linked. Waiting for your staff records to update…",
    no_match:
      "No staff profile matches your verified sign-in email. Your app access still works; My Day needs the staff record that owns your shifts and time.",
    released:
      "Your staff link was removed. A workspace administrator can restore the correct account link; signing in again will not repair it.",
    ambiguous:
      "Your account matches more than one staff record. The account link needs to be corrected in this workspace.",
    not_configured:
      "The staff-link service is not configured. Your existing app session is still valid.",
    provider_error:
      "The staff link could not be checked because the sign-in service is unavailable. Try again without signing out.",
    error:
      "The staff link could not be checked. Try again without signing out.",
    no_email:
      "Your account has no primary email for matching your existing staff record.",
    email_unverified:
      "Verify your account’s primary email so it can be matched to your staff record.",
    unauthenticated:
      "Your session could not be confirmed. Wait for the app to refresh it, then try again.",
    needs_admin_link:
      "A workspace administrator needs to connect your existing account to your staff record.",
  };
  return (
    <section className="card px-4 py-4">
      <h2 className="text-lg font-semibold">You’re signed in</h2>
      <p role="status" className="mt-2 text-base leading-relaxed text-ink-2">
        {hasLinkedProfile
          ? "Your account has a staff link, but that staff record is unavailable in this workspace. Your app access is unchanged; the account link needs to be checked."
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
            Check staff link
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
          Your manager can correct your staff record in Team roles. You do not
          need another sign-in.
        </p>
      )}
    </section>
  );
}
