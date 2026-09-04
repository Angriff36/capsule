import type { TppMeasure, TppRow, TppTotal } from "./types";
import { percentage, sumRows } from "./aggregates";

export function moneyTotal(
  rows: readonly TppRow[],
  key: string,
  label: string,
): TppTotal {
  return { key, label, value: sumRows(rows, key), kind: "money" };
}

export function profitMeasures(revenue: number, cost: number): TppMeasure[] {
  const profit = revenue - cost;
  return [
    {
      key: "revenue",
      label: "Revenue",
      value: revenue,
      kind: "money",
      emphasis: "primary",
    },
    { key: "cost", label: "Cost", value: cost, kind: "money" },
    {
      key: "profit",
      label: "Profit",
      value: profit,
      kind: "money",
      emphasis: "primary",
    },
    {
      key: "margin",
      label: "Profit %",
      value: percentage(profit, revenue),
      kind: "percentage",
    },
  ];
}
