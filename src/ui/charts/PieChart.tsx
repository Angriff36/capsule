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
  "#3b82f6", // brand-500
  "#8b5cf6", // accent-500
  "#f59e0b", // warn-500
  "#10b981", // ok-500
  "#6b7280", // ink-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#06b6d4", // cyan-500
  "#a855f7", // purple-500
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
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
            }}
          />
          {showLegend && <Legend />}
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}
