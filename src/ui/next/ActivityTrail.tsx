import React from "react";
import "./next.css";

/* ============================================================================
   ActivityTrail — who changed the headcount, and from what
   When a plated count moves from 280 to 264 the day before service, somebody
   needs to know who did it and when. Capsule records mutations but shows them
   nowhere. Field changes render as an explicit before → after diff rather than
   prose, so the trail is scannable at a glance.
   ========================================================================== */

export interface TrailEntry {
  id: string;
  who: string;
  when: string;
  /** Free text for events with no field change: "Sent the BEO". */
  action?: string;
  field?: string;
  from?: string;
  to?: string;
  note?: string;
  tone?: "ok" | "warn" | "danger";
}

export function ActivityTrail({ entries }: { entries: TrailEntry[] }) {
  return (
    <div className="cx cx-trail">
      {entries.map((e) => (
        <div key={e.id} className="cx-trail-item">
          <span className={`cx-trail-dot ${e.tone ?? ""}`.trim()} />
          <div className="cx-trail-line">
            <span className="cx-trail-who">{e.who}</span>
            {e.field ? (
              <>
                <span style={{ color: "var(--color-ink-2)" }}>changed</span>
                <span style={{ fontWeight: 600 }}>{e.field}</span>
                <span className="cx-diff">
                  <span className="cx-diff-from">{e.from ?? "—"}</span>
                  <span style={{ color: "var(--color-ink-3)" }}>→</span>
                  <span className="cx-diff-to">{e.to ?? "—"}</span>
                </span>
              </>
            ) : (
              <span style={{ color: "var(--color-ink-2)" }}>{e.action}</span>
            )}
            <span className="cx-trail-when">{e.when}</span>
          </div>
          {e.note && <div className="cx-trail-note">{e.note}</div>}
        </div>
      ))}
    </div>
  );
}
