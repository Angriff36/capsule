import { useState, type FormEvent } from "react";
import {
  useCreateItemUnitMapping,
  useItemUnitMappingRetire,
  useListItemUnitMapping,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import { SELECTABLE_UNITS } from "./import/UnitOfMeasureMapper";

/**
 * The closed vocabulary already holds the count units (case, package, can…)
 * that the manifest says convert "only through an ItemUnitMapping on the
 * specific item", so the mapping form offers that one list.
 */
const MAPPING_UNITS: readonly string[] = SELECTABLE_UNITS;

const KINDS: readonly { value: string; label: string; helper: string }[] = [
  {
    value: "pack",
    label: "Pack",
    helper: "A purchased pack holds this many base units — 1 case = 12 each.",
  },
  {
    value: "density",
    label: "Density",
    helper: "Weight of a volume — 1 cup = 240 gram.",
  },
  {
    value: "portion",
    label: "Portion",
    helper: "One served portion in base units — 1 portion = 6 ounce.",
  },
  {
    value: "yield",
    label: "Yield",
    helper:
      "What a quantity becomes after prep — 1 pound raw = 0.7 pound cooked.",
  },
];

const BASIS: readonly { value: string; label: string }[] = [
  { value: "as_purchased", label: "As purchased" },
  { value: "as_produced", label: "As produced" },
  { value: "raw", label: "Raw" },
  { value: "cooked", label: "Cooked" },
  { value: "unknown", label: "Unknown" },
];

function basisLabel(value: unknown) {
  return BASIS.find((item) => item.value === String(value))?.label ?? null;
}

function kindLabel(value: unknown) {
  return KINDS.find((item) => item.value === String(value))?.label ?? "Mapping";
}

/**
 * Unit conversions for one ingredient: what a purchased pack, a cup or a
 * portion of it equals in another unit.
 */
export function ItemUnitMappingsPanel({
  ingredientId,
  ingredientUnit,
  onFailure,
}: {
  ingredientId: string;
  ingredientUnit: string;
  onFailure: (error: unknown) => void;
}) {
  const mappings = useListItemUnitMapping();
  const recordMapping = useCreateItemUnitMapping();
  const retireMapping = useItemUnitMappingRetire();
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState("pack");

  const rows = (mappings ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.recordedAt != null &&
      row.ingredientId === ingredientId,
  );
  const helper =
    KINDS.find((item) => item.value === kind)?.helper ?? KINDS[0]!.helper;
  // An import-only unit on the ingredient still has to be offered, or the
  // select would quietly save a different unit than the catalog shows.
  const equalsUnits = MAPPING_UNITS.includes(ingredientUnit)
    ? MAPPING_UNITS
    : [ingredientUnit, ...MAPPING_UNITS];

  const run = async (key: string, work: () => Promise<unknown>) => {
    onFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const onAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const equalsQuantity = Number(data.get("equalsQuantity"));
    if (!Number.isFinite(equalsQuantity) || equalsQuantity <= 0) return;
    void run("add", async () => {
      await recordMapping({
        ingredientId,
        kind: String(data.get("kind") ?? "pack"),
        unit: String(data.get("unit") ?? "each"),
        equalsQuantity,
        equalsUnit: String(data.get("equalsUnit") ?? ingredientUnit),
        fromBasis: String(data.get("fromBasis") ?? "") || undefined,
        toBasis: String(data.get("toBasis") ?? "") || undefined,
        source: String(data.get("source") ?? "").trim() || undefined,
      });
      form.reset();
    });
  };

  const onRetire = (row: (typeof rows)[number]) => {
    void (async () => {
      const reason = (
        await prompt.askReason({
          title: "Retire unit conversion",
          description: `Stop converting 1 ${String(row.unit)} to ${row.equalsQuantity} ${String(row.equalsUnit)}.`,
          label: "Reason",
          confirmLabel: "Retire conversion",
          tone: "danger",
        })
      )?.trim();
      if (!reason) return;
      await run(`retire:${row._id}`, () =>
        retireMapping({ docId: row._id, version: row.version, reason }),
      );
    })();
  };

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Unit conversions</h2>
        <span>
          {mappings === undefined ? "Loading…" : `${rows.length} on file`}
        </span>
      </div>
      <p className="max-w-160 text-base text-ink-2">
        What one pack, cup or portion of this ingredient equals in another unit.
        Purchasing and recipes use these to cross units the catalog cannot
        convert on its own.
      </p>
      {host}
      {mappings === undefined ? (
        <TableSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>No unit conversion on file.</p>
          <span>
            Record one when a pack, a cup or a portion of this ingredient means
            a fixed amount.
          </span>
        </div>
      ) : (
        <ul className="ingredient-list">
          {rows.map((row) => (
            <li key={row._id}>
              <strong>
                1 {String(row.unit)} = {String(row.equalsQuantity)}{" "}
                {String(row.equalsUnit)}
              </strong>
              <span>{kindLabel(row.kind)}</span>
              <span>
                {[
                  basisLabel(row.fromBasis) && basisLabel(row.toBasis)
                    ? `${basisLabel(row.fromBasis)} → ${basisLabel(row.toBasis)}`
                    : null,
                  row.source || null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No source recorded"}
              </span>
              <div className="culinary-line-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => onRetire(row)}
                >
                  {busy === `retire:${row._id}` ? "Working…" : "Retire"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="culinary-line-form" onSubmit={onAdd}>
        <label className="field-label">
          Conversion kind
          <select
            name="kind"
            className="input"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            {KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          One of this unit
          <select name="unit" className="input" defaultValue="case">
            {MAPPING_UNITS.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Equals quantity
          <input
            name="equalsQuantity"
            type="number"
            min={0.000001}
            step="any"
            defaultValue={1}
            className="input"
            required
          />
        </label>
        <label className="field-label">
          Of this unit
          <select
            name="equalsUnit"
            className="input"
            defaultValue={ingredientUnit}
          >
            {equalsUnits.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          From basis
          <select name="fromBasis" className="input" defaultValue="">
            <option value="">Not stated</option>
            {BASIS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          To basis
          <select name="toBasis" className="input" defaultValue="">
            <option value="">Not stated</option>
            {BASIS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label sm:col-span-2">
          Source
          <input
            name="source"
            className="input"
            placeholder="Vendor sheet, case label, chef"
          />
        </label>
        <p className="text-sm text-ink-2 sm:col-span-2">{helper}</p>
        <button className="btn btn-primary self-end" disabled={busy != null}>
          {busy === "add" ? "Saving…" : "Record conversion"}
        </button>
      </form>
    </section>
  );
}
