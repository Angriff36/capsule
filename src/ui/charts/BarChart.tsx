import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatCount } from "@/lib/format";

/**
 * BarChart Component
 *
 * Displays bar charts for categorical comparisons.
 * Used for sales by category, venue comparisons, etc.
 *
 * Features:
 * - Multiple data series
 * - Vertical or horizontal orientation
 * - Stacked bars support
 * - Customizable colors
 */

export interface BarChartSeries {
  dataKey: string;
  name: string;
  color: string;
}

export interface BarChartProps {
  data: Array<Record<string, string | number>>;
  xAxisKey: string;
  series: BarChartSeries[];
  height?: number;
  width?: number | `${number}%`;
  orientation?: "vertical" | "horizontal";
  stacked?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  formatYAxis?: (value: number) => string;
  className?: string;
}

export function BarChart({
  data,
  xAxisKey,
  series,
  height = 300,
  width = "100%" as const,
  orientation = "vertical",
  stacked = false,
  showGrid = true,
  showLegend = true,
  formatYAxis = formatCount,
  className,
}: BarChartProps) {
  return (
    <div className={className}>
      <ResponsiveContainer width={width} height={height}>
        <RechartsBarChart
          data={data}
          layout={orientation === "horizontal" ? "vertical" : "horizontal"}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" className="stroke-line" />
          )}
          <XAxis
            dataKey={orientation === "horizontal" ? undefined : xAxisKey}
            type={orientation === "horizontal" ? "number" : "category"}
            className="text-xs text-ink-2"
            tick={{ fill: "currentColor" }}
          />
          <YAxis
            type={orientation === "horizontal" ? "category" : "number"}
            dataKey={orientation === "horizontal" ? xAxisKey : undefined}
            className="text-xs text-ink-2"
            tick={{ fill: "currentColor" }}
            tickFormatter={orientation === "vertical" ? formatYAxis : undefined}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-panel)",
              border: "1px solid var(--color-line)",
              borderRadius: "0.5rem",
            }}
          />
          {showLegend && <Legend />}
          {series.map((s) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              fill={s.color}
              name={s.name}
              stackId={stacked ? "stack" : undefined}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
