import { formatStatusLabel } from "../lib/statusLabels";
import type {
  LifecycleAction,
  LifecycleDefinition,
} from "../lib/lifecycle/lifecycleModel";
import { buildLifecycleModel } from "../lib/lifecycle/lifecycleModel";

export function LifecycleStepper({
  definition,
  status,
  actions,
  busy = false,
  onAction,
}: {
  definition: LifecycleDefinition;
  status: string;
  actions: readonly LifecycleAction[];
  busy?: boolean;
  onAction?: (key: string) => void;
}) {
  const model = buildLifecycleModel({ ...definition, actions }, status);

  return (
    <section
      className="lifecycle-stepper"
      aria-label={model.label}
      data-testid="lifecycle-stepper"
    >
      <div className="lifecycle-stepper-track" role="list">
        {model.nodes.map((node) => (
          <div
            className={`lifecycle-step lifecycle-step-${node.kind}`}
            role="listitem"
            key={node.state}
          >
            <span className="lifecycle-step-dot" aria-hidden="true">
              {node.kind === "completed" ? "✓" : null}
            </span>
            <span
              className="lifecycle-step-label"
              aria-current={node.kind === "current" ? "step" : undefined}
            >
              {formatStatusLabel(node.state)}
            </span>
            {node.actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="btn btn-ghost btn-sm lifecycle-step-action"
                disabled={busy}
                onClick={() => onAction?.(action.key)}
              >
                {action.label}
                {action.needsInput ? "…" : ""}
              </button>
            ))}
          </div>
        ))}
      </div>
      {model.isSideState ? (
        <p className="lifecycle-stepper-branch">
          This record is {formatStatusLabel(status)}.
        </p>
      ) : null}
      {model.isUnknown ? (
        <p className="lifecycle-stepper-branch" role="status">
          Current status is {formatStatusLabel(status)} and is not mapped in
          this lifecycle yet.
        </p>
      ) : null}
      {model.otherActions.length ? (
        <div
          className="lifecycle-stepper-branches"
          aria-label="Other available moves"
        >
          {model.otherActions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`btn btn-sm ${
                definition.sideStates.includes(action.to)
                  ? "btn-danger"
                  : "btn-ghost"
              }`}
              disabled={busy}
              onClick={() => onAction?.(action.key)}
            >
              {action.label}
              {action.needsInput ? "…" : ""}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
