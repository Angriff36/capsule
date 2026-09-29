/**
 * Chart Components Library
 *
 * Reusable chart components for dashboards and reports.
 * Built on recharts with consistent styling and responsive design.
 */

export { StatCard } from "./StatCard";
export type { StatCardProps, StatCardData, StatCardTrend } from "./StatCard";
export { Sparkline, trendFromSeries, monthKeyLabel } from "./Sparkline";

export { LineChart } from "./LineChart";
export type { LineChartProps, LineChartSeries } from "./LineChart";

export { BarChart } from "./BarChart";
export type { BarChartProps, BarChartSeries } from "./BarChart";

export { PieChart } from "./PieChart";
export type { PieChartProps } from "./PieChart";

export { TableDisplay } from "./TableDisplay";
export type { TableDisplayProps, TableColumn } from "./TableDisplay";

export { DashboardGrid } from "./DashboardGrid";
export type {
  DashboardGridProps as DashboardGridProps,
  DashboardGridSize,
} from "./DashboardGrid";
