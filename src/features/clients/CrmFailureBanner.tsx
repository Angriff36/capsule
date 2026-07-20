export function CrmFailureBanner({ error }: { error: unknown }) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "The CRM command failed.";
  return (
    <div className="banner banner-danger mt-3" role="alert">
      <strong>Could not complete that sales action.</strong>
      <p className="mt-1 text-[13px]">{message}</p>
    </div>
  );
}
