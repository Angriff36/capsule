import { Component, type ReactNode } from "react";

/**
 * If the wording/layout queries are not on this backend yet, keep the rest
 * of the app on screen instead of taking every signed-in page down.
 */
export class StudioErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.warn("Edit app data did not load; the tab stays on.", error);
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
