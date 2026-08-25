import type { ReactNode } from "react";

type Props = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly testId?: string;
};

/**
 * Shared event-tab surface: a white elevated section with a titled header.
 * `eyebrow` is kept for the accessible name; the visible header is title +
 * one line of context.
 */
export function EventTabPanel({
  eyebrow,
  title,
  description,
  actions,
  children,
  testId,
}: Props) {
  return (
    <section className="card" data-testid={testId} aria-label={eyebrow}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-2">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
