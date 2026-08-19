import { Component, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { EmptyState, ErrorState } from "../../ui/primitives";

/**
 * Errors thrown by generated single-record Convex queries (getEvent,
 * getInvoice, …) when the URL carries a malformed or wrong-table id.
 * Production redacts the details to "Server Error" but keeps the
 * "[CONVEX Q(queries:getX)]" tag; development surfaces the raw
 * ArgumentValidationError instead. Match either shape.
 */
const RECORD_LOOKUP_ERROR =
  /\[CONVEX Q\(queries:get[A-Z]|ArgumentValidationError/;

interface SectionHome {
  segment: string;
  label: string;
  to: string;
}

const SECTION_HOMES: readonly SectionHome[] = [
  { segment: "events", label: "Back to events", to: "/events" },
  { segment: "kitchen", label: "Back to kitchen", to: "/kitchen" },
  { segment: "inventory", label: "Back to inventory", to: "/inventory" },
  { segment: "staff", label: "Back to staff", to: "/staff" },
  { segment: "logistics", label: "Back to logistics", to: "/logistics" },
  { segment: "finance", label: "Back to finance", to: "/finance" },
  { segment: "reports", label: "Back to reports", to: "/reports" },
  { segment: "clients", label: "Back to clients", to: "/clients" },
  { segment: "facilities", label: "Back to facilities", to: "/facilities" },
  { segment: "admin", label: "Back to admin", to: "/admin" },
];

const HOME_FALLBACK: SectionHome = {
  segment: "",
  label: "Back to home",
  to: "/",
};

function sectionHomeFor(pathname: string): SectionHome {
  const segment = pathname.split("/").filter(Boolean)[0];
  return (
    SECTION_HOMES.find((home) => home.segment === segment) ?? HOME_FALLBACK
  );
}

function RecordNotFoundState({ pathname }: { pathname: string }) {
  const home = sectionHomeFor(pathname);
  return (
    <div className="mx-auto mt-16 max-w-120">
      <div className="card px-4 py-6">
        <EmptyState
          title="Not found"
          hint="This link points to a record that doesn't exist. It may have been deleted, or the address may be mistyped."
          action={
            <Link className="btn btn-ghost btn-sm" to={home.to}>
              {home.label}
            </Link>
          }
        />
      </div>
    </div>
  );
}

function RouteRenderFailureState({ error }: { error: Error }) {
  // Raw messages leak internal query names and request ids — dev builds only.
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
    if (RECORD_LOOKUP_ERROR.test(error.message)) {
      return <RecordNotFoundState pathname={this.props.resetKey} />;
    }
    return <RouteRenderFailureState error={error} />;
  }
}

/**
 * Catches render errors from routed pages while keeping the app shell
 * (sidebar, topbar) alive. Bad record links — e.g. /events/does-not-exist,
 * where the generated Convex query rejects the malformed id — render an
 * in-app "Not found" state instead of unmounting the whole app.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <RouteErrorCatcher resetKey={location.pathname}>
      {children}
    </RouteErrorCatcher>
  );
}
