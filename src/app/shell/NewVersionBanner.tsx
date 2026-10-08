import { useEffect, useState } from "react";
import { reloadKeepingDrafts } from "../../ui/unsavedDrafts";
import {
  fetchLiveBuild,
  newerBuild,
  RUNNING_BUILD,
  shortCommit,
} from "./newVersion";

/** How often an open tab asks which version is live. */
const CHECK_EVERY_MS = 10 * 60_000;

/**
 * PL-STALE-ASSETS (AC-166): an open tab learns that a newer Capsule is live
 * (on a timer, and each time the tab comes back into view) and says so with
 * both version numbers. Reloading writes every unsaved form draft first, so
 * nothing typed is lost. It never calls this page current: with no answer
 * from the site it says nothing.
 *
 * A tab nobody is looking at reloads by itself once a newer version is out
 * (drafts kept): an old tab left open keeps running the old version's
 * server reads, and on 2026-10-08 forgotten tabs still asked for whole
 * tables after the release that removed those reads, holding the live
 * server up for everyone. A tab in view keeps the banner and reloads the
 * next time it goes to the background.
 */
export function NewVersionBanner({
  running = RUNNING_BUILD,
  checkLive = fetchLiveBuild,
}: {
  running?: string | null;
  checkLive?: () => Promise<string | null>;
}) {
  const [newer, setNewer] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return; // a local build has no version to compare
    let stopped = false;
    let found: string | null = null;
    const reloadIfAway = () => {
      if (found && document.visibilityState === "hidden") reloadKeepingDrafts();
    };
    const check = () => {
      void checkLive().then((live) => {
        if (stopped) return;
        found = newerBuild(running, live);
        setNewer(found);
        reloadIfAway();
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
      else reloadIfAway();
    };
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
    };
  }, [running, checkLive]);

  if (!running || !newer) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-info/30 bg-info-soft px-4 py-1.5 text-sm text-info"
    >
      <span className="font-medium">A newer version of Capsule is out.</span>
      <span>
        This page is version {shortCommit(running)}; the newest is{" "}
        {shortCommit(newer)}. Reload when ready. Anything you typed in a form is
        kept.
      </span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={reloadKeepingDrafts}
      >
        Reload now
      </button>
    </div>
  );
}
