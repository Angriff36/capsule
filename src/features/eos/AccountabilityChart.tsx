import { useState } from "react";
import {
  useAccountabilitySeatRemove,
  useAccountabilitySeatRevise,
  useCreateAccountabilitySeat,
  useListAccountabilitySeat,
} from "@/lib/manifest-convex-react";
import type { Doc } from "../../lib/api";
import { EosPanel, useRun } from "./EosShared";
import { STARTER_SEATS, initials, lines, personName } from "./eosModel";
import { useActivePeople, useEosViewer } from "./useEosData";

type Seat = Doc<"accountabilitySeats">;
type Person = ReturnType<typeof useActivePeople>[number];

/**
 * The Accountability Chart: jobs, not people, drawn as a tree. Each box
 * shows who does that job and its roles; click Edit to change it in place,
 * or "+ Job below" to grow the chart.
 */
export function AccountabilityChart() {
  const seats = useListAccountabilitySeat();
  const people = useActivePeople();
  const { canEdit } = useEosViewer();
  const create = useCreateAccountabilitySeat();
  const { run, busy, banner } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | "root" | null>(null);

  const live = (seats ?? []).filter((row) => row.placedAt != null);
  const ids = new Set(live.map((row) => String(row._id)));
  const childrenOf = (parent: string | null) =>
    live
      .filter((row) =>
        parent === null
          ? !row.parentSeatId || !ids.has(String(row.parentSeatId))
          : String(row.parentSeatId) === parent,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const startChart = () =>
    void run(async () => {
      const made: Record<string, string> = {};
      for (const [index, seat] of STARTER_SEATS.entries()) {
        const parentSeatId =
          seat.under === "none" ? undefined : made[seat.under];
        const result = (await create({
          title: seat.title,
          roles: seat.roles,
          parentSeatId,
          sortOrder: index,
        })) as { docId: string };
        made[seat.title.toLowerCase()] = result.docId;
      }
    });

  const open = live.filter((row) => !row.personId).length;

  const renderSeat = (seat: Seat) => {
    const id = String(seat._id);
    const kids = childrenOf(id);
    return (
      <li key={id}>
        {editing === id ? (
          <SeatEditor
            seat={seat}
            seats={live}
            people={people}
            busy={busy}
            run={run}
            onDone={() => setEditing(null)}
          />
        ) : (
          <SeatCard
            seat={seat}
            people={people}
            canEdit={canEdit}
            onEdit={() => setEditing(id)}
            onAdd={() => setAdding(id)}
          />
        )}
        {adding === id ? (
          <ul className="eos-tree">
            <li>
              <SeatEditor
                parentId={id}
                seats={live}
                people={people}
                busy={busy}
                run={run}
                nextOrder={kids.length}
                onDone={() => setAdding(null)}
              />
            </li>
          </ul>
        ) : null}
        {kids.length > 0 ? (
          <ul className="eos-tree">{kids.map(renderSeat)}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <EosPanel
      tone="people"
      id="chart"
      eyebrow="People"
      title="Accountability Chart"
      lead={
        seats === undefined
          ? "Loading…"
          : live.length === 0
            ? "Jobs first, then people. Who owns each part of Mangia?"
            : `${live.length} jobs · ${open === 0 ? "everyone named" : `${open} with no one yet`}`
      }
      actions={
        canEdit && live.length > 0 ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setAdding("root")}
          >
            + Top job
          </button>
        ) : null
      }
    >
      {banner}
      {seats !== undefined && live.length === 0 ? (
        <div className="grid gap-3">
          <p className="text-base text-ink-2">
            Start with five jobs: Visionary, Integrator, and the three functions
            under them. Rename them to fit Mangia.
          </p>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={startChart}
              >
                Start from the EOS chart
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAdding("root")}
              >
                Start blank
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="eos-chart">
        <ul className="eos-tree">
          {adding === "root" ? (
            <li>
              <SeatEditor
                seats={live}
                people={people}
                busy={busy}
                run={run}
                nextOrder={childrenOf(null).length}
                onDone={() => setAdding(null)}
              />
            </li>
          ) : null}
          {childrenOf(null).map(renderSeat)}
        </ul>
      </div>
    </EosPanel>
  );
}

function SeatCard({
  seat,
  people,
  canEdit,
  onEdit,
  onAdd,
}: {
  seat: Seat;
  people: readonly Person[];
  canEdit: boolean;
  onEdit: () => void;
  onAdd: () => void;
}) {
  const who = seat.personId ? personName(people, seat.personId) : null;
  return (
    <div className={`eos-seat${who ? "" : " is-open"}`}>
      <div className="eos-seat-head">
        <strong>{seat.title}</strong>
        <span className="eos-seat-person">
          {who ? (
            <>
              <span className="eos-avatar" aria-hidden="true">
                {initials(who)}
              </span>
              {who}
            </>
          ) : (
            <span className="text-warn">No one yet</span>
          )}
        </span>
      </div>
      {lines(seat.roles).length > 0 ? (
        <ul className="eos-roles">
          {lines(seat.roles).map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-2 text-sm text-ink-3">No roles written yet.</p>
      )}
      {canEdit ? (
        <div className="eos-seat-foot">
          <button
            type="button"
            className="btn-link btn-link-compact"
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn-link btn-link-compact"
            onClick={onAdd}
          >
            + Job below
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SeatEditor({
  seat,
  parentId,
  seats,
  people,
  busy,
  run,
  nextOrder = 0,
  onDone,
}: {
  seat?: Seat;
  parentId?: string;
  seats: readonly Seat[];
  people: readonly Person[];
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
  nextOrder?: number;
  onDone: () => void;
}) {
  const create = useCreateAccountabilitySeat();
  const revise = useAccountabilitySeatRevise();
  const remove = useAccountabilitySeatRemove();
  const [title, setTitle] = useState(seat?.title ?? "");
  const [personId, setPersonId] = useState(String(seat?.personId ?? ""));
  const [roles, setRoles] = useState(seat?.roles ?? "");
  const [parent, setParent] = useState(
    String(seat?.parentSeatId ?? parentId ?? ""),
  );
  // A seat can't report to itself or to a seat under it.
  const below = new Set<string>();
  if (seat) {
    const walk = (id: string) => {
      for (const row of seats)
        if (String(row.parentSeatId) === id && !below.has(String(row._id))) {
          below.add(String(row._id));
          walk(String(row._id));
        }
    };
    below.add(String(seat._id));
    walk(String(seat._id));
  }
  const roleCount = lines(roles).length;

  const save = () => {
    const fields = {
      title: title.trim(),
      roles: roles.trim() || undefined,
      personId: personId || undefined,
      parentSeatId: parent || undefined,
      sortOrder: seat?.sortOrder ?? nextOrder,
    };
    void run(() =>
      seat
        ? revise({ docId: seat._id, version: seat.version, ...fields })
        : create(fields),
    ).then((ok) => {
      if (ok) onDone();
    });
  };

  return (
    <form
      className="eos-seat grid gap-2 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className="field-label">
        Job title
        <input
          className="input"
          value={title}
          placeholder="e.g. Operations"
          required
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="field-label">
        Who does this job
        <select
          className="input"
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
        >
          <option value="">No one yet</option>
          {people.map((person) => (
            <option key={person._id} value={person._id}>
              {`${person.givenName} ${person.familyName}`.trim()}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Roles · one per line
        <textarea
          className="input"
          rows={5}
          value={roles}
          placeholder={"Role one\nRole two"}
          onChange={(event) => setRoles(event.target.value)}
        />
        <span
          className={roleCount > 5 ? "text-xs text-warn" : "text-xs text-ink-3"}
        >
          {roleCount} of about 5 roles
        </span>
      </label>
      <label className="field-label">
        Reports to
        <select
          className="input"
          value={parent}
          onChange={(event) => setParent(event.target.value)}
        >
          <option value="">No one (top of the chart)</option>
          {seats
            .filter((row) => !below.has(String(row._id)))
            .map((row) => (
              <option key={row._id} value={row._id}>
                {row.title}
              </option>
            ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={busy || !title.trim()}>
          Save
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        {seat ? (
          <button
            type="button"
            className="btn-link btn-link-compact ml-auto text-danger"
            disabled={busy}
            onClick={() =>
              void run(() =>
                remove({ docId: seat._id, version: seat.version }),
              ).then((ok) => {
                if (ok) onDone();
              })
            }
          >
            Remove job
          </button>
        ) : null}
      </div>
    </form>
  );
}
