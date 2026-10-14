import { useState, type DragEvent } from "react";
import { SegmentedTabs } from "../../../ui/SegmentedTabs";
import { GROUPS, groupOf, initialsOf, type RoleGroup } from "./shiftBoardModel";

const SHOW_OPTIONS = [
  { value: "all", label: "All" },
  { value: "free", label: "Available" },
  { value: "on", label: "Assigned" },
] as const;

export interface RosterPerson {
  personId: string;
  name: string;
  /** Their role on this event, or the role they last worked. */
  role: string;
  assigned: boolean;
  /** Hours on this event when assigned. */
  hours: number | null;
  /** Why they may not be free (another shift, time off). */
  conflict: string | null;
}

const PERSON_MIME = "application/x-capsule-person";

export function personFromDrag(event: DragEvent): string | null {
  return event.dataTransfer.getData(PERSON_MIME) || null;
}

/**
 * The crew list beside the board: everyone active, split into who is free
 * and who is on this event. Drag a free person onto a row or an open shift.
 */
export function ShiftBoardRoster({
  people,
  filled,
  wanted,
  canManage,
  selectedPersonId,
  onPick,
}: {
  people: RosterPerson[];
  filled: number;
  wanted: number;
  canManage: boolean;
  selectedPersonId: string | null;
  onPick: (personId: string) => void;
}) {
  const [show, setShow] = useState<"all" | "free" | "on">("all");
  const [find, setFind] = useState("");
  const [group, setGroup] = useState<RoleGroup | null>(null);
  const needle = find.trim().toLowerCase();
  const match = (person: RosterPerson) =>
    (needle === "" ||
      `${person.name} ${person.role}`.toLowerCase().includes(needle)) &&
    (group == null || groupOf(person.role) === group);
  const free = people.filter((person) => !person.assigned && match(person));
  const on = people.filter((person) => person.assigned && match(person));
  const percent = wanted === 0 ? 0 : Math.round((filled / wanted) * 100);

  const card = (person: RosterPerson) => (
    <li
      key={person.personId}
      className="sb-person"
      data-group={groupOf(person.role)}
      data-picked={selectedPersonId === person.personId || undefined}
      draggable={canManage && !person.assigned}
      onDragStart={(event) => {
        event.dataTransfer.setData(PERSON_MIME, person.personId);
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <button
        type="button"
        className="sb-person-main"
        onClick={() => onPick(person.personId)}
        aria-pressed={selectedPersonId === person.personId}
        title={
          person.assigned
            ? "Show this person's shift"
            : canManage
              ? "Pick, then click an open shift or a row to assign"
              : undefined
        }
      >
        <span className="sb-avatar" aria-hidden="true">
          {initialsOf(person.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="sb-person-name">{person.name}</span>
          {person.role ? (
            <span className="sb-role" data-group={groupOf(person.role)}>
              {person.role}
            </span>
          ) : null}
        </span>
        <span
          className="sb-person-state"
          data-on={person.assigned || undefined}
          data-warn={person.conflict != null || undefined}
          title={person.conflict ?? undefined}
        >
          <strong>{person.assigned ? `${person.hours ?? 0}h` : "—"}</strong>
          {person.conflict ? "busy" : person.assigned ? "assigned" : "free"}
        </span>
      </button>
    </li>
  );

  return (
    <aside className="sb-roster" aria-label="Crew">
      <div className="sb-pane-head">
        <SegmentedTabs
          label="Show"
          size="sm"
          options={SHOW_OPTIONS}
          value={show}
          onChange={setShow}
        />
        <input
          type="search"
          className="input sb-find"
          placeholder="Find by name or role"
          aria-label="Find crew by name or role"
          value={find}
          onChange={(event) => setFind(event.target.value)}
        />
        <div className="sb-role-filter" aria-label="Filter by kind of work">
          {GROUPS.filter((entry) => entry.key !== "other").map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="sb-role"
              data-group={entry.key}
              aria-pressed={group === entry.key}
              onClick={() => setGroup(group === entry.key ? null : entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="sb-progress">
          <span>Staffing</span>
          <span data-done={filled >= wanted || undefined}>
            {filled}/{wanted}
          </span>
          <span className="sb-bar" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </span>
        </div>
      </div>
      <div className="sb-roster-lists">
        {show !== "on" ? (
          <section>
            <h3>
              Available <span>{free.length}</span>
            </h3>
            <ul>{free.map(card)}</ul>
          </section>
        ) : null}
        {show !== "free" ? (
          <section>
            <h3>
              On this event <span data-on>{on.length}</span>
            </h3>
            <ul>{on.map(card)}</ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
