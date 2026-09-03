import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatCount } from "@/lib/format";

/**
 * LineChart Component
 *
 * Displays line charts for trends over time.
 * Used for KPIs, revenue trends, and time-series data.
 *
 * Features:
 * - Multiple data series
 * - Customizable colors
 * - Responsive design
 * - Tooltip and legend support
 */

export interface LineChartSeries {
  dataKey: string;
  name: string;
  color: string;
  yAxisId?: "left" | "right";
}

export interface LineChartProps {
  data: Array<Record<string, string | number>>;
  xAxisKey: string;
  series: LineChartSeries[];
  height?: number;
  width?: number | `${number}%`;
  showGrid?: boolean;
  showLegend?: boolean;
  formatYAxis?: (value: number) => string;
  formatRightYAxis?: (value: number) => string;
  className?: string;
}

export function LineChart({
  data,
  xAxisKey,
  series,
  height = 300,
  width = "100%" as const,
  showGrid = true,
  showLegend = true,
  formatYAxis = formatCount,
  formatRightYAxis = formatCount,
  className,
}: LineChartProps) {
  const hasRightAxis = series.some((item) => item.yAxisId === "right");
  return (
    <div className={className}>
      <ResponsiveContainer width={width} height={height}>
        <RechartsLineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" className="stroke-line" />
          )}
          <XAxis
            dataKey={xAxisKey}
            className="text-2xs text-ink-2"
            tick={{ fill: "currentColor" }}
          />
          <YAxis
            yAxisId="left"
            className="text-2xs text-ink-2"
            tick={{ fill: "currentColor" }}
            tickFormatter={formatYAxis}
          />
          {hasRightAxis ? (
            <YAxis
              yAxisId="right"
              orientation="right"
              className="text-2xs text-ink-2"
              tick={{ fill: "currentColor" }}
              tickFormatter={formatRightYAxis}
            />
          ) : null}
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-panel)",
              border: "1px solid var(--color-line)",
              borderRadius: "0.5rem",
            }}
          />
          {showLegend && <Legend />}
          {series.map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              stroke={s.color}
              name={s.name}
              yAxisId={s.yAxisId ?? "left"}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
