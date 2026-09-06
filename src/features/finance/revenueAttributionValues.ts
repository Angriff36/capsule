export type RevenueEstimate = { amount: number; basis: string };

export function eventRevenueEstimate(event: {
  quotedPrice?: number | null;
  budgetAmount?: number | null;
}): RevenueEstimate {
  const quoted = Number(event.quotedPrice) || 0;
  if (quoted > 0) return { amount: quoted, basis: "Quote estimate" };
  const budget = Number(event.budgetAmount) || 0;
  if (budget > 0) return { amount: budget, basis: "Budget estimate" };
  return { amount: 0, basis: "No estimate available" };
}
