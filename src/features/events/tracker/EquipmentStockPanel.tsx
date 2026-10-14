import { useState, type FormEvent } from "react";
import type { Doc } from "../../../lib/api";
import {
  useCreateEquipment,
  useEquipmentRecount,
} from "../../../lib/manifest-convex-react";
import {
  TRACKER_KIND_LABEL,
  trackerKind,
  type TrackerKind,
} from "./trackerBoardModel";

const KINDS: TrackerKind[] = ["equipment", "decor", "pack"];

type EquipmentRow = Doc<"equipments">;

/**
 * The equipment stockpile, edited from the tracker (owner, 2026-10-14: "add
 * and edit your equipment stockpiles right there"). Each line shows how many
 * the company has and how many this month's events hold at their busiest.
 */
export function EquipmentStockPanel({
  equipment,
  heldThisMonth,
  canEdit,
  run,
}: {
  equipment: readonly EquipmentRow[];
  /** Most units of each item held at one time by this month's events. */
  heldThisMonth: (equipmentId: string) => number;
  canEdit: boolean;
  run: (label: string, work: () => Promise<unknown>) => Promise<boolean>;
}) {
  const recount = useEquipmentRecount();
  const register = useCreateEquipment();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Catering Equipment");
  const [kind, setKind] = useState<TrackerKind>("equipment");
  const [count, setCount] = useState("1");
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const categories = [...new Set(equipment.map((row) => row.category))].sort();
  const shown = equipment
    .filter((row) => trackerKind(row.category) === kind)
    .filter(
      (row) =>
        needle === "" ||
        `${row.name} ${row.category}`.toLowerCase().includes(needle),
    )
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );

  const add = (event: FormEvent) => {
    event.preventDefault();
    const label = name.trim();
    const amount = Math.max(1, Math.round(Number(count) || 1));
    if (!label) return;
    void run(`${label} added to the stockpile`, () =>
      register({
        name: label,
        // Every piece needs a tag number; the office can change it later.
        assetTag: `EQ-${Date.now().toString(36).toUpperCase()}`,
        category: category.trim() || "Catering Equipment",
        ownership: "owned",
        quantity: amount,
      }),
    ).then((ok) => {
      if (ok) {
        setName("");
        setCount("1");
      }
    });
  };

  return (
    <section className="trk-panel" aria-labelledby="trk-stock-title">
      <div className="trk-panel-head">
        <div>
          <h2 id="trk-stock-title">Equipment stockpile</h2>
          <p>
            How many of each item the company has. Change a count in its box;
            add new items at the bottom.
          </p>
        </div>
        <input
          type="search"
          className="input trk-stock-find"
          placeholder="Find equipment"
          aria-label="Find equipment"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div
        className="trk-tabs trk-stock-tabs"
        role="tablist"
        aria-label="Kind of item"
      >
        {KINDS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={kind === key}
            onClick={() => setKind(key)}
          >
            {TRACKER_KIND_LABEL[key]}
            <span className="trk-count">
              {
                equipment.filter((row) => trackerKind(row.category) === key)
                  .length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="trk-stock">
        <div className="trk-stock-row trk-stock-head" aria-hidden="true">
          <span>Item</span>
          <span>Kind</span>
          <span>Held this month</span>
          <span>In stock</span>
        </div>
        {shown.length === 0 ? (
          <p className="trk-empty">
            {equipment.length === 0
              ? "No equipment yet. Add the first item below."
              : "No equipment matches."}
          </p>
        ) : null}
        {shown.map((row) => {
          const held = heldThisMonth(row._id);
          return (
            <div key={row._id} className="trk-stock-row">
              <span className="trk-stock-name">{row.name}</span>
              <span className="text-ink-3">{row.category}</span>
              <span
                className="trk-num"
                data-short={held > row.quantity || undefined}
              >
                {held}
              </span>
              <input
                className="input trk-num"
                type="number"
                min={0}
                key={`${row._id}:${row.quantity}`}
                defaultValue={row.quantity}
                disabled={!canEdit}
                aria-label={`How many ${row.name}`}
                onBlur={(event) => {
                  const next = Math.max(
                    0,
                    Math.round(Number(event.currentTarget.value) || 0),
                  );
                  if (next !== row.quantity)
                    void run(`${row.name} count saved`, () =>
                      recount({
                        docId: row._id,
                        version: row.version,
                        actualQuantity: next,
                      }),
                    );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </div>
          );
        })}
      </div>
      {canEdit ? (
        <form className="trk-stock-add" onSubmit={add}>
          <input
            className="input"
            placeholder="New item, e.g. Propane tank"
            aria-label="New equipment name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="input"
            placeholder="Kind, e.g. Tents"
            aria-label="New equipment kind"
            list="trk-stock-kinds"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
          <datalist id="trk-stock-kinds">
            {categories.map((entry) => (
              <option key={entry} value={entry} />
            ))}
          </datalist>
          <input
            className="input trk-num"
            type="number"
            min={1}
            aria-label="How many"
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>
      ) : null}
    </section>
  );
}
