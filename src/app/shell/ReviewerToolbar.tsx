import { useEffect } from "react";
import { useAuthStatus } from "../../lib/useAuthStatus";

/** Capsule roles that review the live site with Vercel Comments. */
const REVIEWER_ROLES = new Set(["owner", "admin"]);

/**
 * The Vercel Toolbar (Comments) on the live site for reviewers, without the
 * browser extension (@vercel/toolbar, mounted conditionally as Vercel's
 * production docs advise). It renders inside the staff sign-in gate and only
 * for an owner or admin, so customers on the portal, shared proposal, quote
 * and menu pages never load it or see a Vercel login prompt. Production
 * builds only: local dev has no Vercel project to talk to.
 */
export function ReviewerToolbar() {
  const status = useAuthStatus();
  const reviewer =
    import.meta.env.PROD && REVIEWER_ROLES.has(String(status?.role ?? ""));
  useEffect(() => {
    if (!reviewer) return;
    let unmount: (() => void) | undefined;
    let cancelled = false;
    void import("@vercel/toolbar/vite").then(({ mountVercelToolbar }) => {
      if (!cancelled) unmount = mountVercelToolbar();
    });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, [reviewer]);
  return null;
}
