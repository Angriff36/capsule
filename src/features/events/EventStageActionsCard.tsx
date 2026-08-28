import { CheckCircleIcon, XCircleIcon } from "../../ui/icons";
import { UndoIcon } from "./eventDetailIcons";
import type {
  EventLifecycleAction,
  EventLifecycleActionKey,
} from "./EventLifecyclePolicy";
import { EventOverviewCard } from "./EventOverviewCard";

const BUTTON_CLASS: Record<EventLifecycleAction["kind"], string> = {
  primary: "btn btn-primary",
  ghost: "btn btn-ghost",
  danger: "btn btn-danger",
};

function ActionIcon({ kind }: { readonly kind: EventLifecycleAction["kind"] }) {
  if (kind === "primary") return <CheckCircleIcon width={14} height={14} />;
  if (kind === "danger") return <XCircleIcon width={14} height={14} />;
  return <UndoIcon width={14} height={14} />;
}

/** The stage moves this event can make right now, straight from the policy. */
export function EventStageActionsCard({
  actions,
  busy,
  onAction,
}: {
  readonly actions: readonly EventLifecycleAction[];
  readonly busy: boolean;
  readonly onAction: (key: EventLifecycleActionKey) => void;
}) {
  return (
    <EventOverviewCard title="Stage actions" testId="event-stage-actions">
      {actions.length === 0 ? (
        <p className="text-sm text-ink-2">
          No stage moves are available from here.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={busy}
              onClick={() => onAction(action.key)}
              className={BUTTON_CLASS[action.kind]}
            >
              <ActionIcon kind={action.kind} />
              {action.label}
            </button>
          ))}
        </div>
      )}
    </EventOverviewCard>
  );
}
