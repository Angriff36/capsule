export const FINANCE_SECTIONS = [
  { key: "invoices", label: "Invoices", path: "/finance/invoices" },
  { key: "payments", label: "Payments", path: "/finance/payments" },
] as const;

export type FinanceSection = (typeof FINANCE_SECTIONS)[number]["key"];

export const FINANCE_ROUTES = {
  root: "/finance",
  invoices: "/finance/invoices",
  invoiceDetail: (id: string) => `/finance/invoices/${id}`,
  payments: "/finance/payments",
} as const;
