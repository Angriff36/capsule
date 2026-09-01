type Props = {
  readonly pct: number;
  readonly label: string;
  readonly tone: "ok" | "warn" | "danger";
  readonly daysOut: number | null;
};

const TONE_STROKE: Record<Props["tone"], string> = {
  ok: "var(--evd-ready)",
  warn: "var(--evd-review)",
  danger: "var(--evd-blocked)",
};

/** The overall-readiness dial from the north-star mock. */
export function EventDayReadinessRing({ pct, label, tone, daysOut }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 45;
  const circumference = 2 * Math.PI * r;
  const days =
    daysOut == null
      ? null
      : daysOut === 0
        ? "Today"
        : daysOut === 1
          ? "Tomorrow"
          : daysOut > 1
            ? `${daysOut} days out`
            : "Wrapped";
  return (
    <div
      className="evd-ring"
      role="img"
      aria-label={`Overall readiness ${clamped}%, ${label}`}
    >
      <svg viewBox="0 0 100 100">
        <circle className="evd-ring-track" cx="50" cy="50" r={r} />
        <circle
          className="evd-ring-arc"
          cx="50"
          cy="50"
          r={r}
          stroke={TONE_STROKE[tone]}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <div className="evd-ring-core">
        <span className="evd-ring-pct">{clamped}%</span>
        <span className={`evd-ring-sub evd-tone-${tone}`}>{label}</span>
        {days ? <span className="evd-ring-sub">{days}</span> : null}
      </div>
    </div>
  );
}
