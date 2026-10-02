import { useState, type FormEvent } from "react";
import { useMenuDishSchedulePriceChange } from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

// Plan a dish's new price from a date. From that day on, new quotes, new
// proposals and the public menu use it; proposals already sent keep the
// price they were sent with.

export type PlannableLine = {
  _id: string;
  version: number;
  dishName: string;
  sellingPrice?: number | null;
  scheduledSellingPrice?: number | null;
  scheduledPriceEffectiveAt?: number | null;
};

export function MenuPriceChangePlanner({
  lines,
  canEdit,
  onFailure,
  onDone,
}: Readonly<{
  lines: PlannableLine[];
  canEdit: boolean;
  onFailure: (error: unknown) => void;
  onDone: (message: string) => void;
}>) {
  const schedule = useMenuDishSchedulePriceChange();
  const [lineId, setLineId] = useState("");
  const [price, setPrice] = useState("");
  const [day, setDay] = useState("");
  const [saving, setSaving] = useState(false);
  const now = Date.now();
  const planned = lines.filter(
    (line) =>
      line.scheduledPriceEffectiveAt != null &&
      line.scheduledPriceEffectiveAt > now &&
      line.scheduledSellingPrice != null,
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const line = lines.find((l) => l._id === lineId);
    const amount = Number(price);
    if (!line || !day || !Number.isFinite(amount) || amount < 0) return;
    setSaving(true);
    onFailure(null);
    void (async () => {
      try {
        await schedule({
          docId: line._id,
          version: line.version,
          sellingPrice: amount,
          effectiveAt: new Date(`${day}T00:00:00`).getTime(),
        });
        onDone(
          `${line.dishName} goes to ${formatMoneyExact(amount)} on ${day}.`,
        );
        setPrice("");
        setDay("");
      } catch (error) {
        onFailure(error);
      } finally {
        setSaving(false);
      }
    })();
  };

  if (lines.length === 0) return null;

  return (
    <section
      className="culinary-section"
      aria-labelledby="menu-price-change-heading"
    >
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">Prices</p>
          <h2 id="menu-price-change-heading">Planned price changes</h2>
        </div>
        <span>Sent proposals keep their prices</span>
      </div>

      {planned.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-base">
          {planned.map((line) => (
            <li key={line._id}>
              {line.dishName}:{" "}
              {line.sellingPrice == null
                ? "no price"
                : formatMoneyExact(Number(line.sellingPrice))}{" "}
              → {formatMoneyExact(Number(line.scheduledSellingPrice))} from{" "}
              {new Date(line.scheduledPriceEffectiveAt!).toLocaleDateString()}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-base text-ink-3">No price changes planned.</p>
      )}

      <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={onSubmit}>
        <label className="field-label">
          <span>Dish</span>
          <select
            className="input"
            value={lineId}
            disabled={!canEdit || saving}
            onChange={(event) => setLineId(event.target.value)}
            required
          >
            <option value="">Pick a dish</option>
            {lines.map((line) => (
              <option key={line._id} value={line._id}>
                {line.dishName}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          <span>New price</span>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={price}
            disabled={!canEdit || saving}
            onChange={(event) => setPrice(event.target.value)}
            required
          />
        </label>
        <label className="field-label">
          <span>Starting on</span>
          <BoundedDateInput
            className="input"
            value={day}
            disabled={!canEdit || saving}
            onChange={(event) => setDay(event.target.value)}
            required
          />
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canEdit || saving}
          >
            {saving ? "Saving…" : "Plan price change"}
          </button>
        </div>
      </form>
    </section>
  );
}
