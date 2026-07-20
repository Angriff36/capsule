export const FINANCE_SECTIONS = [
  { key: "invoices", label: "Invoices", path: "/finance/invoices" },
  { key: "payments", label: "Payments", path: "/finance/payments" },
  { key: "closeout", label: "Closeout", path: "/finance/closeout" },
  { key: "payroll", label: "Payroll", path: "/finance/payroll" },
] as const;

export type FinanceSection = (typeof FINANCE_SECTIONS)[number]["key"];

export const FINANCE_ROUTES = {
  root: "/finance",
  invoices: "/finance/invoices",
  invoiceDetail: (id: string) => `/finance/invoices/${id}`,
  payments: "/finance/payments",
  closeout: "/finance/closeout",
  payroll: "/finance/payroll",
} as const;
