import { ErrorState, Skeleton } from "./primitives";

interface QueryLoadStateProps {
  title?: string;
  detail?: string;
  loadingTooLong: boolean;
  onRetry?: () => void;
}

/** Shared skeleton + slow-load ErrorState for detail/list query waits. */
export function QueryLoadState({
  title = "Still loading",
  detail = "This is taking longer than it should. Check your internet connection, then try again.",
  loadingTooLong,
  onRetry = () => window.location.reload(),
}: QueryLoadStateProps) {
  if (loadingTooLong) {
    return <ErrorState title={title} detail={detail} onRetry={onRetry} />;
  }
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-96 max-w-full" />
      <Skeleton className="h-24" />
      <Skeleton className="h-64" />
    </div>
  );
}
