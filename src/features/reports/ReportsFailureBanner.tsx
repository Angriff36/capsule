export function ReportsFailureBanner({ error }: { error: unknown }) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "The report command failed.";
  return (
    <div className="banner banner-danger mt-3" role="alert">
      <strong>Could not update that report definition.</strong>
      <p className="mt-1 text-[13px]">{message}</p>
    </div>
  );
}
