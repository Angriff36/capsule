import { useAction } from "convex/react";
import { useEffect } from "react";
import { api } from "../../lib/api";

/** While Feedback is open, pick up GitHub tickets Claude already finished. */
export function useFeedbackGithubSync(enabled: boolean) {
  const sync = useAction(api.pageFeedback.syncFromGithub);
  useEffect(() => {
    if (!enabled) return;
    void sync({});
    const timer = window.setInterval(() => {
      void sync({});
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [enabled, sync]);
}
