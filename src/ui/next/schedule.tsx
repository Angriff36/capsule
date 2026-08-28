import React, { useMemo, useState } from "react";
import "./next.css";

/* ============================================================================
   StageRail — the event pipeline as one control
   Capsule renders its nine stages as a row of dots. That shows position but not
   the two things an operator needs: what is blocking the next move, and what
   each stage is waiting on. This is a chevron rail where the current stage
   carries its own blocker count.
   ========================================================================== */

export interface Stage {
  id: string;
  label: string;
  /** e.g. "3 checks", "waiting on client" */
  note?: string;
  blocked?: boolean;
}

export function StageRail({
  stages,
  current,
  onSelect,
}: {
  stages: Stage[];
  current: string;
  onSelect?: (id: string) => void;
}) {
  const currentIndex = stages.findIndex((s) => s.id === current);
  return (
    <div className="cx cx-stagerail" role="list" aria-label="Event pipeline">
      {stages.map((s, i) => {
        const state = s.blocked
          ? "blocked"
          : i < currentIndex
            ? "done"
            : i === currentIndex
              ? "current"
              : "todo";
        return (
          <button
            key={s.id}
            role="listitem"
            className={`cx-stage${state !== "todo" ? ` cx-stage-${state}` : ""}`}
            aria-current={i === currentIndex ? "step" : undefined}
            onClick={() => onSelect?.(s.id)}
            style={{ cursor: onSelect ? "pointer" : "default" }}
          >
            {s.label}
            {s.note && <small>{s.note}</small>}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   StageBoard — the pipeline as a board you can move work across
   Drag a card between columns to change stage. Columns carry a count and an
   optional load warning, because "eleven events all sitting in Approval" is the
   signal a list view buries.
   ========================================================================== */

export interface BoardCard {
  id: string;
  title: string;
  meta?: string;
  /** Small state chips shown at the bottom of the card. */
  flags?: { label: string; tone?: "ok" | "warn" | "danger" | "info" }[];
}

const FLAG_STYLE: Record<string, React.CSSProperties> = {
  ok: { background: "var(--color-ok-soft)", color: "var(--color-ok)" },
  warn: { background: "var(--color-warn-soft)", color: "var(--color-warn)" },
  danger: {
    background: "var(--color-danger-soft)",
    color: "var(--color-danger)",
  },
  info: { background: "var(--color-info-soft)", color: "var(--color-info)" },
};

export function StageBoard({
  columns,
  cards,
  onMove,
  onOpen,
  limit,
}: {
  columns: { id: string; label: string }[];
  cards: (BoardCard & { column: string })[];
  onMove?: (cardId: string, toColumn: string) => void;
  onOpen?: (cardId: string) => void;
  /** Flag a column when it holds more than this. */
  limit?: number;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  return (
    <div className="cx cx-board">
      {columns.map((col) => {
        const list = cards.filter((c) => c.column === col.id);
        const overloaded = limit != null && list.length > limit;
        return (
          <section
            key={col.id}
            className="cx-col"
            data-over={over === col.id || undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.id);
            }}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              if (dragging) onMove?.(dragging, col.id);
              setDragging(null);
            }}
            aria-label={`${col.label}, ${list.length} events`}
          >
            <header className="cx-col-head">
              <span className="cx-col-title">{col.label}</span>
              <span
                className="cx-col-n"
                style={
                  overloaded
                    ? { color: "var(--color-danger)", fontWeight: 700 }
                    : undefined
                }
              >
                {list.length}
                {overloaded ? " ⚠" : ""}
              </span>
            </header>
            <div className="cx-col-body">
              {list.map((c) => (
                <article
                  key={c.id}
                  className="cx-card"
                  draggable
                  data-dragging={dragging === c.id || undefined}
                  onDragStart={() => setDragging(c.id)}
                  onDragEnd={() => setDragging(null)}
                  onDoubleClick={() => onOpen?.(c.id)}
                >
                  <div className="cx-card-title">{c.title}</div>
                  {c.meta && <div className="cx-card-meta">{c.meta}</div>}
                  {c.flags && c.flags.length > 0 && (
                    <div className="cx-card-flags">
                      {c.flags.map((f) => (
                        <span
                          key={f.label}
                          style={{
                            ...(FLAG_STYLE[f.tone ?? "info"] ?? {}),
                            padding: "1px 8px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {f.label}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              {list.length === 0 && (
                <div
                  style={{
                    padding: 14,
                    textAlign: "center",
                    color: "var(--color-ink-3)",
                    fontSize: 13,
                  }}
                >
                  Drop here
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ============================================================================
   ServiceTimeline — one day, several lanes
   This is the view a catering operation actually runs on and Capsule has no
   version of it. Kitchen prep, load-out, staff call times and service all
   compete for the same hours; a list cannot show that they overlap. Blocks are
   positioned on a real minute scale, with a now-line.
   ========================================================================== */

export interface TimelineBlock {
  id: string;
  lane: string;
  label: string;
  /** Minutes from midnight. */
  start: number;
  end: number;
  kind?: "prep" | "service" | "move" | "risk";
  detail?: string;
}

function hhmm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ampm}`;
}

export function ServiceTimeline({
  lanes,
  blocks,
  from = 6 * 60,
  to = 24 * 60,
  now,
  onSelect,
}: {
  lanes: string[];
  blocks: TimelineBlock[];
  /** Window in minutes from midnight. */
  from?: number;
  to?: number;
  now?: number;
  onSelect?: (block: TimelineBlock) => void;
}) {
  const span = to - from;
  const pct = (min: number) => ((min - from) / span) * 100;
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = Math.ceil(from / 120) * 120; t < to; t += 120) out.push(t);
    return out;
  }, [from, to]);

  return (
    <div className="cx cx-tl">
      <div className="cx-tl-grid">
        <div
          style={{
            borderRight: "1px solid var(--color-line)",
            borderBottom: "1px solid var(--color-line-2)",
            background: "var(--color-inset)",
            height: 26,
          }}
        />
        <div className="cx-tl-head">
          {ticks.map((t) => (
            <span key={t} className="cx-tl-tick" style={{ left: `${pct(t)}%` }}>
              {hhmm(t)}
            </span>
          ))}
        </div>

        {lanes.map((lane) => (
          <React.Fragment key={lane}>
            <div className="cx-tl-lane-label">{lane}</div>
            <div className="cx-tl-lane">
              {now != null && now >= from && now <= to && (
                <span
                  className="cx-tl-now"
                  style={{ left: `${pct(now)}%` }}
                  aria-label="Now"
                />
              )}
              {blocks
                .filter((b) => b.lane === lane)
                .map((b) => (
                  <button
                    key={b.id}
                    className={`cx-tl-block cx-tl-${b.kind ?? "prep"}`}
                    style={{
                      left: `${pct(b.start)}%`,
                      width: `${((b.end - b.start) / span) * 100}%`,
                    }}
                    title={`${b.label} · ${hhmm(b.start)}–${hhmm(b.end)}${b.detail ? ` · ${b.detail}` : ""}`}
                    onClick={() => onSelect?.(b)}
                  >
                    <b>{b.label}</b>
                  </button>
                ))}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   CoverageGrid — where the week is over-committed
   app.css already declares --capacity-* tokens that nothing renders. This is
   the view they were for: resource against day, shaded by load, so you can see
   Saturday needs four more servers before anyone promises a client anything.
   ========================================================================== */

export interface CoverageCell {
  /** 0 none · 1 light · 2 healthy · 3 tight · 4 over */
  level: 0 | 1 | 2 | 3 | 4;
  label?: string;
  title?: string;
}

export function CoverageGrid({
  columns,
  rows,
  legend = ["Idle", "Light", "Healthy", "Tight", "Over"],
}: {
  columns: string[];
  rows: { label: string; cells: CoverageCell[] }[];
  legend?: string[];
}) {
  return (
    <div
      className="cx cx-cov"
      style={
        {
          ["--cx-cov-cols" as string]: String(columns.length),
        } as React.CSSProperties
      }
    >
      <div className="cx-cov-row cx-cov-head">
        <div className="cx-cov-label">Resource</div>
        {columns.map((c) => (
          <div key={c} className="cx-cov-cell">
            {c}
          </div>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="cx-cov-row">
          <div className="cx-cov-label">{r.label}</div>
          {r.cells.map((cell, i) => (
            <div
              key={i}
              className={`cx-cov-cell cx-cov-${cell.level}`}
              title={
                cell.title ??
                `${r.label} · ${columns[i]} · ${legend[cell.level]}`
              }
            >
              {cell.label ?? ""}
            </div>
          ))}
        </div>
      ))}
      <div className="cx-cov-legend">
        {legend.map((l, i) => (
          <span
            key={l}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <span className={`cx-cov-key cx-cov-${i}`} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
