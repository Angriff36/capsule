import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  GROUPS,
  clock,
  groupOf,
  hoursOf,
  initialsOf,
  type RoleGroup,
  type Span,
} from "./shiftBoardModel";

export type Selected =
  | {
      kind: "shift";
      key: string;
      name: string;
      role: string;
      status: string;
      span: Span | null;
      notes: string[];
      phone: string | null;
      conflict: string | null;
      canRemove: boolean;
      timing: ReactNode;
    }
  | {
      kind: "open";
      id: string;
      role: string;
      span: Span | null;
      description: string | null;
    };

export interface Milestone {
  id: string;
  name: string;
  at: number;
  done: boolean;
}

/**
 * The board's right side: the picked shift (or open shift, with a person to
 * fill it), coverage by kind of work, and the event's run of show.
 */
export function ShiftBoardSide({
  selected,
  coverage,
  milestones,
  people,
  canManage,
  busy,
  onRemove,
  onFill,
  onCancelOpen,
}: {
  selected: Selected | null;
  coverage: Record<RoleGroup, { filled: number; wanted: number }>;
  milestones: Milestone[];
  people: { id: string; label: string }[];
  canManage: boolean;
  busy: boolean;
  onRemove: (key: string) => void;
  onFill: (needId: string, personId: string) => void;
  onCancelOpen: (needId: string) => void;
}) {
  const [fillWith, setFillWith] = useState("");
  const now = Date.now();
  const nextIndex = milestones.findIndex((row) => !row.done && row.at >= now);

  return (
    <aside className="sb-side" aria-label="Shift details">
      <section className="sb-side-block">
        <h3 className="sb-kicker">
          {selected?.kind === "open" ? "Open shift" : "Selected shift"}
        </h3>
        {selected == null ? (
          <p className="sb-muted">Click a shift on the board to see it here.</p>
        ) : selected.kind === "shift" ? (
          <>
            <div className="sb-who">
              <span className="sb-avatar sb-avatar-lg" aria-hidden="true">
                {initialsOf(selected.name)}
              </span>
              <div className="min-w-0">
                <strong>{selected.name}</strong>
                <span className="sb-role" data-group={groupOf(selected.role)}>
                  {selected.role || "Crew"}
                </span>
              </div>
              <span className="sb-status" data-status={selected.status}>
                {selected.status.replace(/_/g, " ")}
              </span>
            </div>
            <dl className="sb-facts">
              <div>
                <dt>Start</dt>
                <dd>
                  {selected.span ? clock(selected.span.start) : "Not set"}
                </dd>
              </div>
              <div>
                <dt>End</dt>
                <dd>{selected.span ? clock(selected.span.end) : "Not set"}</dd>
              </div>
              <div>
                <dt>Length</dt>
                <dd>{selected.span ? `${hoursOf(selected.span)}h` : "—"}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>
                  {selected.phone ? (
                    <a href={`tel:${selected.phone}`}>{selected.phone}</a>
                  ) : (
                    "Not on file"
                  )}
                </dd>
              </div>
            </dl>
            {selected.conflict ? (
              <p className="sb-warn">⚠ {selected.conflict}</p>
            ) : null}
            {selected.notes.length > 0 ? (
              <div className="sb-note">
                <span>Notes</span>
                {selected.notes.join(" · ")}
              </div>
            ) : null}
            {canManage ? (
              <div className="sb-edit">
                {selected.timing}
                {selected.canRemove ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm sb-danger"
                    disabled={busy}
                    onClick={() => onRemove(selected.key)}
                  >
                    Remove from event
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="sb-who">
              <span
                className="sb-avatar sb-avatar-lg sb-avatar-open"
                aria-hidden="true"
              >
                +
              </span>
              <div className="min-w-0">
                <strong>{selected.role || "Crew"}</strong>
                <span className="sb-muted">
                  {selected.span
                    ? `${clock(selected.span.start)} – ${clock(selected.span.end)}`
                    : "Times not set"}
                </span>
              </div>
            </div>
            {selected.description ? (
              <div className="sb-note">
                <span>Notes</span>
                {selected.description}
              </div>
            ) : null}
            {canManage ? (
              <div className="sb-edit">
                <select
                  className="input"
                  aria-label="Fill this shift with"
                  value={fillWith}
                  onChange={(event) => setFillWith(event.currentTarget.value)}
                >
                  <option value="">Pick a person</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm flex-1"
                    disabled={busy || !fillWith}
                    onClick={() => {
                      onFill(selected.id, fillWith);
                      setFillWith("");
                    }}
                  >
                    Fill shift
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm sb-danger"
                    disabled={busy}
                    onClick={() => onCancelOpen(selected.id)}
                  >
                    Cancel shift
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="sb-side-block">
        <h3 className="sb-kicker">Coverage</h3>
        {GROUPS.filter((group) => coverage[group.key].wanted > 0).map(
          (group) => {
            const row = coverage[group.key];
            return (
              <div key={group.key} className="sb-cover">
                <div>
                  <span>{group.label}</span>
                  <span>
                    {row.filled}/{row.wanted}
                  </span>
                </div>
                <span
                  className="sb-bar"
                  data-group={group.key}
                  aria-hidden="true"
                >
                  <span
                    style={{
                      width: `${Math.round((row.filled / row.wanted) * 100)}%`,
                    }}
                  />
                </span>
              </div>
            );
          },
        )}
        {GROUPS.every((group) => coverage[group.key].wanted === 0) ? (
          <p className="sb-muted">No crew or open shifts yet.</p>
        ) : null}
      </section>

      <section className="sb-side-block">
        <h3 className="sb-kicker">Event timeline</h3>
        {milestones.length === 0 ? (
          <p className="sb-muted">No timeline yet.</p>
        ) : (
          <ol className="sb-milestones">
            {milestones.map((row, index) => (
              <li
                key={row.id}
                data-done={row.done || undefined}
                data-next={index === nextIndex || undefined}
              >
                <span className="sb-dot" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <strong>{row.name}</strong>
                  <span>{clock(row.at)}</span>
                </span>
                {index === nextIndex ? <em>Next</em> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="sb-side-block">
        <h3 className="sb-kicker">Team messages</h3>
        <Link to="/staff/messages" className="btn btn-ghost btn-sm w-full">
          Message the crew
        </Link>
      </section>
    </aside>
  );
}
