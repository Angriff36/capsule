import type { ReactNode } from "react";
import { registerStudioRenderer } from "../features/studio/StudioCatalog";
import { StudioCatalogGate } from "../features/studio/StudioCatalogGate";
import {
  studioSlotKey,
  studioSlotProps,
  studioText,
} from "../features/studio/StudioSlot";
import { type EventStage, STAGE_LABEL } from "../features/events/eventStatus";
import { formatStatusLabel, statusChipClass } from "../lib/statusLabels";

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
  // Only a tone class may override (DESIGN.md status chips carry a state icon
  // per tone); an old background/text class override falls back to the tone
  // for the status, so no chip shows state by colour alone.
  const tone = color?.startsWith("chip-tone-") ? color : undefined;
  const cls =
    tone ??
    (STAGE_CHIP as Record<string, string>)[status] ??
    statusChipClass(status) ??
    "chip-tone-mute";
  const title =
    studioText(children) || label || known || formatStatusLabel(status);
  const slotKey = studioSlotKey("chip", title);
  return (
    <StudioCatalogGate
      kind="chip"
      name="StatusChip"
      slotKey={slotKey}
      model={{ title }}
    >
      <span
        className={`chip ${cls}`}
        {...studioSlotProps("chip", "StatusChip", slotKey)}
      >
        {children ?? label ?? known ?? formatStatusLabel(status)}
      </span>
    </StudioCatalogGate>
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
  const titleText = studioText(title);
  const slotKey = studioSlotKey("masthead", titleText);
  // Buttons, facts, an eyebrow or rich title/lead: the stand-in drops them.
  const live =
    actions != null ||
    eyebrow != null ||
    (facts?.length ?? 0) > 0 ||
    typeof title !== "string" ||
    (lead != null && typeof lead !== "string");
  const gate = (node: ReactNode) => (
    <StudioCatalogGate
      kind="masthead"
      name="PageHeader"
      slotKey={slotKey}
      model={{ title: titleText, lead: studioText(lead) }}
      live={live}
    >
      {node}
    </StudioCatalogGate>
  );
  const slot = studioSlotProps("masthead", "PageHeader", slotKey, live);
  const eyebrowLine = eyebrow ? (
    <p className="text-sm font-bold tracking-[0.09em] text-ink-3 uppercase [&_b]:font-bold [&_b]:text-accent">
      {eyebrow}
    </p>
  ) : null;

  if (size === "compact") {
    return gate(
      <header
        className="page-header flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-3"
        {...slot}
      >
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
      </header>,
    );
  }

  const shownFacts = facts?.filter((fact) => fact.value != null) ?? [];
  return gate(
    <header className="page-header min-w-0" {...slot}>
      {/* Title on the left, the page's actions level with it on the right
          (as on Events and Home); on a phone the actions drop below. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          {eyebrowLine}
          <h1
            className={`font-display text-4xl leading-[0.95] font-bold tracking-[-0.045em] text-balance break-words text-ink lg:text-5xl ${eyebrow ? "mt-2.5" : ""}`}
          >
            {title}
          </h1>
          {lead ? (
            <p className="mt-3 max-w-[72ch] text-base text-ink-2">{lead}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
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
    </header>,
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
  const slotKey = studioSlotKey("section", title);
  return (
    <StudioCatalogGate
      kind="section"
      name="Section"
      slotKey={slotKey}
      model={{ title }}
    >
      <section
        className="card"
        {...studioSlotProps("section", "Section", slotKey)}
      >
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-inset px-3 py-0.5">
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
    </StudioCatalogGate>
  );
}

export { EmptyState, type EmptyStateStep } from "./EmptyState";

export function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  const slotKey = studioSlotKey("error", title);
  return (
    <StudioCatalogGate
      kind="error"
      name="ErrorState"
      slotKey={slotKey}
      model={{ title, lead: detail }}
      live={onRetry != null}
    >
      <div
        className="card border-danger/40 px-4 py-6 text-center"
        role="alert"
        {...studioSlotProps("error", "ErrorState", slotKey, onRetry != null)}
      >
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
    </StudioCatalogGate>
  );
}

registerStudioRenderer("PageHeader", (model) => (
  <PageHeader title={model.title} lead={model.lead} />
));
registerStudioRenderer("StatusChip", (model) => (
  <StatusChip status="planning" label={model.title} />
));
registerStudioRenderer("Section", (model) => (
  <Section title={model.title}>{model.lead ?? null}</Section>
));
registerStudioRenderer("ErrorState", (model) => (
  <ErrorState title={model.title} detail={model.lead} />
));

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xs bg-line ${className}`}
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
