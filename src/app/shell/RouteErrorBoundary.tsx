import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ErrorState } from "../../ui/primitives";

/**
 * Last-resort failure state for unexpected render errors. Missing/invalid
 * record links are handled at the page seam (see src/lib/routeRecord.ts),
 * not here — this boundary makes no guess about WHY a page threw.
 * Raw messages leak internal query names and request ids — dev builds only.
 */
function RouteRenderFailureState({ error }: { error: Error }) {
  const detail = import.meta.env.DEV
    ? error.message
    : "Something went wrong loading this screen. Try again, and if it keeps failing let an admin know.";
  return (
    <div className="mx-auto mt-16 max-w-120">
      <ErrorState
        title="This screen failed to load"
        detail={detail}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}

interface RouteErrorCatcherProps {
  /** Changes on navigation; an armed boundary clears so the next page renders. */
  resetKey: string;
  children: ReactNode;
}

class RouteErrorCatcher extends Component<
  RouteErrorCatcherProps,
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prevProps: RouteErrorCatcherProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <RouteRenderFailureState error={error} />;
  }
}

/**
 * Catches render errors from routed pages while keeping the app shell
 * (sidebar, topbar) alive, and resets when the user navigates away.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <RouteErrorCatcher resetKey={location.pathname}>
      {children}
    </RouteErrorCatcher>
  );
}
