import { Component, lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useMatch } from "react-router-dom";
import { ClientPortalPage } from "../features/clientPortal/ClientPortalPage";
import { ProposalAcceptancePage } from "../features/clients/ProposalAcceptancePage";
import { SharedProposalPage } from "../features/clients/SharedProposalPage";
import { QuoteSubmissionPage } from "../features/sales/QuoteSubmissionPage";
import { EventAllergenBriefingPage } from "../features/events/EventAllergenBriefingPage";
import { EventCapacityPlannerPage } from "../features/events/EventCapacityPlannerPage";
import { EventCreatePage } from "../features/events/EventCreatePage";
import { EventDetailPage } from "../features/events/EventDetailPage";
import { EventsListPage } from "../features/events/EventsListPage";
import { EventTemplatesPage } from "../features/events/EventTemplatesPage";
import { HomePage } from "../features/home/HomePage";
import { AllergenMatrixPage } from "../features/kitchen/AllergenMatrixPage";
import { DishDetailPage } from "../features/kitchen/DishDetailPage";
import { IngredientDetailPage } from "../features/kitchen/IngredientDetailPage";
import { RecipeImportPage } from "../features/kitchen/import/RecipeImportPage";
import { KitchenCatalogPage } from "../features/kitchen/KitchenCatalogPage";
import { KitchenDashboardPage } from "../features/kitchen/KitchenDashboardPage";
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
const StockCountPage = lazy(() =>
  import("../features/inventory/StockCountPage").then((module) => ({
    default: module.StockCountPage,
  })),
);
const InventoryAuditLogPage = lazy(() =>
  import("../features/inventory/InventoryAuditLogPage").then((module) => ({
    default: module.InventoryAuditLogPage,
  })),
);
const WasteCostReportPage = lazy(() =>
  import("../features/inventory/WasteCostReportPage").then((module) => ({
    default: module.WasteCostReportPage,
  })),
);
const LotTraceabilityPage = lazy(() =>
  import("../features/inventory/LotTraceabilityPage").then((module) => ({
    default: module.LotTraceabilityPage,
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
const VendorContractsPage = lazy(() =>
  import("../features/inventory/VendorContractsPage").then((module) => ({
    default: module.VendorContractsPage,
  })),
);
const KitchenDisplayPage = lazy(() =>
  import("../features/production/KitchenDisplayPage").then((module) => ({
    default: module.KitchenDisplayPage,
  })),
);
const RosterPage = lazy(() =>
  import("../features/workforce/RosterPage").then((module) => ({
    default: module.RosterPage,
  })),
);
const ShiftSwapRequestsPage = lazy(() =>
  import("../features/workforce/ShiftSwapRequestsPage").then((module) => ({
    default: module.ShiftSwapRequestsPage,
  })),
);
const TimeSheetPage = lazy(() =>
  import("../features/workforce/TimeSheetPage").then((module) => ({
    default: module.TimeSheetPage,
  })),
);
const TimeOffRequestsPage = lazy(() =>
  import("../features/workforce/TimeOffRequestsPage").then((module) => ({
    default: module.TimeOffRequestsPage,
  })),
);
const MessagesPage = lazy(() =>
  import("../features/workforce/MessagesPage").then((module) => ({
    default: module.MessagesPage,
  })),
);
const QualificationsPage = lazy(() =>
  import("../features/workforce/QualificationsPage").then((module) => ({
    default: module.QualificationsPage,
  })),
);
const TrainingPage = lazy(() =>
  import("../features/workforce/TrainingPage").then((module) => ({
    default: module.TrainingPage,
  })),
);
const StaffUtilizationPage = lazy(() =>
  import("../features/workforce/StaffUtilizationPage").then((module) => ({
    default: module.StaffUtilizationPage,
  })),
);
const PerformanceReviewsPage = lazy(() =>
  import("../features/workforce/PerformanceReviewsPage").then((module) => ({
    default: module.PerformanceReviewsPage,
  })),
);
const MyReviewsPage = lazy(() =>
  import("../features/workforce/MyReviewsPage").then((module) => ({
    default: module.MyReviewsPage,
  })),
);
const RoleScorecardsPage = lazy(() =>
  import("../features/workforce/RoleScorecardsPage").then((module) => ({
    default: module.RoleScorecardsPage,
  })),
);
const OneOnOnesPage = lazy(() =>
  import("../features/workforce/OneOnOnesPage").then((module) => ({
    default: module.OneOnOnesPage,
  })),
);
const CandidatesPage = lazy(() =>
  import("../features/workforce/CandidatesPage").then((module) => ({
    default: module.CandidatesPage,
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
const PackListTemplatesPage = lazy(() =>
  import("../features/logistics/PackListTemplatesPage").then((module) => ({
    default: module.PackListTemplatesPage,
  })),
);
const DeliveriesPage = lazy(() =>
  import("../features/logistics/DeliveriesPage").then((module) => ({
    default: module.DeliveriesPage,
  })),
);
const VehicleFleetPage = lazy(() =>
  import("../features/logistics/VehicleFleetPage").then((module) => ({
    default: module.VehicleFleetPage,
  })),
);
const VehicleSchedulePage = lazy(() =>
  import("../features/logistics/VehicleSchedulePage").then((module) => ({
    default: module.VehicleSchedulePage,
  })),
);
const VehicleMaintenancePage = lazy(() =>
  import("../features/logistics/VehicleMaintenancePage").then((module) => ({
    default: module.VehicleMaintenancePage,
  })),
);
const RoutePlannerPage = lazy(() =>
  import("../features/logistics/RoutePlannerPage").then((module) => ({
    default: module.RoutePlannerPage,
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
const RevenueTrendsPage = lazy(() =>
  import("../features/finance/RevenueTrendsPage").then((module) => ({
    default: module.RevenueTrendsPage,
  })),
);
const FoodCostPercentagePage = lazy(() =>
  import("../features/finance/FoodCostPercentagePage").then((module) => ({
    default: module.FoodCostPercentagePage,
  })),
);
const ProfitMarginReportsPage = lazy(() =>
  import("../features/finance/ProfitMarginReportsPage").then((module) => ({
    default: module.ProfitMarginReportsPage,
  })),
);
const TaxRatesPage = lazy(() =>
  import("../features/finance/TaxRatesPage").then((module) => ({
    default: module.TaxRatesPage,
  })),
);
const VenueCommissionTermsPage = lazy(() =>
  import("../features/finance/VenueCommissionTermsPage").then((module) => ({
    default: module.VenueCommissionTermsPage,
  })),
);
const RevenueAttributionsPage = lazy(() =>
  import("../features/finance/RevenueAttributionsPage").then((module) => ({
    default: module.RevenueAttributionsPage,
  })),
);
const RevenueAttributionDetailPage = lazy(() =>
  import("../features/finance/RevenueAttributionDetailPage").then((module) => ({
    default: module.RevenueAttributionDetailPage,
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
const TipDistributionPage = lazy(() =>
  import("../features/finance/TipDistributionPage").then((module) => ({
    default: module.TipDistributionPage,
  })),
);
const ReportsPage = lazy(() =>
  import("../features/reports/ReportsPage").then((module) => ({
    default: module.ReportsPage,
  })),
);
const SalesDashboardPage = lazy(() =>
  import("../features/reports/SalesDashboardPage").then((module) => ({
    default: module.SalesDashboardPage,
  })),
);
const TimsKPIsDashboardPage = lazy(() =>
  import("../features/reports/TimsKPIsDashboardPage").then((module) => ({
    default: module.TimsKPIsDashboardPage,
  })),
);
const CompanyScorecardDashboardPage = lazy(() =>
  import("../features/reports/CompanyScorecardDashboardPage").then(
    (module) => ({
      default: module.CompanyScorecardDashboardPage,
    }),
  ),
);
const L10DashboardPage = lazy(() =>
  import("../features/reports/L10DashboardPage").then((module) => ({
    default: module.L10DashboardPage,
  })),
);
const AvgEventValueGrowthDashboardPage = lazy(() =>
  import("../features/reports/AvgEventValueGrowthDashboardPage").then(
    (module) => ({
      default: module.AvgEventValueGrowthDashboardPage,
    }),
  ),
);
const CompMasterDashboardPage = lazy(() =>
  import("../features/reports/CompMasterDashboardPage").then((module) => ({
    default: module.CompMasterDashboardPage,
  })),
);
const MangiaDashboardPage = lazy(() =>
  import("../features/reports/MangiaDashboardPage").then((module) => ({
    default: module.MangiaDashboardPage,
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
const ProposalTemplatesPage = lazy(() =>
  import("../features/clients/ProposalTemplatesPage").then((module) => ({
    default: module.ProposalTemplatesPage,
  })),
);
const ContractsPage = lazy(() =>
  import("../features/clients/ContractsPage").then((module) => ({
    default: module.ContractsPage,
  })),
);
const LeadPipelinePage = lazy(() =>
  import("../features/clients/LeadPipelinePage").then((module) => ({
    default: module.LeadPipelinePage,
  })),
);
const QuoteSubmissionsReviewPage = lazy(() =>
  import("../features/sales/QuoteSubmissionsReviewPage").then((module) => ({
    default: module.QuoteSubmissionsReviewPage,
  })),
);
const MessageInboxPage = lazy(() =>
  import("../features/sales/MessageInboxPage").then((module) => ({
    default: module.MessageInboxPage,
  })),
);
const ContractDocumentPage = lazy(() =>
  import("../features/clients/ContractDocumentPage").then((module) => ({
    default: module.ContractDocumentPage,
  })),
);
const ClientRetentionPage = lazy(() =>
  import("../features/clients/ClientRetentionPage").then((module) => ({
    default: module.ClientRetentionPage,
  })),
);
const EquipmentCatalogPage = lazy(() =>
  import("../features/facilities/EquipmentCatalogPage").then((module) => ({
    default: module.EquipmentCatalogPage,
  })),
);
const VenuesPage = lazy(() =>
  import("../features/facilities/VenuesPage").then((module) => ({
    default: module.VenuesPage,
  })),
);
const VenueDetailPage = lazy(() =>
  import("../features/facilities/VenueDetailPage").then((module) => ({
    default: module.VenueDetailPage,
  })),
);
const VenueVendorRelationshipsPage = lazy(() =>
  import("../features/facilities/VenueVendorRelationshipsPage").then(
    (module) => ({
      default: module.VenueVendorRelationshipsPage,
    }),
  ),
);
const VenueLayoutTemplatesPage = lazy(() =>
  import("../features/facilities/VenueLayoutTemplatesPage").then((module) => ({
    default: module.VenueLayoutTemplatesPage,
  })),
);
const PermissionsPage = lazy(() =>
  import("../features/admin/PermissionsPage").then((module) => ({
    default: module.PermissionsPage,
  })),
);
const AnnouncementsPage = lazy(() =>
  import("../features/admin/AnnouncementsPage").then((module) => ({
    default: module.AnnouncementsPage,
  })),
);
const BrandingPage = lazy(() =>
  import("../features/admin/BrandingPage").then((module) => ({
    default: module.BrandingPage,
  })),
);
const PersonalDataExportPage = lazy(() =>
  import("../features/admin/PersonalDataExportPage").then((module) => ({
    default: module.PersonalDataExportPage,
  })),
);
const IntegrationsPage = lazy(() =>
  import("../features/admin/IntegrationsPage").then((module) => ({
    default: module.IntegrationsPage,
  })),
);
const ExternalRecordsReconcilePage = lazy(() =>
  import("../features/admin/import/ExternalRecordsReconcilePage").then(
    (module) => ({
      default: module.ExternalRecordsReconcilePage,
    }),
  ),
);
const ImportRunsListPage = lazy(() =>
  import("../features/admin/import/ImportRunsListPage").then((module) => ({
    default: module.ImportRunsListPage,
  })),
);
const ImportRunDetailPage = lazy(() =>
  import("../features/admin/import/ImportRunDetailPage").then((module) => ({
    default: module.ImportRunDetailPage,
  })),
);
const ParallelRunDashboardPage = lazy(() =>
  import("../features/admin/import/ParallelRunDashboardPage").then(
    (module) => ({
      default: module.ParallelRunDashboardPage,
    }),
  ),
);
const CutoverPage = lazy(() =>
  import("../features/admin/import/CutoverPage").then((module) => ({
    default: module.CutoverPage,
  })),
);
const MyDayPage = lazy(() =>
  import("../features/staff/MyDayPage").then((module) => ({
    default: module.MyDayPage,
  })),
);
const EmailNotificationSettingsPage = lazy(() =>
  import("../features/notifications/EmailNotificationSettingsPage").then(
    (module) => ({ default: module.EmailNotificationSettingsPage }),
  ),
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
  const clientPortalMatch = useMatch("/portal/events/:token");
  const acceptanceMatch = useMatch("/accept/:callbackToken");
  const shareMatch = useMatch("/share/:token");
  const quoteMatch = useMatch("/quote");

  if (clientPortalMatch?.params.token) {
    return (
      <AppErrorBoundary>
        <ClientPortalPage token={clientPortalMatch.params.token} />
      </AppErrorBoundary>
    );
  }

  if (acceptanceMatch?.params.callbackToken) {
    return (
      <AppErrorBoundary>
        <ProposalAcceptancePage />
      </AppErrorBoundary>
    );
  }

  if (shareMatch?.params.token) {
    return (
      <AppErrorBoundary>
        <SharedProposalPage />
      </AppErrorBoundary>
    );
  }

  if (quoteMatch) {
    return (
      <AppErrorBoundary>
        <QuoteSubmissionPage />
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      <AuthGate>
        <Routes>
          {/* Staff-facing mobile view lives outside AppShell so admin nav never renders. */}
          <Route
            path="/my"
            element={
              <SupplyRoute>
                <MyDayPage />
              </SupplyRoute>
            }
          />
          {/* Full-screen kitchen display lives outside AppShell for floor screens. */}
          <Route
            path="/kitchen/display"
            element={
              <SupplyRoute>
                <KitchenDisplayPage />
              </SupplyRoute>
            }
          />
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="/events" element={<EventsListPage />} />
            <Route path="/events/new" element={<EventCreatePage />} />
            <Route path="/events/templates" element={<EventTemplatesPage />} />
            <Route
              path="/events/capacity"
              element={<EventCapacityPlannerPage />}
            />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route
              path="/events/:id/allergen-briefing"
              element={<EventAllergenBriefingPage />}
            />
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
            <Route
              path="/kitchen/event-menu"
              element={<Navigate to="/events" replace />}
            />
            <Route
              path="/kitchen/allergens"
              element={<Navigate to="/kitchen/dishes" replace />}
            />
            <Route
              path="/kitchen/allergen-matrix"
              element={<AllergenMatrixPage />}
            />
            <Route path="/kitchen/prep" element={<KitchenDashboardPage />} />
            <Route
              path="/kitchen/yield"
              element={<Navigate to="/kitchen/dishes" replace />}
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
              path="/inventory/counts"
              element={
                <SupplyRoute>
                  <StockCountPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/inventory/audit"
              element={
                <SupplyRoute>
                  <InventoryAuditLogPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/inventory/waste"
              element={
                <SupplyRoute>
                  <WasteCostReportPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/inventory/traceability"
              element={
                <SupplyRoute>
                  <LotTraceabilityPage />
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
              path="/inventory/contracts"
              element={
                <SupplyRoute>
                  <VendorContractsPage />
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
              path="/staff/swaps"
              element={
                <SupplyRoute>
                  <ShiftSwapRequestsPage />
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
              path="/staff/time-off"
              element={
                <SupplyRoute>
                  <TimeOffRequestsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/staff/messages"
              element={
                <SupplyRoute>
                  <MessagesPage />
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
              path="/staff/training"
              element={
                <SupplyRoute>
                  <TrainingPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/staff/reviews"
              element={
                <SupplyRoute>
                  <PerformanceReviewsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/staff/my-reviews"
              element={
                <SupplyRoute>
                  <MyReviewsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/staff/scorecards"
              element={
                <SupplyRoute>
                  <RoleScorecardsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/staff/one-on-ones"
              element={
                <SupplyRoute>
                  <OneOnOnesPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/staff/hiring"
              element={
                <SupplyRoute>
                  <CandidatesPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/staff/utilization"
              element={
                <SupplyRoute>
                  <StaffUtilizationPage />
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
              path="/logistics/pack-templates"
              element={
                <SupplyRoute>
                  <PackListTemplatesPage />
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
              path="/logistics/schedule"
              element={
                <SupplyRoute>
                  <VehicleSchedulePage />
                </SupplyRoute>
              }
            />
            <Route
              path="/logistics/route"
              element={
                <SupplyRoute>
                  <RoutePlannerPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/logistics/fleet"
              element={
                <SupplyRoute>
                  <VehicleFleetPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/logistics/maintenance"
              element={
                <SupplyRoute>
                  <VehicleMaintenancePage />
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
              path="/finance/revenue"
              element={
                <SupplyRoute>
                  <RevenueTrendsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/food-cost"
              element={
                <SupplyRoute>
                  <FoodCostPercentagePage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/profit-margins"
              element={
                <SupplyRoute>
                  <ProfitMarginReportsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/taxes"
              element={
                <SupplyRoute>
                  <TaxRatesPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/commission-terms"
              element={
                <SupplyRoute>
                  <VenueCommissionTermsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/attribution"
              element={
                <SupplyRoute>
                  <RevenueAttributionsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/finance/attribution/:id/:mode?"
              element={
                <SupplyRoute>
                  <RevenueAttributionDetailPage />
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
              path="/finance/tips"
              element={
                <SupplyRoute>
                  <TipDistributionPage />
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
              path="/reports/sales"
              element={
                <SupplyRoute>
                  <SalesDashboardPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/reports/tims-kpis"
              element={
                <SupplyRoute>
                  <TimsKPIsDashboardPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/reports/scorecard"
              element={
                <SupplyRoute>
                  <CompanyScorecardDashboardPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/reports/l10"
              element={
                <SupplyRoute>
                  <L10DashboardPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/reports/avg-event-value"
              element={
                <SupplyRoute>
                  <AvgEventValueGrowthDashboardPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/reports/comp-master"
              element={
                <SupplyRoute>
                  <CompMasterDashboardPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/reports/mangia"
              element={
                <SupplyRoute>
                  <MangiaDashboardPage />
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
              path="/clients/pipeline"
              element={
                <SupplyRoute>
                  <LeadPipelinePage />
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
              path="/clients/proposals/templates"
              element={
                <SupplyRoute>
                  <ProposalTemplatesPage />
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
              path="/clients/contracts/:id/document"
              element={
                <SupplyRoute>
                  <ContractDocumentPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/clients/retention"
              element={
                <SupplyRoute>
                  <ClientRetentionPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/clients/quote-requests"
              element={
                <SupplyRoute>
                  <QuoteSubmissionsReviewPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/clients/inbox"
              element={
                <SupplyRoute>
                  <MessageInboxPage />
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
              path="/facilities"
              element={<Navigate to="/facilities/venues" replace />}
            />
            <Route
              path="/facilities/equipment"
              element={
                <SupplyRoute>
                  <EquipmentCatalogPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/facilities/venues"
              element={
                <SupplyRoute>
                  <VenuesPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/facilities/venues/templates"
              element={
                <SupplyRoute>
                  <VenueLayoutTemplatesPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/facilities/venues/:id"
              element={
                <SupplyRoute>
                  <VenueDetailPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/facilities/vendor-relationships"
              element={
                <SupplyRoute>
                  <VenueVendorRelationshipsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/facilities/venues/:venueId/vendor-relationships"
              element={
                <SupplyRoute>
                  <VenueVendorRelationshipsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/facilities/venues/:venueId/templates"
              element={
                <SupplyRoute>
                  <VenueLayoutTemplatesPage />
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
            <Route
              path="/admin/branding"
              element={
                <SupplyRoute>
                  <BrandingPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/admin/announcements"
              element={
                <SupplyRoute>
                  <AnnouncementsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/admin/data-export"
              element={
                <SupplyRoute>
                  <PersonalDataExportPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/admin/integrations"
              element={
                <SupplyRoute>
                  <IntegrationsPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/admin/imports"
              element={
                <SupplyRoute>
                  <ImportRunsListPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/admin/imports/:id"
              element={
                <SupplyRoute>
                  <ImportRunDetailPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/admin/parallel-run"
              element={
                <SupplyRoute>
                  <ParallelRunDashboardPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/admin/reconcile"
              element={
                <SupplyRoute>
                  <ExternalRecordsReconcilePage />
                </SupplyRoute>
              }
            />
            <Route
              path="/admin/cutover"
              element={
                <SupplyRoute>
                  <CutoverPage />
                </SupplyRoute>
              }
            />
            <Route
              path="/settings/email"
              element={
                <SupplyRoute>
                  <EmailNotificationSettingsPage />
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
