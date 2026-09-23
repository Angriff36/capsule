import { Component, type ErrorInfo, type ReactNode } from "react";
import { setWorkingEvent } from "./workingEvent";

type Props = {
  /** What the wrapped shell piece is, for the console line. */
  label: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
  /**
   * The armed error already used its recovery pass, so a bad-id throw on
   * the post-clear remount escalates. Cleared again as soon as a recovery
   * renders cleanly, so the next crafted id gets its own recovery.
   */
  spent: boolean;
};

/**
 * The server is the authority on a working-event id: a crafted or stale
 * `?event=` link that passes the client plausibility gate but fails the
 * server's v.id check makes the generated getEvent hook throw
 * ArgumentValidationError while the top-bar chip or the report rail renders,
 * and both live OUTSIDE the route boundary — the throw would blank the whole
 * app. This boundary catches exactly that validation throw, drops the bad
 * working event, and lets the piece render its empty state. The recovery is
 * per incident, not per shell lifetime: once a recovery has rendered cleanly
 * the boundary re-arms, so any later crafted id gets its own recovery. Only
 * a post-clear remount that throws the same validation again escalates to
 * the app boundary — and by then the recovery pass has already cleared the
 * stored id. Any other error rethrows to the app boundary with the working
 * event untouched.
 */
export class WorkingEventErrorBoundary extends Component<Props, State> {
  private alive = true;
  state: State = { error: null, spent: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Working event ${this.props.label} failed`, error, info);
    if (!isBadWorkingEventIdError(error) || this.state.spent) return;
    // React re-renders this boundary BEFORE componentDidCatch runs, so the
    // recovery pass must not render the children again: render() returns
    // null while the error is armed. Clearing the id removes the only
    // outside input these pieces read, and the microtask disarm right after
    // brings the children back in their empty state.
    setWorkingEvent(null);
    queueMicrotask(() => {
      if (!this.alive) return;
      this.setState({ error: null, spent: true });
    });
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    // A clean render after a recovery means the piece is healthy again:
    // re-arm so the next crafted id recovers instead of escalating.
    if (
      prevState.error !== null &&
      this.state.error === null &&
      this.state.spent
    ) {
      this.setState({ spent: false });
    }
  }

  componentWillUnmount() {
    this.alive = false;
  }

  render() {
    const { error, spent } = this.state;
    if (!error) return this.props.children;
    // A non-id error, or a bad-id throw that came back on the post-clear
    // remount, escalates to the app boundary. On that second path the
    // recovery pass has already dropped the bad id from the store.
    if (!isBadWorkingEventIdError(error) || spent) throw error;
    // Bad id with the recovery still armed: render nothing this pass while
    // componentDidCatch clears the id and disarms on a microtask.
    return null;
  }
}

/**
 * The generated get-by-id hooks are the only thing in the chip and the rail
 * that read the working-event id, and the only way they can fail it is the
 * server's argument validation (the same signature CommandFailure parses).
 */
function isBadWorkingEventIdError(error: Error): boolean {
  return /ArgumentValidationError/i.test(error.message);
}
