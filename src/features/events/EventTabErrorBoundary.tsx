import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  tabLabel: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Keeps Event detail usable when one tab's Convex surface is out of sync
 * (e.g. regenerated client hooks before `convex dev` has pushed queries).
 */
export class EventTabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Event tab "${this.props.tabLabel}" failed`, error, info);
  }

  render() {
    if (this.state.error) {
      const message = this.state.error.message || "Unknown error";
      const needsConvexSync =
        /Could not find public function|queries:|mutations:/i.test(message);
      return (
        <div
          className="rounded-xs border border-warn/40 bg-warn-soft/40 px-3 py-3"
          role="alert"
          data-testid="event-tab-error"
        >
          <p className="text-lg font-semibold text-ink">
            {this.props.tabLabel} could not load
          </p>
          <p className="mt-1 text-base text-ink-2">
            {needsConvexSync
              ? "This tab is newer than the live app behind it. Reload the page. If it still fails, ask the office to update Capsule."
              : "Something on this tab failed. Try again. If it keeps failing, reload the page."}
          </p>
          <button
            type="button"
            className="btn btn-ghost mt-3"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
