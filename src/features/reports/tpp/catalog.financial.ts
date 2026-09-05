import {
  AS_OF_PARAMETER,
  CLIENT_PARAMETER,
  DATE_RANGE_PARAMETER,
  PRINT_EXCEL_OUTPUTS,
  report,
} from "./catalog.shared";
import type { TppReportDefinition } from "./types";

const financial = (
  id: string,
  name: string,
  description: string,
  parameters = DATE_RANGE_PARAMETER,
): TppReportDefinition =>
  report({
    id,
    name,
    description,
    category: "financial",
    parameters,
    renderer: "financial",
    outputs: PRINT_EXCEL_OUTPUTS,
  });

export const TPP_FINANCIAL_REPORTS: readonly TppReportDefinition[] = [
  financial(
    "ar-aging-detail",
    "A/R Aging Detail",
    "Contact Break down of past due events.",
    AS_OF_PARAMETER,
  ),
  financial(
    "accounts-receivable",
    "Accounts Receivable",
    "Outstanding/overdue invoice receivables by contact.",
    AS_OF_PARAMETER,
  ),
  financial(
    "accounts-receivable-new",
    "Accounts Receivable - New",
    "Outstanding/overdue invoice receivables by contact - New",
    AS_OF_PARAMETER,
  ),
  financial(
    "average-event-spending-per-guest",
    "Average Event Spending per Guest",
    "Breakdown of per person sale calculated from the event menu(s).",
  ),
  financial(
    "beverage-costs",
    "Beverage Costs",
    "Beverage costing detail by event or date range.",
  ),
  financial(
    "beverage-totals",
    "Beverage Totals",
    "Detailed breakdown of event beverage charges, costs, and profit percentage.",
  ),
  financial(
    "contact-payments",
    "Contact Payments",
    "Invoice payments received for selected events - or choose any payments within a date range.",
  ),
  financial(
    "contact-statement-receivables",
    "Contact Statement/Receivables",
    "Shows the invoices that make up each contact's current balance.",
    CLIENT_PARAMETER,
  ),
  financial(
    "credit-card-transactions",
    "Credit Card Transactions",
    "Cross-reference your transactions with TPP",
  ),
  financial(
    "event-discount-summary",
    "Event Discount Summary",
    "EventDiscountSmmary",
  ),
  financial(
    "event-food-costing-summary",
    "Event Food Costing Summary",
    "Event FoodCostingSummary",
  ),
  financial("event-other-fees", "Event Other Fee(s)", "", DATE_RANGE_PARAMETER),
  financial(
    "event-revenue-by-client",
    "Event Revenue by Client",
    "Event Revenue by Client",
  ),
  financial(
    "event-sales-by-referral",
    "Event Sales by Referral",
    "Event sales summary by Referral",
  ),
  financial(
    "event-scheduled-payments",
    "Event Scheduled Payments",
    "Listing of Scheduled Event Payments by date range and statuses.",
  ),
  financial(
    "inventory-cost-changes",
    "Inventory Cost Changes",
    "Shows the cost increase/decrease percentages of inventory items over time.",
  ),
  financial(
    "ledger-food-beverage-sales",
    "Ledger / Food and Beverage Sales",
    "Breaks down pricing, taxing, and service charges for foods, beverages, rentals, miscellaneous, and staffing charges.",
  ),
  financial(
    "lost-revenue-by-cancellation-reason",
    "Lost Revenue by Cancellation Reason",
    "Listing of business lost based on the reason for cancellation. Analyze trends to prevent future losses.",
  ),
  financial(
    "menu-item-cost-per-event",
    "Menu Item Cost per Event",
    "Detailed breakdown of food costs, per menu item, for selected event or date range.",
  ),
  financial("menu-item-costing", "Menu Item Costing", ""),
  financial(
    "menu-item-itemized-sales",
    "Menu Item Itemized Sales",
    "Itemized Sales Total and event count of Menu Items",
  ),
  financial("menu-item-sales-by-category", "Menu Item Sales by Category", ""),
  financial(
    "miscellaneous-totals",
    "Miscellaneous Totals",
    "Detailed breakdown of event miscellaneous charges, costs, and profit percentage.",
  ),
  financial(
    "outstanding-deposits",
    "Outstanding Deposits",
    'Listing of deposits "to be paid" for events within a specified date range.',
  ),
  financial(
    "outstanding-proposals",
    "Outstanding Proposals",
    "Events still marked in a Proposal status. Use this report to possibly prompt a call for deposit. Once the deposit is received, mark the event as",
  ),
  financial(
    "payment-totals",
    "Payment Totals",
    "Summary of payment amounts by method of payment (check, visa, master card, etc.)",
  ),
  financial(
    "platform-fee-gratuity-summary",
    "Platform Fee + Gratuity Summary",
    "Platform Fees summarized by event date range. Can be used to track amount of platform fees collected.",
  ),
  financial(
    "profit-summary",
    "Profit Summary",
    "Profit analysis per event (detailed) or summarized by date range. Determine if you're operating at a profit or a loss.",
  ),
  financial(
    "rental-charges",
    "Rental Charges",
    "Detailed breakdown of event rental charges, costs, and profit percentage. Printed by event or date range.",
  ),
  financial(
    "sales-forecasting",
    "Sales Forecasting",
    "Sales summary by contact. Print a past date range for actual sales, or future date range for forecasting.",
  ),
  financial(
    "snapshot-revenue",
    "Snapshot Revenue",
    "Revenue/Forecast as of a snapshot",
    AS_OF_PARAMETER,
  ),
  financial(
    "staff-earnings",
    "Staff Earnings",
    "Event wage costing analysis by title and staff member.",
  ),
  financial(
    "staffing-charges",
    "Staffing Charges",
    "Detailed breakdown of event wage charges, wages paid, and profit percentage. Printed by event or date range.",
  ),
  financial(
    "tax-exempt-new",
    "Tax Exempt - New",
    "Tax Exempt for Menu,Beverages,Rentals,Misc,Staff,Room, Service Charge, Gratuity, Other Fees - New",
  ),
  financial("taxable-sales", "Taxable Sales", "Taxable Sales"),
  financial(
    "venue-sales",
    "Venue Sales",
    "Event sales summary by venue assigned to event. Print by date range.",
  ),
];
