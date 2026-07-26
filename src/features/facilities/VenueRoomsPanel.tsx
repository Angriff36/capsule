import { useMemo, useState, type FormEvent } from "react";
import { type Id } from "../../lib/api";
import {
  useCreateVenueRoom,
  useVenueRoomRevise,
  useVenueRoomRemove,
  useListVenueRoom,
} from "../../lib/manifest-convex-react";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";

// Mirrors VenueRoomType (src/operations/venue-room.manifest).
const ROOM_TYPES: Record<string, string> = {
  ballroom: "Ballroom",
  dining: "Dining room",
  kitchen: "Prep kitchen",
  breakout: "Breakout / meeting",
  outdoor: "Outdoor space",
  other: "Other",
};

type RoomRow = {
  readonly _id: Id<"venueRooms">;
  readonly venueId: Id<"venues">;
  readonly name: string;
  readonly roomType: string;
  readonly capacity: number;
  readonly squareFootage?: number | null;
  readonly description?: string | null;
  readonly version: number;
  readonly deletedAt?: number | null;
};

type Draft = {
  readonly name: string;
  readonly roomType: string;
  readonly capacity: string;
  readonly squareFootage: string;
  readonly description: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  roomType: "other",
  capacity: "",
  squareFootage: "",
  description: "",
};

type Props = {
  readonly venueId: Id<"venues">;
};

/** Venue rooms/spaces panel (spec §8.1 "room/space details"). */
export function VenueRoomsPanel({ venueId }: Props) {
  const rooms = useListVenueRoom();
  const addRoom = useCreateVenueRoom();
  const reviseRoom = useVenueRoomRevise();
  const removeRoom = useVenueRoomRemove();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<RoomRow["_id"] | null>(null);
  const [edit, setEdit] = useState<Draft>(EMPTY_DRAFT);

  const venueRooms = useMemo(() => {
    const rows = (rooms ?? []) as RoomRow[];
    return rows
      .filter((row) => row.deletedAt == null && row.venueId === venueId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rooms, venueId]);

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const toCapacity = (value: string): number => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const toSquareFootage = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    void run("add", async () => {
      await addRoom({
        venueId,
        name: draft.name.trim(),
        roomType: draft.roomType,
        capacity: toCapacity(draft.capacity),
        squareFootage: toSquareFootage(draft.squareFootage),
        description: draft.description.trim() || undefined,
      });
      setDraft(EMPTY_DRAFT);
    });
  };

  const beginEdit = (row: RoomRow) => {
    setEditingId(row._id);
    setEdit({
      name: row.name,
      roomType: row.roomType,
      capacity: String(row.capacity ?? 0),
      squareFootage: row.squareFootage != null ? String(row.squareFootage) : "",
      description: row.description ?? "",
    });
  };

  const submitEdit = (row: RoomRow) => {
    if (!edit.name.trim()) return;
    void run(`revise:${row._id}`, async () => {
      await reviseRoom({
        docId: row._id,
        version: row.version,
        name: edit.name.trim(),
        roomType: edit.roomType,
        capacity: toCapacity(edit.capacity),
        squareFootage: toSquareFootage(edit.squareFootage),
        description: edit.description.trim() || undefined,
      });
      setEditingId(null);
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-ink">Rooms & Spaces</h3>
        <p className="text-[13px] text-ink-3">
          Bookable rooms and spaces within this venue (ballrooms, dining rooms,
          prep kitchens, outdoor areas).
        </p>
      </div>

      {failure ? <FailureBanner failure={failure} /> : null}

      <form
        className="space-y-3 rounded-sm border border-line-2 bg-panel p-3"
        onSubmit={submitAdd}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="field-label">
            <span>Name</span>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Grand Ballroom"
              required
            />
          </label>

          <label className="field-label">
            <span>Type</span>
            <select
              className="input"
              value={draft.roomType}
              onChange={(e) => setDraft({ ...draft, roomType: e.target.value })}
            >
              {Object.entries(ROOM_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            <span>Capacity (guests)</span>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.capacity}
              onChange={(e) => setDraft({ ...draft, capacity: e.target.value })}
              placeholder="0"
            />
          </label>

          <label className="field-label">
            <span>Sq. ft.</span>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.squareFootage}
              onChange={(e) =>
                setDraft({ ...draft, squareFootage: e.target.value })
              }
              placeholder="optional"
            />
          </label>
        </div>

        <label className="field-label">
          <span>Description</span>
          <textarea
            className="input min-h-[3rem] py-2"
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
            placeholder="optional notes — layout, access, AV, restrictions"
          />
        </label>

        <button
          type="submit"
          className="btn btn-primary min-h-10"
          disabled={busy != null || !draft.name.trim()}
        >
          Add room
        </button>
      </form>

      <ul className="divide-y divide-line-2 rounded-sm border border-line-2 bg-panel">
        {venueRooms.map((row) => (
          <li key={row._id} className="px-3 py-2.5">
            {editingId === row._id ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    className="input"
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                  <select
                    className="input"
                    value={edit.roomType}
                    onChange={(e) =>
                      setEdit({ ...edit, roomType: e.target.value })
                    }
                  >
                    {Object.entries(ROOM_TYPES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={edit.capacity}
                    onChange={(e) =>
                      setEdit({ ...edit, capacity: e.target.value })
                    }
                    aria-label="Capacity (guests)"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={edit.squareFootage}
                    onChange={(e) =>
                      setEdit({ ...edit, squareFootage: e.target.value })
                    }
                    aria-label="Square footage"
                  />
                </div>
                <textarea
                  className="input min-h-[3rem] py-2"
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                  aria-label="Description"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy != null || !edit.name.trim()}
                    onClick={() => submitEdit(row)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">
                      {row.name}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-ink-3">
                      {ROOM_TYPES[row.roomType] || row.roomType}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-3">
                    Capacity {row.capacity ?? 0}
                    {row.squareFootage != null
                      ? ` · ${row.squareFootage} sq. ft.`
                      : ""}
                  </p>
                  {row.description ? (
                    <p className="mt-1 text-[13px] text-ink whitespace-pre-wrap">
                      {row.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-2"
                    disabled={busy != null}
                    onClick={() => beginEdit(row)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-rose-600"
                    disabled={busy != null}
                    onClick={() =>
                      void run(`rmv:${row._id}`, () =>
                        removeRoom({ docId: row._id, version: row.version }),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {venueRooms.length === 0 ? (
          <li className="px-3 py-3 text-[13px] text-ink-3">
            No rooms yet. Add the spaces within this venue that events book.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
