import { type FormEvent, type ReactNode } from "react";
import type { Doc } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  AlertTriangleIcon,
  BoxIcon,
  FileTextIcon,
  UsersIcon,
} from "../../ui/icons";
import { StatusChip } from "../../ui/primitives";

export type IncidentActionKind = "resolve" | "dismiss" | "closeCorrective";

const SEVERITY_CHIP: Record<string, string> = {
  low: "border-info/30 bg-info-soft text-info",
  medium: "border-warn/30 bg-warn-soft text-warn",
  high: "border-danger/30 bg-danger-soft text-danger",
  critical: "border-danger bg-danger text-on-brand",
};

const CATEGORY_ICON: Record<
  string,
  (props: { className?: string }) => ReactNode
> = {
  food_safety: AlertTriangleIcon,
  allergen: AlertTriangleIcon,
  injury: AlertTriangleIcon,
  equipment: BoxIcon,
  service: UsersIcon,
  other: FileTextIcon,
};

const ACTION_LABEL: Record<IncidentActionKind, string> = {
  resolve: "Resolution",
  dismiss: "Dismissal reason",
  closeCorrective: "Resolution notes",
};

/** One incident in the event incident log, with its corrective action. */
export function EventIncidentCard({
  incident,
  corrective,
  busy,
  activeAction,
  onInvestigate,
  onSelectAction,
  onSubmitAction,
}: {
  incident: Doc<"incidents">;
  corrective?: Doc<"correctiveActions">;
  busy: boolean;
  activeAction: IncidentActionKind | null;
  onInvestigate: () => void;
  onSelectAction: (kind: IncidentActionKind | null) => void;
  onSubmitAction: (kind: IncidentActionKind, value: string) => void;
}) {
  const severity = String(incident.severity);
  const category = String(incident.category);
  const Icon = CATEGORY_ICON[category] ?? FileTextIcon;
  const locked = incident.correctiveActionRequired === true;
  const openIncident =
    incident.status === "open" || incident.status === "investigating";

  return (
    <article className="card px-4 py-3.5" data-testid="event-incident-card">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 gap-3">
          <span
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-line bg-inset text-ink-2"
            aria-hidden="true"
          >
            <Icon />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg leading-none text-ink">
                {formatStatusLabel(category)}
              </h3>
              <span
                className={`chip ${SEVERITY_CHIP[severity] ?? "border-line-2 bg-inset text-ink-2"}`}
              >
                {formatStatusLabel(severity)} severity
              </span>
              <StatusChip status={incident.status} />
              {locked ? (
                <span className="chip border-warn/30 bg-warn-soft text-warn">
                  Locked — corrective action open
                </span>
              ) : null}
            </div>
            <p className="mt-1 font-mono text-2xs text-ink-3">
              {formatDate(incident.reportedAt)} ·{" "}
              {formatTime(incident.reportedAt)}
            </p>
            <p className="mt-1.5 text-base leading-snug text-ink-2">
              {incident.description}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {incident.status === "open" ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={onInvestigate}
            >
              Investigate
            </button>
          ) : null}
          {corrective && corrective.status === "open" ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => onSelectAction("closeCorrective")}
            >
              Close corrective action
            </button>
          ) : null}
          {openIncident ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy || locked}
              title={
                locked
                  ? "Locked until the corrective action is closed"
                  : undefined
              }
              onClick={() => onSelectAction("resolve")}
            >
              Resolve
            </button>
          ) : null}
          {openIncident ? (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy || locked}
              title={
                locked
                  ? "Locked until the corrective action is closed"
                  : undefined
              }
              onClick={() => onSelectAction("dismiss")}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      </div>

      {incident.resolution ? (
        <div className="mt-3 rounded-sm border border-ok/40 bg-ok-soft px-3 py-2.5">
          <p className="text-sm font-bold tracking-[0.06em] text-ok uppercase">
            Resolution
          </p>
          <p className="mt-1 text-base text-ink">{incident.resolution}</p>
          {incident.resolvedAt ? (
            <p className="mt-1 font-mono text-2xs text-ink-3">
              {formatDate(incident.resolvedAt)} ·{" "}
              {formatTime(incident.resolvedAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      {incident.dismissalReason ? (
        <div className="mt-3 rounded-sm border border-line-2 bg-inset px-3 py-2.5">
          <p className="text-sm font-bold tracking-[0.06em] text-ink-2 uppercase">
            Dismissed
          </p>
          <p className="mt-1 text-base text-ink-2">
            {incident.dismissalReason}
          </p>
        </div>
      ) : null}

      {corrective ? (
        <div
          className={`mt-3 rounded-sm border px-3 py-2.5 ${
            corrective.status === "open"
              ? "border-warn/40 bg-warn-soft"
              : "border-line bg-inset"
          }`}
        >
          <p
            className={`text-sm font-bold tracking-[0.06em] uppercase ${
              corrective.status === "open" ? "text-warn" : "text-ink-2"
            }`}
          >
            Corrective action · {formatStatusLabel(String(corrective.status))}
          </p>
          <p className="mt-1 text-base text-ink-2">{corrective.description}</p>
          {corrective.resolutionNotes ? (
            <p className="mt-1 text-base text-ink-2">
              {corrective.resolutionNotes}
            </p>
          ) : null}
        </div>
      ) : null}

      {activeAction ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const value = String(
              new FormData(event.currentTarget).get("value") ?? "",
            ).trim();
            if (!value) return;
            onSubmitAction(activeAction, value);
          }}
        >
          <label className="field-label min-w-0 flex-1 basis-48">
            {ACTION_LABEL[activeAction]}
            <input name="value" className="input" required autoFocus />
          </label>
          <button className="btn btn-primary btn-sm" disabled={busy}>
            Confirm
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onSelectAction(null)}
          >
            Cancel
          </button>
        </form>
      ) : null}
    </article>
  );
}
