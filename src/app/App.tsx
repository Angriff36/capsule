import { Component, lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { EventCreatePage } from "../features/events/EventCreatePage";
import { EventDetailPage } from "../features/events/EventDetailPage";
import { EventsListPage } from "../features/events/EventsListPage";
import { HomePage } from "../features/home/HomePage";
import { EventMenuPage } from "../features/kitchen/EventMenuPage";
import { DishDetailPage } from "../features/kitchen/DishDetailPage";
import { IngredientDetailPage } from "../features/kitchen/IngredientDetailPage";
import { RecipeImportPage } from "../features/kitchen/import/RecipeImportPage";
import { KitchenCatalogPage } from "../features/kitchen/KitchenCatalogPage";
import { MenuDetailPage } from "../features/kitchen/MenuDetailPage";
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
const RosterPage = lazy(() =>
  import("../features/workforce/RosterPage").then((module) => ({
    default: module.RosterPage,
  })),
);
const TimeSheetPage = lazy(() =>
  import("../features/workforce/TimeSheetPage").then((module) => ({
    default: module.TimeSheetPage,
  })),
);
const QualificationsPage = lazy(() =>
  import("../features/workforce/QualificationsPage").then((module) => ({
    default: module.QualificationsPage,
  })),
);
const PackListsPage = lazy(() =>
  import("../features/logistics/PackListsPage").then((module) => ({
    default: module.PackListsPage,
  })),
);
const PackListDetailPage = lazy(() =>
  import("../features/logistics/PackListDetailPage").then((module) => ({
    default: module.PackListDetailPage,
  })),
);
const DeliveriesPage = lazy(() =>
  import("../features/logistics/DeliveriesPage").then((module) => ({
    default: module.DeliveriesPage,
  })),
);
const InvoicesPage = lazy(() =>
  import("../features/finance/InvoicesPage").then((module) => ({
    default: module.InvoicesPage,
  })),
);
const InvoiceDetailPage = lazy(() =>
  import("../features/finance/InvoiceDetailPage").then((module) => ({
    default: module.InvoiceDetailPage,
  })),
);
const PaymentsPage = lazy(() =>
  import("../features/finance/PaymentsPage").then((module) => ({
    default: module.PaymentsPage,
  })),
);
const PaymentMethodsPage = lazy(() =>
  import("../features/finance/PaymentMethodsPage").then((module) => ({
    default: module.PaymentMethodsPage,
  })),
);
const CloseoutPage = lazy(() =>
  import("../features/finance/CloseoutPage").then((module) => ({
    default: module.CloseoutPage,
  })),
);
const PayrollPage = lazy(() =>
  import("../features/finance/PayrollPage").then((module) => ({
    default: module.PayrollPage,
  })),
);
const ReportsPage = lazy(() =>
  import("../features/reports/ReportsPage").then((module) => ({
    default: module.ReportsPage,
  })),
);
const ClientsPage = lazy(() =>
  import("../features/clients/ClientsPage").then((module) => ({
    default: module.ClientsPage,
  })),
);
const ClientDetailPage = lazy(() =>
  import("../features/clients/ClientDetailPage").then((module) => ({
    default: module.ClientDetailPage,
  })),
);
const ProposalsPage = lazy(() =>
  import("../features/clients/ProposalsPage").then((module) => ({
    default: module.ProposalsPage,
  })),
);
const ContractsPage = lazy(() =>
  import("../features/clients/ContractsPage").then((module) => ({
    default: module.ContractsPage,
  })),
);
const PermissionsPage = lazy(() =>
  import("../features/admin/PermissionsPage").then((module) => ({
    default: module.PermissionsPage,
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
            title="This screen failed to render"
            detail={
              this.state.error.message ||
              "Reload the page. If it keeps failing, check the browser console for the component stack."
            }
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
            <Route
              path="/kitchen/recipes/import"
              element={<RecipeImportPage />}
            />
            <Route path="/kitchen/recipes/:id" element={<RecipeDetailPage />} />
            <Route
              path="/kitchen/ingredients/:id"
              element={<IngredientDetailPage />}
            />
            <Route path="/kitchen/dishes/:id" element={<DishDetailPage />} />
            <Route path="/kitchen/menus/:id" element={<MenuDetailPage />} />
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
            <Route
              path="/staff"
              element={<Navigate to="/staff/roster" replace />}
            />
            <Route
              path="/staff/roster"
              element={
                <SupplyRoute>
                  <RosterPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/staff/time"
              element={
                <SupplyRoute>
                  <TimeSheetPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/staff/qualifications"
              element={
                <SupplyRoute>
                  <QualificationsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/logistics"
              element={<Navigate to="/logistics/packs" replace />}
            />
            <Route
              path="/logistics/packs"
              element={
                <SupplyRoute>
                  <PackListsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/logistics/packs/:id"
              element={
                <SupplyRoute>
                  <PackListDetailPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/logistics/deliveries"
              element={
                <SupplyRoute>
                  <DeliveriesPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance"
              element={<Navigate to="/finance/invoices" replace />}
            />
            <Route
              path="/finance/invoices"
              element={
                <SupplyRoute>
                  <InvoicesPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/invoices/:id"
              element={
                <SupplyRoute>
                  <InvoiceDetailPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/payments"
              element={
                <SupplyRoute>
                  <PaymentsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/payment-methods"
              element={
                <SupplyRoute>
                  <PaymentMethodsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/closeout"
              element={
                <SupplyRoute>
                  <CloseoutPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/payroll"
              element={
                <SupplyRoute>
                  <PayrollPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <SupplyRoute>
                  <ReportsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/clients"
              element={
                <SupplyRoute>
                  <ClientsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/clients/proposals"
              element={
                <SupplyRoute>
                  <ProposalsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/clients/contracts"
              element={
                <SupplyRoute>
                  <ContractsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/clients/:id"
              element={
                <SupplyRoute>
                  <ClientDetailPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <SupplyRoute>
                  <PermissionsPage />
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
