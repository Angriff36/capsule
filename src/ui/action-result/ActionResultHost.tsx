import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircleIcon, XCircleIcon, XIcon } from "../icons";
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
  // DESIGN.md result notice (owner pick 2026-09-29): success is a neutral box
  // whose icon carries the state; a failure blocks work, so its border, icon,
  // and text all take the danger color.
  const Icon = ok ? CheckCircleIcon : XCircleIcon;
  return (
    <div className="shrink-0 px-4 pt-3">
      <div
        className={`flex min-h-11 items-center gap-2.5 rounded-md border px-3 py-2 ${
          ok
            ? "border-line bg-panel text-ink"
            : "border-danger bg-danger-soft text-danger"
        }`}
      >
        <Icon
          width={16}
          height={16}
          aria-hidden="true"
          className={`shrink-0 ${ok ? "text-ok" : ""}`}
        />
        <output
          aria-live={ok ? "polite" : "assertive"}
          className="min-w-0 flex-1 text-base leading-snug"
          role={ok ? "status" : "alert"}
        >
          {result.message}
          {result.links?.length ? (
            <span className="ml-2 inline-flex flex-wrap gap-x-3">
              {result.links.map((link) => (
                <Link
                  key={`${link.href}:${link.label}`}
                  to={link.href}
                  className="font-semibold text-accent underline-offset-2 hover:underline"
                  onClick={() => ActionResultStore.shared.dismiss()}
                >
                  {link.label}
                </Link>
              ))}
            </span>
          ) : null}
        </output>
        <button
          type="button"
          className={`-my-1 -mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xs hover:bg-inset ${
            ok ? "text-ink-3 hover:text-ink" : "text-danger"
          }`}
          onClick={() => ActionResultStore.shared.dismiss()}
          aria-label="Dismiss result"
        >
          <XIcon width={13} height={13} />
        </button>
      </div>
    </div>
  );
}
