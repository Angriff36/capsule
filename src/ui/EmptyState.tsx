import type { ReactNode } from "react";
import { CheckIcon } from "./icons";

/** One row of the "next steps" list under an empty state. */
export interface EmptyStateStep {
  label: string;
  /** Already true in the data. Shows an ok check and muted text. */
  done?: boolean;
  /** Button or link that does this step; shown on the right while open. */
  action?: ReactNode;
}

/**
 * Empty state — variant B, "Next steps list" (owner pick in the component
 * picker, 2026-09-29). Left-aligned: a bold title line, the hint, then — when
 * the page knows them from its data — the numbered steps that would fill this
 * space. Pass `steps` only for steps the data actually shows; never invent
 * them.
 */
export function EmptyState({
  title,
  hint,
  action,
  steps,
}: {
  title: string;
  hint?: string;
  /** Optional CTA(s) answering "so what do I do now?" — buttons or links. */
  action?: ReactNode;
  /** Numbered next steps, in order; done ones show a check. */
  steps?: EmptyStateStep[];
}) {
  return (
    <div className="grid gap-3 px-4 py-6 text-left">
      <div>
        <p className="text-xl leading-snug font-bold tracking-tight text-balance text-ink">
          {title}
        </p>
        {hint ? <p className="mt-1 text-sm text-ink-2">{hint}</p> : null}
      </div>
      {steps && steps.length > 0 ? (
        <ol className="grid">
          {steps.map((step, index) => (
            <li
              key={`${index}-${step.label}`}
              className={`flex min-h-11 items-center gap-3 border-t border-line py-2.5 text-base ${
                step.done ? "text-ink-3" : "text-ink"
              }`}
            >
              <span
                className={`w-5 shrink-0 font-mono text-sm ${
                  step.done ? "text-ok" : "text-ink-3"
                }`}
              >
                {step.done ? (
                  <>
                    <CheckIcon className="block" />
                    <span className="sr-only">Done:</span>
                  </>
                ) : (
                  index + 1
                )}
              </span>
              <span className="min-w-0 flex-1">{step.label}</span>
              {!step.done && step.action ? (
                <span className="ml-auto shrink-0">{step.action}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {action ? (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
