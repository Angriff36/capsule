import type { ReactNode } from "react";
import { type EventStage, STAGE_LABEL } from "../features/events/eventStatus";
import { formatStatusLabel, statusChipClass } from "../lib/statusLabels";
import { ChevronDownIcon } from "./icons";
import { useDismissibleMenu } from "./useDismissibleMenu";

const STAGE_CHIP: Record<EventStage, string> = {
  quote: "border-line-2 bg-mute-soft text-ink-2",
  planning: "border-line-2 bg-mute-soft text-ink-2",
  pending_approval: "border-warn/30 bg-warn-soft text-warn",
  approved: "border-ok/30 bg-ok-soft text-ok",
  sales_lock: "border-brand/30 bg-brand-soft text-brand",
  executing: "border-info/30 bg-info-soft text-info",
  final: "border-info/30 bg-info-soft text-info",
  completed: "border-info/30 bg-info-soft text-info",
  cancelled: "border-danger/30 bg-danger-soft text-danger",
  closed_out: "border-line-2 bg-inset text-ink-3",
};

export function StatusChip({
  status,
  label,
  color,
  children,
}: {
  status: string;
  label?: string;
  color?: string;
  children?: ReactNode;
}) {
  const known = (STAGE_LABEL as Record<string, string>)[status];
  const cls =
    color ??
    (STAGE_CHIP as Record<string, string>)[status] ??
    statusChipClass(status) ??
    "border-line-2 bg-inset text-ink-2";
  return (
    <span className={`chip ${cls}`}>
      {children ?? label ?? known ?? formatStatusLabel(status)}
    </span>
  );
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
    <header className="page-header flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl leading-none tracking-tight text-ink">
          {title}
        </h1>
        {lead ? <p className="mt-0.5 text-sm text-ink-2">{lead}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/**
 * "More ▾" overflow for secondary and destructive actions. Children are the
 * menu items (buttons or links); give destructive ones `action-menu-danger`
 * and put an <ActionMenuRule /> before them.
 */
export function ActionMenu({
  label = "More",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const menuRef = useDismissibleMenu({ closeOnSelect: true });
  return (
    <details ref={menuRef} className="action-menu">
      <summary className="btn btn-ghost">
        {label}
        <ChevronDownIcon width={12} height={12} />
      </summary>
      <div className="action-menu-list" role="menu">
        {children}
      </div>
    </details>
  );
}

export function ActionMenuRule() {
  return <div className="action-menu-rule" role="separator" />;
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
      <div className="flex h-9 items-center justify-between border-b border-line bg-inset px-3">
        <h2 className="text-sm font-semibold text-ink">
          {title}
          {count != null && (
            <span className="ml-1.5 font-mono text-xs font-medium text-ink-2">
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

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  /** Optional CTA(s) answering "so what do I do now?" — buttons or links. */
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="font-medium text-ink-2">{title}</p>
      {hint ? <p className="mt-1 text-sm text-ink-3">{hint}</p> : null}
      {action ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
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
      {detail ? <p className="mt-1 text-sm text-ink-2">{detail}</p> : null}
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

export function TableSkeleton({
  rows = 6,
  columns = 1,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="space-y-2 p-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({ length: columns }, (_, j) => (
            <Skeleton key={j} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}
