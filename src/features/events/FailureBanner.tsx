import type { CommandFailure } from "./CommandFailure";

export function FailureBanner({
  failure,
  onDismiss,
}: {
  failure: CommandFailure;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      data-failure-category={failure.category}
      className="card border-danger/40 bg-danger-soft/40 px-3 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-danger">{failure.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-2">
            {failure.detail}
          </p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            ✕
          </button>
        ) : null}
      </div>
      {failure.action?.reload ? (
        <button
          type="button"
          className="btn btn-ghost mt-2 text-sm"
          onClick={() => window.location.reload()}
        >
          {failure.action.label}
        </button>
      ) : null}
    </div>
  );
}
