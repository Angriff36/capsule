export function SupplyFailureBanner({ error }: { error: unknown }) {
  const message =
    error instanceof Error
      ? error.message
      : "The generated command was rejected.";
  const conflict = /ConcurrencyConflict|VERSION_MISMATCH/i.test(message);
  const denied = /may (?:read|write|execute)|permission|unauthorized/i.test(
    message,
  );
  return (
    <div className="card border-danger/40 px-4 py-3" role="alert">
      <p className="font-semibold text-danger">
        {conflict
          ? "This record changed elsewhere"
          : denied
            ? "Your role cannot apply this command"
            : "Command not applied"}
      </p>
      <p className="mt-1 text-[12px] text-ink-2">
        {conflict
          ? "Reload the record before trying again."
          : message.replace(/^Error:\s*/, "")}
      </p>
    </div>
  );
}
