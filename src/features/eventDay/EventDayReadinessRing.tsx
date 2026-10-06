type Props = {
  readonly pct: number;
  readonly label: string;
  readonly tone: "ok" | "warn" | "danger";
  readonly daysOut: number | null;
};

const TONE_STROKE: Record<Props["tone"], string> = {
  ok: "var(--eday-ready)",
  warn: "var(--eday-review)",
  danger: "var(--eday-blocked)",
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
      className="eday-ring"
      role="img"
      aria-label={`Overall readiness ${clamped}%, ${label}`}
    >
      <svg viewBox="0 0 100 100">
        <circle className="eday-ring-track" cx="50" cy="50" r={r} />
        <circle
          className="eday-ring-arc"
          cx="50"
          cy="50"
          r={r}
          stroke={TONE_STROKE[tone]}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <div className="eday-ring-core">
        <span className="eday-ring-pct">{clamped}%</span>
        <span className={`eday-ring-sub eday-tone-${tone}`}>{label}</span>
        {days ? <span className="eday-ring-sub">{days}</span> : null}
      </div>
    </div>
  );
}
