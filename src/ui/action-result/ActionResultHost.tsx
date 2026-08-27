import { useEffect, useState } from "react";
import { XIcon } from "../icons";
import { ActionResultStore, type ActionResult } from "./ActionResultStore";

/**
 * Always-visible result strip. Lives above the scrolling workspace so a
 * hire, email, save, or failure is still on screen after the click.
 */
export function ActionResultHost() {
  const [result, setResult] = useState<ActionResult | null>(() =>
    ActionResultStore.shared.current(),
  );

  useEffect(() => ActionResultStore.shared.subscribe(setResult), []);

  if (!result) return null;

  const ok = result.kind === "ok";
  return (
    <div
      className={`shrink-0 border-b px-4 py-2 ${
        ok ? "border-ok/30 bg-ok-soft" : "border-danger/30 bg-danger-soft"
      }`}
    >
      <div className="flex items-start gap-3">
        <output
          aria-live={ok ? "polite" : "assertive"}
          className={`min-w-0 flex-1 text-base leading-snug ${
            ok ? "text-ok" : "text-danger"
          }`}
          role={ok ? "status" : "alert"}
        >
          {result.message}
        </output>
        <button
          type="button"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xs text-ink-3 hover:bg-panel hover:text-ink"
          onClick={() => ActionResultStore.shared.dismiss()}
          aria-label="Dismiss result"
        >
          <XIcon width={13} height={13} />
        </button>
      </div>
    </div>
  );
}
