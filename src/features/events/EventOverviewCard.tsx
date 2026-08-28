import type { ReactNode } from "react";

/**
 * The overview surface: a titled panel with an optional right-hand slot for a
 * chip or an inline action. Lighter than `EventTabPanel` on purpose — the
 * overview stacks many short cards, so each header stays one line.
 */
export function EventOverviewCard({
  title,
  aside,
  children,
  testId,
}: {
  readonly title: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  return (
    <section className="card p-5" data-testid={testId} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
