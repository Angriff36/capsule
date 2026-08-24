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
 * Shared event-tab surface matching Field photos / Documents chrome:
 * inset panel, eyebrow, title, short description, then content.
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
    <section className="card" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-inset px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <span className="text-xs text-ink-2" aria-label={eyebrow}>
            {description ?? eyebrow}
          </span>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
