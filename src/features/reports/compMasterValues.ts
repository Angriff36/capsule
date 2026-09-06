export type CommissionMetrics = {
  totalCommission: number;
  salespeople: Array<{ name: string; commission: number }>;
};

export function calculateCommissionMetrics(input: {
  periodStart: number;
  periodEnd: number;
  cancelledEventIds: ReadonlySet<string>;
  people: Array<{ _id: string; givenName: string; familyName: string }>;
  attributions: Array<{
    eventId: string;
    salespersonId?: string | null;
    attributionType: string;
    status: string;
    allocatedAmount?: number | null;
    createdAt?: number | null;
    appliedAt?: number | null;
  }>;
}): CommissionMetrics {
  const byPerson = new Map<string, { name: string; commission: number }>();
  const periodRestricted =
    Number.isFinite(input.periodStart) || Number.isFinite(input.periodEnd);
  for (const attribution of input.attributions) {
    const appliedAt = attribution.appliedAt;
    if (
      attribution.attributionType !== "sales_commission" ||
      attribution.status !== "applied" ||
      !attribution.salespersonId ||
      input.cancelledEventIds.has(String(attribution.eventId)) ||
      (periodRestricted &&
        (appliedAt == null ||
          appliedAt < input.periodStart ||
          appliedAt >= input.periodEnd))
    )
      continue;
    const person = input.people.find(
      (candidate) => candidate._id === attribution.salespersonId,
    );
    const groupId = person?._id ?? attribution.salespersonId;
    const current = byPerson.get(groupId) ?? {
      name: person
        ? `${person.givenName} ${person.familyName}`.trim()
        : "Unknown salesperson",
      commission: 0,
    };
    current.commission += Number(attribution.allocatedAmount) || 0;
    byPerson.set(groupId, current);
  }
  const salespeople = Array.from(byPerson.values()).sort(
    (a, b) => b.commission - a.commission,
  );
  return {
    totalCommission: salespeople.reduce(
      (sum, person) => sum + person.commission,
      0,
    ),
    salespeople,
  };
}
