import { classifyCommandFailure } from "../events/CommandFailure";

export function LogisticsFailureBanner({ error }: { error: unknown }) {
  const failure = classifyCommandFailure(error);
  return (
    <div
      className="card border-danger/40 px-4 py-3"
      role="alert"
      data-failure-category={failure.category}
    >
      <p className="font-semibold text-danger">{failure.title}</p>
      <p className="mt-1 text-[12px] text-ink-2">{failure.detail}</p>
    </div>
  );
}
