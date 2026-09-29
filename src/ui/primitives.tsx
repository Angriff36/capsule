import type { ReactNode } from "react";
import { type EventStage, STAGE_LABEL } from "../features/events/eventStatus";
import { formatStatusLabel, statusChipClass } from "../lib/statusLabels";
import { ChevronDownIcon } from "./icons";
import { useDismissibleMenu } from "./useDismissibleMenu";

const STAGE_CHIP: Record<EventStage, string> = {
  quote: "chip-tone-mute",
  planning: "chip-tone-mute",
  pending_approval: "chip-tone-warn",
  approved: "chip-tone-ok",
  sales_lock: "chip-tone-brand chip-icon-lock",
  executing: "chip-tone-info",
  final: "chip-tone-info",
  completed: "chip-tone-info",
  cancelled: "chip-tone-danger",
  closed_out: "chip-tone-mute",
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
    "chip-tone-mute";
  return (
    <span className={`chip ${cls}`}>
      {children ?? label ?? known ?? formatStatusLabel(status)}
    </span>
  );
}

export type PageHeaderFact = { label: string; value: ReactNode };

/**
 * Page header — "Editorial masthead" (owner pick 2026-09-29, component picker
 * variant B): uppercase eyebrow, a large tight DM Sans title, then an optional
 * row of facts on a strong ink rule, with the actions under it. Wrap the state
 * word of an eyebrow in <b> to set it in accent.
 *
 * `size="compact"` is the one-line working bar for cramped frames (narrow
 * phone-first shells, sheets, sidebars): smaller title, actions beside it.
 */
export function PageHeader({
  title,
  lead,
  actions,
  eyebrow,
  facts,
  size = "default",
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  facts?: PageHeaderFact[];
  size?: "default" | "compact";
}) {
  const eyebrowLine = eyebrow ? (
    <p className="text-sm font-bold tracking-[0.09em] text-ink-3 uppercase [&_b]:font-bold [&_b]:text-accent">
      {eyebrow}
    </p>
  ) : null;

  if (size === "compact") {
    return (
      <header className="page-header flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
        <div className="min-w-0">
          {eyebrowLine}
          <h1 className="font-display text-2xl leading-tight font-bold tracking-tight text-balance text-ink">
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

  const shownFacts = facts?.filter((fact) => fact.value != null) ?? [];
  return (
    <header className="page-header min-w-0">
      {eyebrowLine}
      <h1
        className={`font-display text-4xl leading-[0.95] font-bold tracking-[-0.045em] text-balance break-words text-ink lg:text-5xl ${eyebrow ? "mt-2.5" : ""}`}
      >
        {title}
      </h1>
      {lead ? (
        <p className="mt-3 max-w-[72ch] text-base text-ink-2">{lead}</p>
      ) : null}
      {shownFacts.length > 0 ? (
        <dl className="mt-5 grid grid-cols-2 gap-x-7 gap-y-3.5 border-t-[1.5px] border-ink pt-3 sm:flex sm:flex-wrap">
          {shownFacts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-sm font-bold tracking-[0.04em] text-ink-3 uppercase">
                {fact.label}
              </dt>
              <dd className="mt-0.5 text-base break-words text-ink tabular-nums">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div aria-hidden="true" className="mt-5 border-t-[1.5px] border-ink" />
      )}
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>
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
