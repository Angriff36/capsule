import { Link } from "react-router-dom";
import {
  useListClient,
  useListInvoice,
  useListOrganization,
  useListPayment,
} from "../../lib/manifest-convex-react";
import {
  EmptyState,
  PageHeader,
  Section,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import {
  formatCount,
  formatDate,
  formatMoney,
  normalizeCurrencyCode,
  relativeDays,
} from "../../lib/format";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";

/** Invoice statuses with money still owed — the "needs attention" pool. */
const OPEN_STATUSES = ["sent", "viewed", "overdue", "partial"];

const ATTENTION_LIMIT = 8;

const functionalAmount = (
  amount: number,
  exchangeRate: number | string | null | undefined,
): number => {
  const rawRate = Number(exchangeRate ?? 1);
  const rate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 1;
  return amount * rate;
};

const quickLinks: { label: string; path: string; description: string }[] = [
  {
    label: "Invoices",
    path: FINANCE_ROUTES.invoices,
    description: "Issue, send, and track client invoices.",
  },
  {
    label: "Payments",
    path: FINANCE_ROUTES.payments,
    description: "Record incoming payments and settle them against invoices.",
  },
  {
    label: "Payment methods",
    path: FINANCE_ROUTES.paymentMethods,
    description: "Client payment details kept on file.",
  },
  {
    label: "Closeout",
    path: FINANCE_ROUTES.closeout,
    description: "Reconcile event finances after service wraps.",
  },
  {
    label: "Payroll",
    path: FINANCE_ROUTES.payroll,
    description: "Staff pay runs and payroll records.",
  },
  {
    label: "Tips",
    path: FINANCE_ROUTES.tips,
    description: "Collect and distribute event tips.",
  },
  {
    label: "Tax",
    path: FINANCE_ROUTES.taxes,
    description: "Tax rates and collected tax by jurisdiction.",
  },
  {
    label: "Commission terms",
    path: FINANCE_ROUTES.venueCommissionTerms,
    description: "Venue commission agreements and rates.",
  },
  {
    label: "Attribution",
    path: FINANCE_ROUTES.revenueAttribution,
    description: "Trace revenue back to the source that earned it.",
  },
  {
    label: "Revenue",
    path: FINANCE_ROUTES.revenue,
    description: "Revenue trends across events and months.",
  },
  {
    label: "Food cost",
    path: FINANCE_ROUTES.foodCost,
    description: "Ingredient spend measured against menu pricing.",
  },
  {
    label: "Profit margins",
    path: FINANCE_ROUTES.profitMargins,
    description: "Margin by event and service line.",
  },
  {
    label: "Sales dashboard",
    path: FINANCE_ROUTES.salesDashboard,
    description: "Pipeline health and sales performance.",
  },
  {
    label: "Tim's KPIs",
    path: FINANCE_ROUTES.timsKpis,
    description: "Owner-level key performance indicators.",
  },
  {
    label: "Scorecard",
    path: FINANCE_ROUTES.scorecard,
    description: "Weekly scorecard measurables.",
  },
  {
    label: "L10",
    path: FINANCE_ROUTES.l10,
    description: "L10 meeting metrics, rocks, and issues.",
  },
  {
    label: "Avg event value",
    path: FINANCE_ROUTES.avgEventValue,
    description: "Average value per booked event over time.",
  },
  {
    label: "Comp Master",
    path: FINANCE_ROUTES.compMaster,
    description: "Comped items and what they cost the house.",
  },
  {
    label: "Mangia",
    path: FINANCE_ROUTES.mangia,
    description: "Mangia reporting dashboard.",
  },
];

const clientLabel = (row: {
  clientType?: string;
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  displayName?: string | null;
}) => {
  if (row.displayName) return String(row.displayName);
  if (row.clientType === "person") {
    return `${row.givenName ?? ""} ${row.familyName ?? ""}`.trim() || "Client";
  }
  return row.companyName?.trim() || "Client";
};

export function FinanceOverviewPage() {
  const invoices = useListInvoice();
  const payments = useListPayment();
  const clients = useListClient();
  const organizations = useListOrganization();
  const loading =
    invoices === undefined || payments === undefined || clients === undefined;

  const functionalCurrencyCode = normalizeCurrencyCode(
    organizations?.find((row) => row.deletedAt == null)?.defaultCurrencyCode,
    "USD",
  );

  const activeRows = (invoices ?? []).filter((row) => row.deletedAt == null);
  const openRows = activeRows.filter((row) =>
    OPEN_STATUSES.includes(String(row.status)),
  );
  const outstandingTotal = openRows.reduce(
    (sum, row) =>
      sum + functionalAmount(Number(row.amountDue ?? 0), row.exchangeRate),
    0,
  );
  const overdueCount = openRows.filter(
    (row) => String(row.status) === "overdue",
  ).length;
  const now = new Date();
  const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEndMs = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
  ).getTime();
  const invoicesById = new Map(activeRows.map((row) => [String(row._id), row]));
  const paidThisMonth = (payments ?? [])
    .filter(
      (row) =>
        row.deletedAt == null &&
        String(row.status) === "completed" &&
        Number(row.settledAt ?? 0) >= monthStartMs &&
        Number(row.settledAt ?? 0) < monthEndMs,
    )
    .reduce((sum, row) => {
      const invoice = invoicesById.get(String(row.invoiceId));
      return (
        sum + functionalAmount(Number(row.amount ?? 0), invoice?.exchangeRate)
      );
    }, 0);
  const draftCount = activeRows.filter(
    (row) => String(row.status) === "draft",
  ).length;
  // paymentRead requires financeAccess while invoices are readable via
  // manageAccess, and denied generated reads come back as [] — so an empty
  // payments list alongside invoices that have settled is access-denial, not
  // "no receipts". Show that honestly instead of $0 (sol review 2026-07-28).
  const paymentsUnreadable =
    (payments ?? []).length === 0 &&
    activeRows.some((row) => row.paidAt != null);

  const attentionRows = [...openRows]
    .sort((a, b) => {
      const aOverdue = String(a.status) === "overdue" ? 0 : 1;
      const bOverdue = String(b.status) === "overdue" ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const aDue = Number(a.dueDate ?? Number.MAX_SAFE_INTEGER);
      const bDue = Number(b.dueDate ?? Number.MAX_SAFE_INTEGER);
      return aDue - bDue;
    })
    .slice(0, ATTENTION_LIMIT);

  const nameForClient = (id: string) => {
    const client = clients?.find((row) => row._id === id);
    return client ? clientLabel(client) : "Unknown client";
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finance"
        lead="Money owed, money collected, and where to act next."
      />
      <FinanceWorkspaceNav />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line lg:grid-cols-4">
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Outstanding</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading
              ? "—"
              : formatMoney(outstandingTotal, functionalCurrencyCode)}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Overdue invoices</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? "—" : formatCount(overdueCount)}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Paid this month</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading
              ? "—"
              : paymentsUnreadable
                ? "—"
                : formatMoney(paidThisMonth, functionalCurrencyCode)}
          </dd>
          {!loading && paymentsUnreadable ? (
            <p className="mt-1 text-[11px] text-ink-3">
              Requires finance access to read payments.
            </p>
          ) : null}
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Drafts waiting</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {loading ? "—" : formatCount(draftCount)}
          </dd>
        </div>
      </dl>

      <Section
        title="Needs attention"
        count={loading ? undefined : openRows.length}
        actions={
          <Link className="text-link text-[12px]" to={FINANCE_ROUTES.invoices}>
            All invoices
          </Link>
        }
      >
        {loading ? (
          <TableSkeleton rows={4} />
        ) : attentionRows.length === 0 ? (
          <EmptyState
            title="Nothing owed right now."
            hint="Every sent invoice is settled. Issue the next one when the work is booked."
            action={
              <Link
                className="btn btn-primary btn-sm"
                to={FINANCE_ROUTES.issueInvoice()}
              >
                Issue invoice
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {attentionRows.map((row) => (
              <li key={row._id}>
                <Link
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-inset"
                  to={FINANCE_ROUTES.invoiceDetail(row._id)}
                >
                  <div>
                    <p className="font-medium text-ink">
                      {row.invoiceNumber || "Draft invoice"}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {nameForClient(String(row.clientId))}
                      {row.dueDate != null
                        ? ` · due ${formatDate(Number(row.dueDate))} (${relativeDays(Number(row.dueDate))})`
                        : " · no due date"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] text-ink-2">
                      {formatMoney(
                        Number(row.amountDue ?? 0),
                        normalizeCurrencyCode(
                          row.currencyCode,
                          functionalCurrencyCode,
                        ),
                      )}
                    </span>
                    <StatusChip status={String(row.status)} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Go to">
        <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <li key={link.path} className="bg-panel">
              <Link className="block px-3 py-2.5 hover:bg-inset" to={link.path}>
                <p className="font-medium text-ink">{link.label}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  {link.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
