/** Propose package membership from recorded event plans, not item names.
 * Results are evidence-backed drafts; co-occurrence is not a source-defined BOM.
 */
export type PlanEvent = {
  id: string | number;
  date?: string;
  guestCount?: number;
  statusModel?: { isCancelled?: boolean; isProposal?: boolean; name?: string };
};
export type InventoryLine = {
  id: string | number;
  event: string | number;
  quantity: number;
  isHeader?: boolean;
  inventoryItem?: {
    id: string | number;
    name: string;
    classification: string;
  } | null;
};
type Plan = {
  date: string;
  guests: number;
  packages: Map<string, number>;
  equipment: Map<string, number>;
};
export function analyzePackagePatterns(
  events: PlanEvent[],
  lines: InventoryLine[],
  asOf: string,
) {
  const cutoff = asOf.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff))
    throw new Error("Export date is required for package inference.");
  const plans = new Map<string, Plan>();
  for (const event of events) {
    const status = event.statusModel;
    if (
      status?.isCancelled ||
      status?.isProposal ||
      /lost|cancel|proposal|quote|pending|tentative/i.test(
        status?.name ?? "",
      ) ||
      !event.date ||
      event.date.slice(0, 10) >= cutoff
    )
      continue;
    plans.set(String(event.id), {
      date: event.date?.slice(0, 10) ?? "",
      guests: Number(event.guestCount) || 0,
      packages: new Map(),
      equipment: new Map(),
    });
  }
  const packages = new Map<
    string,
    { id: string; name: string; type: string; occurrences: number }
  >();
  const names = new Map<string, string>();
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const line of lines) {
    const key = JSON.stringify([String(line.event), String(line.id)]);
    if (seen.has(key)) {
      duplicateRows++;
      continue;
    }
    seen.add(key);
    const item = line.inventoryItem;
    if (!item || line.isHeader) continue;
    const id = String(item.id),
      isPackage = ["EP", "BP"].includes(item.classification);
    if (isPackage) {
      const entry = packages.get(id) ?? {
        id,
        name: item.name.trim(),
        type: item.classification,
        occurrences: 0,
      };
      entry.occurrences++;
      packages.set(id, entry);
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
    const plan = plans.get(String(line.event));
    if (!plan) continue;
    const target = isPackage
      ? plan.packages
      : item.classification === "E"
        ? plan.equipment
        : null;
    if (target) target.set(id, (target.get(id) ?? 0) + line.quantity);
    if (item.classification === "E") names.set(id, item.name.trim());
  }
  const results = [...packages.values()].map((pkg) => {
    const history = [...plans.entries()]
      .filter(([, p]) => p.packages.has(pkg.id))
      .sort(
        (a, b) =>
          b[1].date.localeCompare(a[1].date) || a[0].localeCompare(b[0]),
      );
    const included = history.slice(0, 20);
    const dates = included
      .map(([, p]) => p.date)
      .filter(Boolean)
      .sort();
    const from = dates[0] ?? null,
      to = dates.at(-1) ?? null;
    // Compare contemporaneous plans so a new equipment catalog doesn't look
    // package-specific merely because older events predate that equipment.
    const baseline = [...plans.values()].filter(
      (p) =>
        !p.packages.has(pkg.id) &&
        p.date &&
        from &&
        to &&
        p.date >= from &&
        p.date <= to,
    );
    const alone = included.filter(([, p]) => p.packages.size === 1);
    const equipmentIds = new Set(
      history.flatMap(([, p]) => [...p.equipment.keys()]),
    );
    const candidates = [...equipmentIds]
      .map((id) => {
        const positive = included.filter(([, p]) => p.equipment.has(id));
        const support = positive.length,
          coverage = included.length ? support / included.length : 0;
        const historicalSupport = history.filter(([, p]) =>
          p.equipment.has(id),
        ).length;
        const backgroundCount = baseline.filter((p) =>
          p.equipment.has(id),
        ).length;
        const backgroundRate = baseline.length
          ? backgroundCount / baseline.length
          : null;
        const soloSupport = alone.filter(([, p]) => p.equipment.has(id)).length;
        const soloCoverage = alone.length ? soloSupport / alone.length : null;
        const modes = new Map<number, number>();
        for (const [, p] of positive) {
          const q =
            Math.round((p.equipment.get(id)! / p.packages.get(pkg.id)!) * 1e6) /
            1e6;
          modes.set(q, (modes.get(q) ?? 0) + 1);
        }
        const [quantity, quantitySupport] = [...modes].sort(
          (a, b) => b[1] - a[1] || a[0] - b[0],
        )[0] ?? [0, 0];
        // Prefer unconfounded observations. Test all three quantities separately
        // from membership; a consistent member may have no safe default amount.
        const quantityPlans = (alone.length >= 3 ? alone : included).filter(
          ([, p]) => p.equipment.has(id),
        );
        const quantityRule = inferQuantity(
          quantityPlans.map(([, p]) => ({
            quantity: p.equipment.get(id)!,
            packages: p.packages.get(pkg.id)!,
            guests: p.guests,
          })),
        );
        const stableQuantity = quantityRule !== null;
        const reasons: string[] = [];
        if (support < 3) reasons.push("Fewer than three independent events.");
        if (coverage < 0.75)
          reasons.push(
            "Present in fewer than 75% of recent package events; optional or historical variant.",
          );
        if (baseline.length < 10)
          reasons.push("Fewer than ten contemporaneous comparison events.");
        if (
          backgroundRate != null &&
          (coverage - backgroundRate < 0.3 || coverage < 2 * backgroundRate)
        )
          reasons.push(
            "Also common without this package; may be standard event equipment.",
          );
        if (soloSupport < 3 || soloCoverage == null || soloCoverage < 0.75)
          reasons.push(
            "Insufficient distinguishing single-package evidence; keep optional rather than double-assign shared equipment.",
          );
        if (!stableQuantity)
          reasons.push(
            "Quantity varies; do not assign a fixed amount automatically.",
          );
        const membershipStrong =
          support >= 3 &&
          coverage >= 0.75 &&
          baseline.length >= 10 &&
          backgroundRate != null &&
          coverage - backgroundRate >= 0.3 &&
          coverage >= 2 * backgroundRate &&
          soloSupport >= 3 &&
          soloCoverage != null &&
          soloCoverage >= 0.75;
        const classification = membershipStrong
          ? stableQuantity
            ? "proposed_core"
            : "likely_member_variable_quantity"
          : historicalSupport >= 3
            ? "optional"
            : "insufficient_evidence";
        const byYear = Object.fromEntries(
          [...new Set(history.map(([, p]) => p.date.slice(0, 4) || "unknown"))]
            .sort()
            .map((year) => {
              const cohort = history.filter(
                ([, p]) => (p.date.slice(0, 4) || "unknown") === year,
              );
              return [
                year,
                {
                  present: cohort.filter(([, p]) => p.equipment.has(id)).length,
                  events: cohort.length,
                },
              ];
            }),
        );
        return {
          id,
          name: names.get(id),
          support,
          historicalSupport,
          events: included.length,
          coverage,
          backgroundCount,
          backgroundEvents: baseline.length,
          backgroundRate,
          soloSupport,
          soloEvents: alone.length,
          classification,
          quantityRule,
          quantityPerPackage:
            quantitySupport / support >= 0.9 ? quantity : null,
          quantityAgreement:
            quantityRule?.agreement ??
            (support ? quantitySupport / support : 0),
          observedQuantities: [...modes].map(([quantity, events]) => ({
            quantity,
            events,
          })),
          byYear,
          reasons,
          evidenceEventIds: positive.map(([eventId]) => eventId),
        };
      })
      .sort(
        (a, b) =>
          b.coverage - a.coverage ||
          b.support - a.support ||
          a.id.localeCompare(b.id),
      );
    const coPackages = [...packages.values()]
      .filter((p) => p.id !== pkg.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        events: included.filter(([, e]) => e.packages.has(p.id)).length,
      }))
      .filter((p) => p.events > 0);
    return {
      ...pkg,
      eligibleEvents: included.length,
      historicalEvents: history.length,
      soloEvents: alone.length,
      from,
      to,
      coPackages,
      naiveThreeOccurrenceMembers: candidates.filter((c) => c.support >= 3)
        .length,
      proposedCoreMembers: candidates.filter(
        (c) => c.classification === "proposed_core",
      ).length,
      candidates,
    };
  });
  return {
    method: {
      minimumEvents: 3,
      recentEvents: 20,
      asOf,
      minimumCoverage: 0.75,
      minimumComparisonEvents: 10,
      minimumCoverageAdvantage: 0.3,
      minimumLift: 2,
      minimumSoloEvents: 3,
      minimumQuantityAgreement: 0.9,
      excluded:
        "Cancelled, lost, quotes, tentative and future events (including export day); zero/negative quantities; duplicate source line IDs.",
      meaning:
        "Package membership inferred from completed event plans, not source-defined contents or proof of physical usage. Historical equipment is never expanded again.",
    },
    duplicateRows,
    packages: results,
  };
}

export type QuantityRule = {
  scale: "fixed" | "packages" | "guests";
  quantity: number;
  perUnits: number;
  agreement: number;
};
function inferQuantity(
  observations: { quantity: number; packages: number; guests: number }[],
): QuantityRule | null {
  if (observations.length < 3) return null;
  const candidates: QuantityRule[] = [];
  for (const scale of ["fixed", "packages", "guests"] as const) {
    // A constant guest/package count cannot establish proportionality. In a tie
    // use the simpler per-event amount instead of extrapolating a correlation.
    if (
      scale !== "fixed" &&
      new Set(observations.map((o) => o[scale])).size < 2
    )
      continue;
    if (scale !== "fixed" && observations.some((o) => o[scale] <= 0)) continue;
    for (const o of observations) {
      const ratio = scale === "fixed" ? o.quantity : o.quantity / o[scale];
      let quantity = ratio,
        perUnits = 1;
      if (scale !== "fixed") {
        // Small rational ratios are explainable packing amounts: 2 per package,
        // 1 per 25 guests. Don't fit arbitrary decimal guest coefficients.
        let found = false;
        for (let n = 1; n <= 500; n++) {
          if (Math.abs(ratio * n - Math.round(ratio * n)) < 1e-6) {
            quantity = Math.round(ratio * n);
            perUnits = n;
            found = true;
            break;
          }
        }
        if (!found) continue;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) continue;
      const agreement =
        observations.filter((x) => {
          const predicted =
            scale === "fixed"
              ? quantity
              : Math.ceil((x[scale] * quantity) / perUnits - 1e-8);
          return predicted === x.quantity;
        }).length / observations.length;
      candidates.push({ scale, quantity, perUnits, agreement });
    }
  }
  return (
    candidates
      .sort((a, b) => b.agreement - a.agreement)
      .find((c) => c.agreement >= 0.9) ?? null
  );
}

export type InferredPackage = ReturnType<
  typeof analyzePackagePatterns
>["packages"][number];
