import { useMemo, useState } from "react";
import {
  assetTagFor,
  parseEquipmentPackList,
  type ParsedEquipmentLine,
} from "./equipmentPackListParser";
import { missingStandardEquipment } from "./equipmentStandardCatalog";

export type RegisterEquipmentArgs = {
  name: string;
  assetTag: string;
  category: string;
  ownership: "owned" | "rented";
  quantity: number;
};

type Props = {
  existing: ReadonlyArray<{ name: string; assetTag: string }> | undefined;
  busy: boolean;
  /** Registers one catalog row; the panel calls it once per line. */
  register: (args: RegisterEquipmentArgs) => Promise<unknown>;
  onDone: (added: number) => void;
  onClose: () => void;
};

/**
 * Paste a pack list (or add the standard catering kit) and the catalog gets
 * every line as a real, reservable item — no more hand-registering dozens of
 * tents, tarps and chafers one form at a time (#368 item 16).
 */
export function EquipmentBulkAddPanel({
  existing,
  busy,
  register,
  onDone,
  onClose,
}: Props) {
  const [text, setText] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const parsed = useMemo(() => parseEquipmentPackList(text), [text]);
  const existingNames = useMemo(
    () => new Set((existing ?? []).map((row) => row.name.trim().toLowerCase())),
    [existing],
  );
  const fresh = parsed.filter(
    (row) => !existingNames.has(row.name.toLowerCase()),
  );
  const alreadyThere = parsed.length - fresh.length;
  const standardMissing = useMemo(
    () => missingStandardEquipment(existing),
    [existing],
  );

  const addRows = async (rows: ParsedEquipmentLine[]) => {
    const taken = new Set((existing ?? []).map((row) => row.assetTag));
    let added = 0;
    try {
      for (const row of rows) {
        setProgress(`Adding ${added + 1} of ${rows.length} — ${row.name}`);
        await register({
          name: row.name,
          assetTag: assetTagFor(row.name, taken),
          category: row.category,
          ownership: row.ownership,
          quantity: row.quantity,
        });
        added += 1;
      }
    } catch {
      // The caller has already shown the failure; the rows that landed stay
      // in the catalog and the rest are still in the box to retry.
      setProgress(null);
      return;
    }
    setProgress(null);
    setText("");
    onDone(added);
  };

  return (
    <section className="supply-form space-y-4" data-testid="equipment-bulk-add">
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Equipment</p>
          <h2>Add many at once</h2>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {standardMissing.length > 0 ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            <span className="font-semibold text-ink">
              Standard catering kit — {standardMissing.length} items not in your
              catalog yet
            </span>{" "}
            (grill, propane, tents, chafers, hotel pans, linens, handwashing
            station, coolers, tables…). Adds them as owned items with starting
            counts; recount or retire any later.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void addRows(standardMissing)}
            data-testid="equipment-add-standard"
          >
            Add the standard kit
          </button>
        </div>
      ) : null}

      <label className="field-label">
        Paste a pack list
        <textarea
          className="input min-h-40 py-2 font-mono text-sm"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={busy}
          placeholder={
            "Equipment:\n2 x 10x10 Tent\nBig John Grill\nPropane tanks (4)\nRentals:\nRound table 60in x 5"
          }
          data-testid="equipment-paste"
        />
        <span className="field-hint">
          One item per line. A line ending in “:” names the section (its
          category; “Rentals” marks items as rented). Quantity as “2 x”, “x 6”
          or “(4)”. Tab- or pipe-separated name | qty | category also works.
        </span>
      </label>

      {parsed.length > 0 ? (
        <div className="space-y-2">
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Ownership</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((row) => {
                  const dup = existingNames.has(row.name.toLowerCase());
                  return (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.category}</td>
                      <td>{row.ownership}</td>
                      <td className="supply-number">{row.quantity}</td>
                      <td className="text-ink-3">
                        {dup ? "Already in catalog — skipped" : "New"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || fresh.length === 0}
              onClick={() => void addRows(fresh)}
              data-testid="equipment-add-parsed"
            >
              Add {fresh.length} item{fresh.length === 1 ? "" : "s"}
            </button>
            {alreadyThere > 0 ? (
              <span className="text-sm text-ink-3">
                {alreadyThere} already in the catalog, left alone.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {progress ? (
        <p className="text-sm text-ink-2" role="status">
          {progress}
        </p>
      ) : null}
    </section>
  );
}
