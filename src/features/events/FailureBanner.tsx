import type { CommandFailure } from "./CommandFailure";

export function FailureBanner({ failure }: { failure: CommandFailure }) {
  return (
    <div
      role="alert"
      data-failure-category={failure.category}
      className="card border-danger/40 bg-danger-soft/40 px-3 py-3"
    >
      <p className="text-[12.5px] font-semibold text-danger">{failure.title}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
        {failure.detail}
      </p>
    </div>
  );
}
