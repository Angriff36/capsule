import type { ReactNode } from "react";

type Props = {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
};

/** Editable section: white card, titled header, form body with its own Save. */
export function EventFormCluster({ title, hint, children }: Props) {
  return (
    <div className="card flex flex-col">
      <div className="border-b border-line px-4 py-3">
        <p className="text-base font-semibold text-ink">{title}</p>
        {hint ? <p className="mt-0.5 text-sm text-ink-2">{hint}</p> : null}
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </div>
  );
}
