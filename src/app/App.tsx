import { Component, lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { EventCreatePage } from "../features/events/EventCreatePage";
import { EventDetailPage } from "../features/events/EventDetailPage";
import { EventsListPage } from "../features/events/EventsListPage";
import { HomePage } from "../features/home/HomePage";
import { EventMenuPage } from "../features/kitchen/EventMenuPage";
import { KitchenCatalogPage } from "../features/kitchen/KitchenCatalogPage";
import { RecipeDetailPage } from "../features/kitchen/RecipeDetailPage";
import { ErrorState, TableSkeleton } from "../ui/primitives";
import { AuthGate } from "./AuthGate";
import { NAV_AREAS } from "./nav";
import { PlannedAreaPage } from "./PlannedAreaPage";
import { AppShell } from "./shell/AppShell";

const DemandLedgerPage = lazy(() =>
  import("../features/inventory/DemandLedgerPage").then((module) => ({
    default: module.DemandLedgerPage,
  })),
);
const StockBookPage = lazy(() =>
  import("../features/inventory/StockBookPage").then((module) => ({
    default: module.StockBookPage,
  })),
);
const PurchasingPage = lazy(() =>
  import("../features/inventory/PurchasingPage").then((module) => ({
    default: module.PurchasingPage,
  })),
);
const VendorOrderPage = lazy(() =>
  import("../features/inventory/VendorOrderPage").then((module) => ({
    default: module.VendorOrderPage,
  })),
);
const PrepBoardPage = lazy(() =>
  import("../features/production/PrepBoardPage").then((module) => ({
    default: module.PrepBoardPage,
  })),
);

function SupplyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<TableSkeleton rows={8} />}>{children}</Suspense>;
}

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
      <AuthGate>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="/events" element={<EventsListPage />} />
            <Route path="/events/new" element={<EventCreatePage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route
              path="/kitchen"
              element={<Navigate to="/kitchen/recipes" replace />}
            />
            <Route
              path="/kitchen/recipes"
              element={<KitchenCatalogPage section="recipes" />}
            />
            <Route path="/kitchen/recipes/:id" element={<RecipeDetailPage />} />
            <Route
              path="/kitchen/ingredients"
              element={<KitchenCatalogPage section="ingredients" />}
            />
            <Route
              path="/kitchen/dishes"
              element={<KitchenCatalogPage section="dishes" />}
            />
            <Route
              path="/kitchen/menus"
              element={<KitchenCatalogPage section="menus" />}
            />
            <Route path="/kitchen/event-menu" element={<EventMenuPage />} />
            <Route
              path="/kitchen/prep"
              element={
                <SupplyRoute>
                  <PrepBoardPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/inventory"
              element={<Navigate to="/inventory/demand" replace />}
            />
            <Route
              path="/inventory/demand"
              element={
                <SupplyRoute>
                  <DemandLedgerPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/inventory/stock"
              element={
                <SupplyRoute>
                  <StockBookPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/inventory/purchasing"
              element={
                <SupplyRoute>
                  <PurchasingPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/inventory/orders/:id"
              element={
                <SupplyRoute>
                  <VendorOrderPage />
                </SupplyRoute>
              }
            />
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
      </AuthGate>
    </AppErrorBoundary>
  );
}
