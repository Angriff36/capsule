import type { ReactNode } from "react";
import { type EventStage, STAGE_LABEL } from "../features/events/eventStatus";

const STAGE_CHIP: Record<EventStage, string> = {
  planning: "border-line-2 bg-mute-soft text-ink-2",
  pending_approval: "border-warn/30 bg-warn-soft text-warn",
  approved: "border-ok/30 bg-ok-soft text-ok",
  executing: "border-info/30 bg-info-soft text-info",
  completed: "border-info/30 bg-info-soft text-info",
  cancelled: "border-danger/30 bg-danger-soft text-danger",
  closed_out: "border-line-2 bg-inset text-ink-3",
};

export function StatusChip({ status }: { status: string }) {
  const known = (STAGE_LABEL as Record<string, string>)[status];
  const cls =
    (STAGE_CHIP as Record<string, string>)[status] ??
    "border-line-2 bg-inset text-ink-2";
  return <span className={`chip ${cls}`}>{known ?? status}</span>;
}

export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
        {lead ? <p className="mt-0.5 text-ink-2">{lead}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function Section({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase">
          {title}
          {count != null && (
            <span className="ml-1.5 font-mono text-ink-3 normal-case">
              {count}
            </span>
          )}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="font-medium text-ink-2">{title}</p>
      {hint ? <p className="mt-1 text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card border-danger/40 px-4 py-6 text-center" role="alert">
      <p className="font-semibold text-danger">{title}</p>
      {detail ? <p className="mt-1 text-[12px] text-ink-2">{detail}</p> : null}
      {onRetry ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3"
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xs bg-inset ${className}`}
      aria-hidden="true"
    />
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6" />
      ))}
    </div>
  );
}
