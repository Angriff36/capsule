/**
 * Sparkline — the small trend line under a StatCard number
 * (component picker 2026-09-29, stat tiles variant B "Tiles with trend line").
 *
 * Drawn to scale: the lowest point sits near the baseline and the highest
 * near the top, so the shape shows movement inside the series, not distance
 * from zero. Colors come from tone tokens, so it follows `.dark`.
 */

export type SparklineTone = "brand" | "accent" | "warn" | "info" | "ok" | "ink";

/** A real time series for a StatCard. Never fabricate one: omit the prop. */
export interface StatCardTrend {
  /** Oldest first. Fewer than two points draws nothing. */
  points: number[];
  /** Caption under the left end (e.g. "Aug 11"). */
  startLabel?: string;
  /** Caption under the right end (e.g. "This week"). */
  endLabel?: string;
}

const TONE_MARKS: Record<
  SparklineTone,
  { line: string; area: string; dot: string }
> = {
  brand: { line: "stroke-brand", area: "fill-brand-soft", dot: "bg-brand" },
  accent: { line: "stroke-accent", area: "fill-accent-soft", dot: "bg-accent" },
  warn: { line: "stroke-warn", area: "fill-warn-soft", dot: "bg-warn" },
  info: { line: "stroke-info", area: "fill-info-soft", dot: "bg-info" },
  ok: { line: "stroke-ok", area: "fill-ok-soft", dot: "bg-ok" },
  ink: { line: "stroke-ink-2", area: "fill-mute-soft", dot: "bg-ink-2" },
};

const WIDTH = 200;
const HEIGHT = 44;
const BASELINE = 40;
const TOP = 6;
const LOW = 34;

/** Maps values to SVG y: min → LOW, max → TOP; a flat series sits mid-way. */
export function sparklineYs(points: readonly number[]): number[] {
  const min = Math.min(...points);
  const max = Math.max(...points);
  if (max === min) return points.map(() => (TOP + LOW) / 2);
  return points.map((p) => LOW - ((p - min) / (max - min)) * (LOW - TOP));
}

export function Sparkline({
  trend,
  tone = "ink",
  label,
}: {
  trend: StatCardTrend;
  tone?: SparklineTone;
  /** Accessible summary, e.g. "Guests served, 8 weeks: 900 to 1,240". */
  label: string;
}) {
  const { points } = trend;
  if (points.length < 2 || points.some((p) => !Number.isFinite(p))) {
    return null;
  }
  const ys = sparklineYs(points);
  const step = WIDTH / (points.length - 1);
  const line = ys.map((y, i) => `${round(i * step)},${round(y)}`).join(" ");
  const area = `0,${BASELINE} ${line} ${WIDTH},${BASELINE}`;
  const marks = TONE_MARKS[tone];
  const endY = ys[ys.length - 1];

  return (
    <div className="mt-1.5" role="img" aria-label={label}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block h-11 w-full overflow-visible"
        >
          <line
            x1="0"
            y1={BASELINE}
            x2={WIDTH}
            y2={BASELINE}
            className="stroke-line"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <polygon points={area} className={marks.area} />
          <polyline
            points={line}
            fill="none"
            className={marks.line}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* The endpoint is HTML so the stretched viewBox cannot squash it. */}
        <span
          aria-hidden="true"
          className={`absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel ${marks.dot}`}
          style={{ left: "100%", top: `${(endY / HEIGHT) * 100}%` }}
        />
      </div>
      {trend.startLabel || trend.endLabel ? (
        <div
          aria-hidden="true"
          className="mt-1 flex justify-between gap-2 text-2xs text-ink-3"
        >
          <span>{trend.startLabel}</span>
          <span>{trend.endLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Builds a StatCard trend from the last `count` rows of a series a page
 * already has (the same rows its own chart plots). Returns undefined when
 * there are fewer than two rows, so the tile simply draws no line.
 */
export function trendFromSeries<T>(
  rows: readonly T[],
  value: (row: T) => number,
  label: (row: T) => string,
  count = 8,
): StatCardTrend | undefined {
  const tail = rows.slice(-count);
  if (tail.length < 2) return undefined;
  return {
    points: tail.map(value),
    startLabel: label(tail[0]),
    endLabel: label(tail[tail.length - 1]),
  };
}

/** "2026-03" → "Mar 2026" for month-keyed series. */
export function monthKeyLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
