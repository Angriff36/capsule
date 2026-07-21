export function FinanceFailureBanner({ error }: { error: unknown }) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "The finance command failed.";
  return (
    <div className="banner banner-danger mt-3" role="alert">
      <strong>Could not complete that billing action.</strong>
      <p className="mt-1 text-[13px]">{message}</p>
    </div>
  );
}
