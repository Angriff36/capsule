import { useState, type DragEvent, type ReactNode } from "react";
import type { EventStaffNeedRow } from "../EventStaffingCoverageView";
import type { StaffingRosterEntry } from "../eventTimelineStaffRoster";
import { EventTimelineStaffRoster } from "../eventTimelineStaffRoster";
import {
  GROUPS,
  OVERTIME_HOURS,
  clock,
  groupOf,
  hourColumns,
  hourLabel,
  hoursOf,
  initialsOf,
  place,
  type RoleGroup,
  type Span,
} from "./shiftBoardModel";
import {
  ShiftBoardRoster,
  personFromDrag,
  type RosterPerson,
} from "./ShiftBoardRoster";
import {
  ShiftBoardSide,
  type Milestone,
  type Selected,
} from "./ShiftBoardSide";
import "./shiftBoard.css";

type Window = { startsAt?: number | null; endsAt?: number | null };

export interface ShiftBoardPerson {
  _id: string;
  deletedAt?: number | null;
  status?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  phone?: string | null;
}

export interface ShiftBoardActivity {
  _id: string;
  name: string;
  startsAt?: number | null;
  completedAt?: number | null;
  deletedAt?: number | null;
}

interface BoardShift {
  key: string;
  entry: StaffingRosterEntry;
  name: string;
  group: RoleGroup;
  span: Span | null;
  conflict: string | null;
}

const spanOf = (window: Window | undefined): Span | null =>
  window?.startsAt != null &&
  window.endsAt != null &&
  window.endsAt > window.startsAt
    ? { start: window.startsAt, end: window.endsAt }
    : null;

/**
 * The shift board (owner, 2026-10-14: "implement this screen on the event
 * staffing page", the Banani Shift Manager): who works when, by kind of work,
 * with open shifts to fill by dragging a person on, and the picked shift's
 * details beside it.
 */
export function ShiftBoard({
  roster,
  needs,
  people,
  activities,
  crewWindow,
  conflictsFor,
  canManage,
  busy,
  onAssign,
  onFill,
  onUnassign,
  onCancelNeed,
  timingControl,
}: {
  roster: StaffingRosterEntry[];
  needs: EventStaffNeedRow[];
  people: ShiftBoardPerson[];
  activities: ShiftBoardActivity[];
  crewWindow: Window;
  conflictsFor: (
    personId: string,
    windows?: readonly Window[],
  ) => { overlappingShifts: unknown[]; approvedOff: unknown[] };
  canManage: boolean;
  busy: boolean;
  onAssign: (personId: string, role: string, span: Span | null) => void;
  onFill: (need: EventStaffNeedRow, personId: string) => void;
  onUnassign: (entry: StaffingRosterEntry) => void;
  onCancelNeed: (need: EventStaffNeedRow) => void;
  timingControl: (kind: "assignment" | "need", docId: string) => ReactNode;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pickedPerson, setPickedPerson] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const crewSpan = spanOf(crewWindow);

  const conflictText = (personId: string, windows: readonly Window[]) => {
    const found = conflictsFor(personId, windows);
    const reasons = [
      found.overlappingShifts.length ? "on another shift then" : null,
      found.approvedOff.length ? "has approved time off" : null,
    ].filter(Boolean);
    return reasons.length ? `Also ${reasons.join(" and ")}` : null;
  };

  const shifts: BoardShift[] = roster.map((entry) => {
    const windows = entry.shiftWindows?.length
      ? entry.shiftWindows
      : (entry.plannedWindows ?? [entry]);
    const spans = windows
      .map(spanOf)
      .filter((span): span is Span => span != null);
    const span =
      spans.length > 0
        ? {
            start: Math.min(...spans.map((row) => row.start)),
            end: Math.max(...spans.map((row) => row.end)),
          }
        : crewSpan;
    return {
      key: entry.key,
      entry,
      name: entry.label,
      group: groupOf(entry.role),
      span,
      conflict: conflictText(entry.personId, windows),
    };
  });
  const open = needs.filter(
    (need) =>
      need.deletedAt == null &&
      (need.status === "open" || need.status === "claimed"),
  );

  const hours = hourColumns(
    [
      crewSpan,
      ...shifts.map((row) => row.span),
      ...open.map((need) => spanOf(need)),
    ].filter((span): span is Span => span != null),
  );

  const coverage = Object.fromEntries(
    GROUPS.map((group) => {
      const filled = shifts.filter((row) => row.group === group.key).length;
      const wanted =
        filled + open.filter((need) => groupOf(need.role) === group.key).length;
      return [group.key, { filled, wanted }];
    }),
  ) as Record<RoleGroup, { filled: number; wanted: number }>;
  const filled = shifts.length;
  const wanted = filled + open.length;
  const percent = wanted === 0 ? 100 : Math.round((filled / wanted) * 100);
  const overtime = shifts.filter(
    (row) => row.span && hoursOf(row.span) > OVERTIME_HOURS,
  );
  const clashes = shifts.filter((row) => row.conflict);
  const leads = shifts.filter((row) => row.group === "lead");

  const personRows: RosterPerson[] = people
    .filter((person) => person.deletedAt == null && person.status === "active")
    .map((person) => {
      const mine = shifts.filter((row) => row.entry.personId === person._id);
      const name = EventTimelineStaffRoster.labelFor(person);
      return {
        personId: person._id,
        name,
        role: mine[0]?.entry.role ?? "",
        assigned: mine.length > 0,
        hours: mine.length
          ? mine.reduce(
              (sum, row) => sum + (row.span ? hoursOf(row.span) : 0),
              0,
            )
          : null,
        conflict: mine.length
          ? (mine.find((row) => row.conflict)?.conflict ?? null)
          : crewSpan
            ? conflictText(person._id, [crewWindow])
            : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Assign the picked or dropped person to a row or an open shift.
  const assignTo = (
    personId: string,
    target: { group: RoleGroup } | { need: EventStaffNeedRow },
  ) => {
    if (!canManage) return;
    if ("need" in target) onFill(target.need, personId);
    else {
      const group = GROUPS.find((entry) => entry.key === target.group)!;
      onAssign(personId, group.role, crewSpan);
    }
    setPickedPerson(null);
  };
  const dropProps = (
    id: string,
    target: { group: RoleGroup } | { need: EventStaffNeedRow },
  ) =>
    canManage
      ? {
          onDragOver: (event: DragEvent) => {
            event.preventDefault();
            setDropTarget(id);
          },
          onDragLeave: () =>
            setDropTarget((current) => (current === id ? null : current)),
          onDrop: (event: DragEvent) => {
            event.preventDefault();
            setDropTarget(null);
            const personId = personFromDrag(event);
            if (personId) assignTo(personId, target);
          },
          "data-drop": dropTarget === id || undefined,
        }
      : {};

  // A person who filled an open shift is taken off through that shift.
  const filledNeedOf = (row: BoardShift) =>
    row.entry.unassign
      ? undefined
      : needs.find(
          (need) =>
            need.deletedAt == null &&
            need.status === "filled" &&
            need.filledByPersonId === row.entry.personId &&
            (need.role ?? "") === row.entry.role,
        );
  const selectedShift = shifts.find((row) => row.key === selectedKey);
  const selectedFilledNeed = selectedShift
    ? filledNeedOf(selectedShift)
    : undefined;
  const selectedNeed = open.find((need) => `need:${need._id}` === selectedKey);
  const selected: Selected | null = selectedShift
    ? {
        kind: "shift",
        key: selectedShift.key,
        name: selectedShift.name,
        role: selectedShift.entry.role,
        status: selectedShift.entry.status,
        span: selectedShift.span,
        notes: [...(selectedShift.entry.notes ?? [])],
        phone:
          people.find((person) => person._id === selectedShift.entry.personId)
            ?.phone ?? null,
        conflict: selectedShift.conflict,
        canRemove:
          selectedShift.entry.unassign != null || selectedFilledNeed != null,
        timing:
          selectedShift.entry.source === "assignment" &&
          selectedShift.entry.unassign
            ? timingControl("assignment", selectedShift.entry.unassign.docId)
            : selectedFilledNeed
              ? timingControl("need", selectedFilledNeed._id)
              : null,
      }
    : selectedNeed
      ? {
          kind: "open",
          id: selectedNeed._id,
          role: String(selectedNeed.role ?? ""),
          span: spanOf(selectedNeed),
          description: selectedNeed.description ?? null,
        }
      : null;

  const milestones: Milestone[] = activities
    .filter((row) => row.deletedAt == null && row.startsAt != null)
    .sort((a, b) => a.startsAt! - b.startsAt!)
    .map((row) => ({
      id: row._id,
      name: row.name,
      at: row.startsAt!,
      done: row.completedAt != null,
    }));

  const block = (row: BoardShift) => {
    const where = row.span ? place(row.span, hours) : { left: 0, width: 100 };
    return (
      <button
        key={row.key}
        type="button"
        className="sb-block"
        data-group={row.group}
        data-picked={selectedKey === row.key || undefined}
        data-warn={row.conflict != null || undefined}
        style={{ marginLeft: `${where.left}%`, width: `${where.width}%` }}
        onClick={() => setSelectedKey(row.key)}
        title={row.conflict ?? undefined}
      >
        <span className="sb-avatar sb-avatar-sm" aria-hidden="true">
          {initialsOf(row.name)}
        </span>
        <span className="min-w-0">
          <strong>{row.name}</strong>
          <small>
            {row.entry.role || "Crew"}
            {row.span
              ? ` · ${clock(row.span.start)}–${clock(row.span.end)}`
              : ""}
          </small>
        </span>
        {row.conflict ? <span aria-hidden="true">⚠</span> : null}
      </button>
    );
  };

  return (
    <div className="sb">
      <div className="sb-top">
        <dl className="sb-stats">
          <div>
            <dd>
              {filled}
              <span>/{wanted}</span>
            </dd>
            <dt>Shifts filled</dt>
          </div>
          <div data-tone={open.length > 0 ? "warn" : undefined}>
            <dd>{open.length}</dd>
            <dt>Open shifts</dt>
          </div>
          <div data-tone={wanted > 0 && percent >= 100 ? "ok" : undefined}>
            <dd>
              {wanted === 0 ? "—" : percent}
              {wanted === 0 ? null : <span>%</span>}
            </dd>
            <dt>Coverage</dt>
          </div>
        </dl>
        <ul className="sb-alerts">
          {open.length > 0 ? (
            <li data-tone="warn">
              ⚠ {open.length} open{" "}
              {open.length === 1 ? "shift needs" : "shifts need"} a person
              {crewSpan ? ` before ${clock(crewSpan.start)}` : ""}
            </li>
          ) : null}
          {overtime.length > 0 ? (
            <li data-tone="info">
              ◷ {overtime.map((row) => row.name).join(", ")}{" "}
              {overtime.length === 1 ? "is" : "are"} over {OVERTIME_HOURS}h
              (overtime)
            </li>
          ) : null}
          {clashes.length > 0 ? (
            <li data-tone="danger">
              ⚠ {clashes.length}{" "}
              {clashes.length === 1 ? "person is" : "people are"} booked
              elsewhere or off
            </li>
          ) : null}
          {leads.length > 0 &&
          leads.every((row) => row.entry.status === "confirmed") ? (
            <li data-tone="ok">✓ All leads confirmed</li>
          ) : null}
          {open.length === 0 &&
          overtime.length === 0 &&
          clashes.length === 0 &&
          wanted > 0 ? (
            <li data-tone="ok">✓ Every shift is covered</li>
          ) : null}
        </ul>
      </div>

      <div className="sb-legend" aria-hidden="true">
        {GROUPS.map((group) => (
          <span key={group.key} data-group={group.key}>
            {group.label}
          </span>
        ))}
      </div>

      <div className="sb-panes">
        <ShiftBoardRoster
          people={personRows}
          filled={filled}
          wanted={wanted}
          canManage={canManage}
          selectedPersonId={pickedPerson}
          onPick={(personId) => {
            const mine = shifts.find((row) => row.entry.personId === personId);
            if (mine) {
              setSelectedKey(mine.key);
              setPickedPerson(null);
            } else setPickedPerson(pickedPerson === personId ? null : personId);
          }}
        />

        <section className="sb-grid" aria-label="Shifts by time">
          {pickedPerson ? (
            <p className="sb-hint" role="status">
              Click a row or an open shift to put{" "}
              {personRows.find((row) => row.personId === pickedPerson)?.name} on
              it.
            </p>
          ) : null}
          {hours.length === 0 ? (
            <p className="sb-hint" role="status">
              No crew times yet. Set staff on and staff off on the Timeline tab,
              and the board lays shifts out by the hour.
            </p>
          ) : null}
          <div className="sb-scroll">
            <div className="sb-hours">
              <span />
              <div
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, hours.length)}, minmax(0, 1fr))`,
                }}
              >
                {hours.map((at) => (
                  <span key={at}>{hourLabel(at)}</span>
                ))}
              </div>
            </div>
            {GROUPS.map((group) => {
              const rows = shifts.filter((row) => row.group === group.key);
              if (rows.length === 0 && group.key === "other") return null;
              return (
                <div
                  key={group.key}
                  className="sb-row"
                  {...dropProps(`row:${group.key}`, { group: group.key })}
                >
                  <div className="sb-row-label" data-group={group.key}>
                    <span className="sb-dot" />
                    {group.label}
                  </div>
                  <div
                    className="sb-row-lanes"
                    onClick={(event) => {
                      if (pickedPerson && event.target === event.currentTarget)
                        assignTo(pickedPerson, { group: group.key });
                    }}
                    data-pickable={pickedPerson ? true : undefined}
                  >
                    {rows.map(block)}
                    {rows.length === 0 ? (
                      <span className="sb-empty-row">
                        {canManage
                          ? `Drop someone here to add a ${group.role.toLowerCase()}`
                          : "No one yet"}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="sb-row sb-row-open">
              <div className="sb-row-label" data-group="open">
                <span className="sb-dot" />
                Open shifts
              </div>
              <div className="sb-row-lanes">
                {open.length === 0 ? (
                  <span className="sb-empty-row">No open shifts.</span>
                ) : (
                  open.map((need) => {
                    const span = spanOf(need) ?? crewSpan;
                    const where = span
                      ? place(span, hours)
                      : { left: 0, width: 100 };
                    const id = `need:${need._id}`;
                    return (
                      <button
                        key={need._id}
                        type="button"
                        className="sb-open"
                        data-picked={selectedKey === id || undefined}
                        style={{
                          marginLeft: `${where.left}%`,
                          width: `${where.width}%`,
                        }}
                        {...dropProps(id, { need })}
                        onClick={() =>
                          pickedPerson
                            ? assignTo(pickedPerson, { need })
                            : setSelectedKey(id)
                        }
                      >
                        + Assign {String(need.role ?? "crew").toLowerCase()}
                        {need.status === "claimed" ? " (claimed)" : ""}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          {canManage ? (
            <p className="sb-drag-hint">
              ✥ Drag a person from the crew list onto a row or an open shift. Or
              click the person, then the shift.
            </p>
          ) : null}
        </section>

        <ShiftBoardSide
          selected={selected}
          coverage={coverage}
          milestones={milestones}
          people={personRows
            .filter((row) => !row.assigned)
            .map((row) => ({
              id: row.personId,
              label: `${row.name}${row.conflict ? " · busy" : ""}`,
            }))}
          canManage={canManage}
          busy={busy}
          onRemove={(key) => {
            const row = shifts.find((entry) => entry.key === key);
            const need = row ? filledNeedOf(row) : undefined;
            if (need) onCancelNeed(need);
            else if (row) onUnassign(row.entry);
            setSelectedKey(null);
          }}
          onFill={(needId, personId) => {
            const need = open.find((entry) => entry._id === needId);
            if (need) onFill(need, personId);
          }}
          onCancelOpen={(needId) => {
            const need = open.find((entry) => entry._id === needId);
            if (need) onCancelNeed(need);
          }}
        />
      </div>
    </div>
  );
}
