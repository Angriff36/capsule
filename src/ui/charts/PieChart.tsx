import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/**
 * PieChart Component
 *
 * Displays pie charts for composition analysis.
 * Used for revenue by category, sales by venue, etc.
 *
 * Features:
 * - Customizable color palette
 * - Donut chart support
 * - Legend and tooltip
 * - Responsive design
 */

const DEFAULT_COLORS = [
  "var(--color-brand)",
  "var(--color-accent)",
  "var(--color-info)",
  "var(--color-ok)",
  "var(--color-warn)",
  "var(--color-danger)",
  "var(--color-ink-2)",
  "var(--color-accent-deep)",
  "var(--color-sage-2)",
  "var(--color-ink-3)",
];

export interface PieChartProps {
  data: Array<{ name: string; value: number }>;
  height?: number;
  width?: number | `${number}%`;
  colors?: string[];
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
  label?: boolean;
  className?: string;
}

export function PieChart({
  data,
  height = 300,
  width = "100%" as const,
  colors = DEFAULT_COLORS,
  innerRadius = 0,
  outerRadius = 80,
  showLegend = true,
  label = false,
  className,
}: PieChartProps) {
  return (
    <div className={className}>
      <ResponsiveContainer width={width} height={height}>
        <RechartsPieChart margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            label={label}
            labelLine={label}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-panel)",
              border: "1px solid var(--color-line)",
              borderRadius: "0.5rem",
            }}
          />
          {showLegend && <Legend />}
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}
