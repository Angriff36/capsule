export type CommissionMetrics = {
  totalCommission: number;
  salespeople: Array<{ name: string; commission: number; eventCount: number }>;
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
  }>;
}): CommissionMetrics {
  const byPerson = new Map<
    string,
    { name: string; commission: number; eventCount: number }
  >();
  for (const attribution of input.attributions) {
    const createdAt = attribution.createdAt ?? 0;
    if (
      attribution.attributionType !== "sales_commission" ||
      attribution.status !== "applied" ||
      !attribution.salespersonId ||
      input.cancelledEventIds.has(String(attribution.eventId)) ||
      createdAt < input.periodStart ||
      createdAt >= input.periodEnd
    )
      continue;
    const person = input.people.find(
      (candidate) => candidate._id === attribution.salespersonId,
    );
    if (!person) continue;
    const current = byPerson.get(person._id) ?? {
      name: `${person.givenName} ${person.familyName}`.trim(),
      commission: 0,
      eventCount: 0,
    };
    current.commission += Number(attribution.allocatedAmount) || 0;
    current.eventCount += 1;
    byPerson.set(person._id, current);
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
