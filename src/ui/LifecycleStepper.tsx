import { useEffect, useRef } from "react";
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
  blocked = [],
  busy = false,
  onAction,
}: {
  definition: LifecycleDefinition;
  status: string;
  actions: readonly LifecycleAction[];
  /** Moves the lifecycle allows from here but the record cannot make yet. */
  blocked?: readonly { key: string; reason: string }[];
  busy?: boolean;
  onAction?: (key: string) => void;
}) {
  const blockedActions = definition.actions.flatMap((action) => {
    const entry = blocked.find((item) => item.key === action.key);
    return entry && !actions.some((item) => item.key === action.key)
      ? [{ ...action, disabledReason: entry.reason }]
      : [];
  });
  const model = buildLifecycleModel(
    { ...definition, actions: [...actions, ...blockedActions] },
    status,
  );
  // A narrow box scrolls the steps; bring the current one into view (a
  // closed-out event otherwise showed only its first stages).
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const reveal = () => {
      const step = section
        .querySelector('[aria-current="step"]')
        ?.closest(".lifecycle-step");
      if (!step) return;
      const box = section.getBoundingClientRect();
      const rect = step.getBoundingClientRect();
      if (rect.right > box.right) section.scrollLeft += rect.right - box.right;
      else if (rect.left < box.left) section.scrollLeft -= box.left - rect.left;
    };
    reveal();
    if (typeof ResizeObserver === "undefined") return;
    // In a closed dialog the box has no size yet; reveal once it shows.
    const observer = new ResizeObserver(reveal);
    observer.observe(section);
    return () => observer.disconnect();
  }, [status]);
  const renderAction = (action: LifecycleAction, className: string) => {
    const reasonId = action.disabledReason
      ? `lifecycle-reason-${action.key}`
      : undefined;
    return (
      <span className="lifecycle-action" key={action.key}>
        <button
          type="button"
          className={className}
          disabled={busy || action.disabledReason != null}
          aria-describedby={reasonId}
          title={action.disabledReason}
          onClick={() => onAction?.(action.key)}
        >
          {action.label}
          {action.needsInput ? "…" : ""}
        </button>
        {action.disabledReason ? (
          <span className="lifecycle-action-reason" id={reasonId}>
            {action.disabledReason}
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <section
      ref={sectionRef}
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
            {node.actions.map((action) =>
              renderAction(
                action,
                "btn btn-ghost btn-sm lifecycle-step-action",
              ),
            )}
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
          {model.otherActions.map((action) =>
            renderAction(
              action,
              `btn btn-sm ${
                definition.sideStates.includes(action.to)
                  ? "btn-danger"
                  : "btn-ghost"
              }`,
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
