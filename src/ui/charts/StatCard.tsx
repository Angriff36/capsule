import { clsx } from "@/lib/utils";
import { Sparkline, type StatCardTrend } from "./Sparkline";

export type { StatCardTrend } from "./Sparkline";

/**
 * StatCard — one metric tile for dashboards.
 *
 * Look: stat tiles variant B, "Tiles with trend line" (owner pick in the
 * component picker, 2026-09-29). Panel box with a fine line border, the label
 * in ink-2, a big IBM Plex Mono number, and — only when the page passes a real
 * series — an 8-point sparkline with start/end captions. Tone colors the
 * sparkline and the icon; the tile itself stays paper.
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
  /** A real series (oldest first) the page already has. Omit when none. */
  trend?: StatCardTrend;
  className?: string;
}

const TONE_ICON = {
  brand: "text-brand",
  accent: "text-accent",
  warn: "text-warn",
  info: "text-info",
  ok: "text-ok",
  ink: "text-ink-3",
} as const;

const SIZE_STYLES = {
  compact: "px-3 pt-3 pb-2",
  default: "px-3.5 pt-3.5 pb-2.5",
  large: "px-5 pt-5 pb-4",
} as const;

const VALUE_SIZE = {
  compact: "text-xl",
  default: "text-2xl",
  large: "text-3xl",
} as const;

export function formatStatValue(
  value: string | number,
  format?: StatCardData["format"],
): string {
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
}

export function StatCard({
  title,
  main,
  rows = [],
  icon,
  isLive = false,
  tone = "ink",
  size = "default",
  trend,
  className,
}: StatCardProps) {
  const delta = main.trend;
  const deltaIcon =
    delta?.direction === "up" ? "▲" : delta?.direction === "down" ? "▼" : "—";
  const deltaColor =
    delta?.direction === "up"
      ? "text-ok"
      : delta?.direction === "down"
        ? "text-warn"
        : "text-ink-3";
  const value = formatStatValue(main.value, main.format);
  const trendLabel =
    trend && trend.points.length >= 2
      ? `${title} trend${
          trend.startLabel && trend.endLabel
            ? `, ${trend.startLabel} to ${trend.endLabel}`
            : ""
        }: ${formatStatValue(trend.points[0], main.format)} to ${formatStatValue(
          trend.points[trend.points.length - 1],
          main.format,
        )}`
      : "";

  return (
    <div
      className={clsx(
        "grid min-w-0 gap-0.5 rounded-md border border-line bg-panel text-ink",
        SIZE_STYLES[size],
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink-2">
          {icon ? (
            <span className={clsx("shrink-0 self-center", TONE_ICON[tone])}>
              {icon}
            </span>
          ) : null}
          <span className="min-w-0">{title}</span>
          {isLive ? (
            <span
              className="h-1.5 w-1.5 shrink-0 animate-pulse self-center rounded-full bg-ok"
              aria-label="Live"
              role="img"
            />
          ) : null}
        </h3>
        <span
          className={clsx(
            "font-mono leading-tight font-semibold tracking-tight tabular-nums",
            VALUE_SIZE[size],
          )}
        >
          {value}
        </span>
      </div>

      {delta ? (
        <p
          className={clsx(
            "text-right font-mono text-2xs font-medium tabular-nums",
            deltaColor,
          )}
        >
          {deltaIcon} {Math.abs(delta.value)}%
        </p>
      ) : null}

      {trend ? (
        <Sparkline trend={trend} tone={tone} label={trendLabel} />
      ) : null}

      {rows.length > 0 ? (
        <dl className="mt-2 space-y-1 border-t border-line pt-2">
          {rows.map((row, index) => (
            <div
              key={index}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <dt className="text-ink-2">{row.label}</dt>
              <dd className="font-mono font-medium text-ink tabular-nums">
                {formatStatValue(row.value, row.format)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
