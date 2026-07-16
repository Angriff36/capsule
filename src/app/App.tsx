import { Component, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { EventsRoutePlaceholder } from "../features/events/EventsRoutePlaceholder";
import { HomePage } from "../features/home/HomePage";
import { KitchenRoutePlaceholder } from "../features/kitchen/KitchenRoutePlaceholder";
import { ErrorState } from "../ui/primitives";
import { NAV_AREAS } from "./nav";
import { PlannedAreaPage } from "./PlannedAreaPage";
import { AppShell } from "./shell/AppShell";

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto mt-16 max-w-120">
          <ErrorState
            title="Something went wrong"
            detail={this.state.error.message}
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="/events" element={<EventsRoutePlaceholder />} />
          <Route path="/events/new" element={<EventsRoutePlaceholder />} />
          <Route path="/events/:id" element={<EventsRoutePlaceholder />} />
          <Route path="/kitchen" element={<KitchenRoutePlaceholder />} />
          {NAV_AREAS.filter((a) => a.planned).map((a) => (
            <Route key={a.path} path={a.path} element={<PlannedAreaPage />} />
          ))}
          <Route
            path="*"
            element={
              <ErrorState
                title="Page not found"
                detail="The address does not match any Capsule screen."
              />
            }
          />
        </Route>
      </Routes>
    </AppErrorBoundary>
  );
}
