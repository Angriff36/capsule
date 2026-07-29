import { clsx } from "@/lib/utils";

/**
 * StatCard Component
 *
 * Displays a single metric with title, value, and optional metadata.
 * Used throughout dashboards for KPIs and summary metrics.
 *
 * Features:
 * - Icon support with tone-based styling
 * - Live indicator for real-time data
 * - Optional trend indicator (up/down/neutral)
 * - Multiple data rows for related metrics
 * - Responsive design with mobile breakpoints
 */

export interface StatCardData {
  label?: string;
  value: string | number;
  format?: "number" | "currency" | "percent" | "date";
  trend?: {
    value: number;
    direction: "up" | "down" | "neutral";
  };
}

export interface StatCardProps {
  title: string;
  main: StatCardData;
  rows?: StatCardData[];
  icon?: React.ReactNode;
  isLive?: boolean;
  tone?: "brand" | "accent" | "warn" | "info" | "ok" | "ink";
  size?: "default" | "compact" | "large";
  className?: string;
}

const TONE_STYLES = {
  brand: "bg-brand-soft border-brand/30 text-ink",
  accent: "bg-accent-soft border-accent/30 text-ink",
  warn: "bg-warn-soft border-warn/30 text-ink",
  info: "bg-info-soft border-info/30 text-ink",
  ok: "bg-ok-soft border-ok/30 text-ink",
  ink: "bg-panel border-line text-ink",
} as const;

const SIZE_STYLES = {
  compact: "p-3",
  default: "p-4",
  large: "p-6",
} as const;

export function StatCard({
  title,
  main,
  rows = [],
  icon,
  isLive = false,
  tone = "ink",
  size = "default",
  className,
}: StatCardProps) {
  const formatValue = (
    value: string | number,
    format?: StatCardData["format"],
  ): string => {
    if (typeof value === "string") return value;

    switch (format) {
      case "currency":
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value);
      case "percent":
        return `${value.toFixed(1)}%`;
      case "number":
        return new Intl.NumberFormat("en-US").format(value);
      case "date":
        return new Date(value).toLocaleDateString();
      default:
        return value.toString();
    }
  };

  const trendIcon =
    main.trend?.direction === "up"
      ? "↑"
      : main.trend?.direction === "down"
        ? "↓"
        : "—";
  const trendColor =
    main.trend?.direction === "up"
      ? "text-ok"
      : main.trend?.direction === "down"
        ? "text-warn"
        : "text-ink-3";

  return (
    <div
      className={clsx(
        "rounded-lg border border-line bg-panel",
        TONE_STYLES[tone],
        SIZE_STYLES[size],
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-ink-2">{title}</h3>
            {isLive && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-ok" />
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight">
              {formatValue(main.value, main.format)}
            </span>
            {main.trend && (
              <span className={clsx("text-sm font-medium", trendColor)}>
                {trendIcon} {Math.abs(main.trend.value)}%
              </span>
            )}
          </div>
        </div>
        {icon && <div className="text-ink-3">{icon}</div>}
      </div>

      {rows.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-current/10 pt-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="flex items-baseline justify-between text-sm"
            >
              <span className="text-ink-2">{row.label}</span>
              <span className="font-medium">
                {formatValue(row.value, row.format)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
