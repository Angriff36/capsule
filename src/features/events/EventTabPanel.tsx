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
    <section
      className="rounded-sm border border-line-2 bg-inset p-3 sm:p-4"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="mt-1 text-[15px] font-semibold text-ink">{title}</h3>
          {description ? (
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-ink-2">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
