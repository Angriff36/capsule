import type { ReactNode } from "react";

type Props = {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
};

/** Form group tile matching Photo Gallery category cards (panel + border). */
export function EventFormCluster({ title, hint, children }: Props) {
  return (
    <div className="rounded-sm border border-line-2 bg-panel p-3">
      <p className="text-base font-semibold text-ink">{title}</p>
      {hint ? (
        <p className="mt-0.5 text-xs leading-snug text-ink-3">{hint}</p>
      ) : null}
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}
