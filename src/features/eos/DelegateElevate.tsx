import { useState, type FormEvent } from "react";
import {
  useCreateDelegateElevateItem,
  useDelegateElevateItemMove,
  useDelegateElevateItemRemove,
  useListDelegateElevateItem,
} from "@/lib/manifest-convex-react";
import type { Doc } from "../../lib/api";
import { EosPanel, useRun } from "./EosShared";
import { QUADRANTS, type DelegateQuadrant } from "./eosModel";
import { useActivePeople, useEosViewer } from "./useEosData";

type Item = Doc<"delegateElevateItems">;

const TONE_CLASS = {
  ok: "eos-tone-data",
  info: "eos-tone-people",
  warn: "eos-tone-process",
  danger: "eos-tone-issues",
} as const;

/**
 * Delegate and Elevate: one person's activities in four boxes. Drag an
 * activity to another box (or pick the box from its menu); the bottom two
 * boxes are what to hand off.
 */
export function DelegateElevate() {
  const people = useActivePeople();
  const items = useListDelegateElevateItem();
  const { canEdit, myPersonId } = useEosViewer();
  const add = useCreateDelegateElevateItem();
  const move = useDelegateElevateItemMove();
  const remove = useDelegateElevateItemRemove();
  const { run, busy, banner } = useRun();
  const [chosen, setChosen] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<DelegateQuadrant | null>(null);

  if (!canEdit) return null;

  const personId =
    chosen ??
    (people.some((person) => person._id === myPersonId) ? myPersonId : null) ??
    people[0]?._id ??
    "";
  const mine = (items ?? []).filter((row) => String(row.personId) === personId);
  const toHandOff = mine.filter(
    (row) =>
      row.quadrant === "dislike_good" || row.quadrant === "dislike_not_good",
  ).length;

  const moveTo = (item: Item, quadrant: DelegateQuadrant) => {
    if (item.quadrant === quadrant) return;
    void run(() => move({ docId: item._id, version: item.version, quadrant }));
  };

  return (
    <EosPanel
      tone="people"
      id="delegate"
      eyebrow="People"
      title="Delegate and Elevate"
      lead={
        mine.length === 0
          ? "List what this person does each week, then sort it into the four boxes."
          : `${mine.length} activities · ${toHandOff} to hand off`
      }
      actions={
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Person
          <select
            className="input"
            value={personId}
            onChange={(event) => setChosen(event.target.value)}
          >
            {people.map((person) => (
              <option key={person._id} value={person._id}>
                {`${person.givenName} ${person.familyName}`.trim()}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {banner}
      <div className="eos-quadrants">
        {QUADRANTS.map((box) => {
          const inBox = mine.filter((row) => row.quadrant === box.quadrant);
          return (
            <div
              key={box.quadrant}
              className={`eos-quadrant ${TONE_CLASS[box.tone]}${over === box.quadrant ? " is-target" : ""}`}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                setOver(box.quadrant);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(event) => {
                event.preventDefault();
                const item = mine.find((row) => row._id === dragging);
                if (item) moveTo(item, box.quadrant);
                setDragging(null);
                setOver(null);
              }}
            >
              <h4>{box.title}</h4>
              <p>{box.hint}</p>
              <div className="eos-chip-row">
                {inBox.map((item) => (
                  <span
                    key={item._id}
                    className="eos-activity"
                    draggable
                    onDragStart={() => setDragging(item._id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  >
                    {item.activity}
                    <select
                      className="eos-icon-btn w-6 cursor-pointer appearance-none text-center"
                      aria-label={`Move ${item.activity}`}
                      value=""
                      disabled={busy}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "remove")
                          void run(() =>
                            remove({ docId: item._id, version: item.version }),
                          );
                        else if (value) moveTo(item, value as DelegateQuadrant);
                      }}
                    >
                      <option value="">⋯</option>
                      {QUADRANTS.filter(
                        (other) => other.quadrant !== box.quadrant,
                      ).map((other) => (
                        <option key={other.quadrant} value={other.quadrant}>
                          Move to: {other.title}
                        </option>
                      ))}
                      <option value="remove">Remove</option>
                    </select>
                  </span>
                ))}
              </div>
              <AddActivity
                disabled={busy || !personId}
                label={box.title}
                onAdd={(activity) =>
                  run(() => add({ personId, activity, quadrant: box.quadrant }))
                }
              />
            </div>
          );
        })}
      </div>
    </EosPanel>
  );
}

function AddActivity({
  disabled,
  label,
  onAdd,
}: {
  disabled: boolean;
  label: string;
  onAdd: (activity: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const activity = draft.trim();
    if (!activity) return;
    void onAdd(activity).then((ok) => {
      if (ok) setDraft("");
    });
  };
  return (
    <form className="eos-add" onSubmit={submit}>
      <input
        className="input"
        aria-label={`Add an activity to ${label}`}
        placeholder="Add an activity"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button className="btn btn-ghost" disabled={disabled || !draft.trim()}>
        Add
      </button>
    </form>
  );
}
