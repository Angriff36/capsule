import type { FormEvent } from "react";

type EventOption = {
  _id: string;
  title?: string | null;
  expectedHeadcount?: number | null;
  quotedPrice?: number | null;
  budgetAmount?: number | null;
};

const money = (value: FormDataEntryValue | null) => {
  const amount = Number(String(value ?? "").trim());
  return Number.isFinite(amount) ? amount : Number.NaN;
};

const int = (value: FormDataEntryValue | null) => {
  const amount = Number(String(value ?? "").trim());
  return Number.isFinite(amount) ? Math.trunc(amount) : Number.NaN;
};

/** Builds a capture payload with derived variance/profit fields. */
export class CloseoutCapturePayloadBuilder {
  fromForm(data: FormData) {
    const eventId = String(data.get("eventId") || "").trim();
    const actualRevenue = money(data.get("actualRevenue"));
    const budgetedRevenue = money(data.get("budgetedRevenue"));
    const actualIngredientCost = money(data.get("actualIngredientCost"));
    const actualWasteCost = money(data.get("actualWasteCost"));
    const actualLaborCost = money(data.get("actualLaborCost"));
    const actualVendorCost = money(data.get("actualVendorCost"));
    const budgetedCost = money(data.get("budgetedCost"));
    const expectedHeadcount = int(data.get("expectedHeadcount"));
    const actualHeadcount = int(data.get("actualHeadcount"));
    const amounts = [
      actualRevenue,
      budgetedRevenue,
      actualIngredientCost,
      actualWasteCost,
      actualLaborCost,
      actualVendorCost,
      budgetedCost,
      expectedHeadcount,
      actualHeadcount,
    ];
    if (!eventId || amounts.some((n) => Number.isNaN(n))) {
      throw new Error(
        "Select a closed-out event and fill every money/headcount field.",
      );
    }
    const totalActualCost =
      actualIngredientCost +
      actualWasteCost +
      actualLaborCost +
      actualVendorCost;
    return {
      eventId,
      actualRevenue,
      budgetedRevenue,
      revenueVariance: budgetedRevenue - actualRevenue,
      actualIngredientCost,
      actualWasteCost,
      actualLaborCost,
      actualVendorCost,
      budgetedCost,
      totalActualCost,
      costVariance: budgetedCost - totalActualCost,
      grossProfit: actualRevenue - totalActualCost,
      expectedHeadcount,
      actualHeadcount,
      unresolvedIssues:
        String(data.get("unresolvedIssues") || "").trim() || undefined,
      performanceNotes:
        String(data.get("performanceNotes") || "").trim() || undefined,
      notes: String(data.get("notes") || "").trim() || undefined,
    };
  }
}

export function CloseoutCaptureForm({
  events,
  busy,
  onSubmit,
}: {
  events: EventOption[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (events.length === 0) {
    return (
      <form className="supply-form" onSubmit={(e) => e.preventDefault()}>
        <div className="supply-form-heading">
          <div>
            <p className="eyebrow">Capture</p>
            <h2>Event closeout</h2>
          </div>
        </div>
        <p className="text-[13px] text-ink-2">
          No closed-out events are waiting for capture. Complete and close out
          an event from Events first.
        </p>
      </form>
    );
  }

  const defaults = events[0]!;

  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Capture</p>
          <h2>Event closeout</h2>
        </div>
      </div>
      <label>
        Closed-out event
        <select name="eventId" required defaultValue={defaults._id}>
          {events.map((event) => (
            <option key={event._id} value={event._id}>
              {event.title || "Untitled event"}
            </option>
          ))}
        </select>
      </label>
      <div className="supply-form-grid">
        <label>
          Actual revenue
          <input
            name="actualRevenue"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={String(defaults.quotedPrice ?? 0)}
          />
        </label>
        <label>
          Budgeted revenue
          <input
            name="budgetedRevenue"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={String(defaults.quotedPrice ?? 0)}
          />
        </label>
        <label>
          Budgeted cost
          <input
            name="budgetedCost"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={String(defaults.budgetAmount ?? 0)}
          />
        </label>
      </div>
      <div className="supply-form-grid">
        <label>
          Ingredient cost
          <input
            name="actualIngredientCost"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue="0"
          />
        </label>
        <label>
          Waste cost
          <input
            name="actualWasteCost"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue="0"
          />
        </label>
        <label>
          Labor cost
          <input
            name="actualLaborCost"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue="0"
          />
        </label>
        <label>
          Vendor cost
          <input
            name="actualVendorCost"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue="0"
          />
        </label>
      </div>
      <div className="supply-form-grid">
        <label>
          Expected headcount
          <input
            name="expectedHeadcount"
            type="number"
            min="0"
            required
            defaultValue={String(defaults.expectedHeadcount ?? 0)}
          />
        </label>
        <label>
          Actual headcount
          <input
            name="actualHeadcount"
            type="number"
            min="0"
            required
            defaultValue={String(defaults.expectedHeadcount ?? 0)}
          />
        </label>
      </div>
      <label>
        Unresolved issues
        <textarea name="unresolvedIssues" rows={2} />
      </label>
      <label>
        Performance notes
        <textarea name="performanceNotes" rows={2} />
      </label>
      <label>
        Notes
        <textarea name="notes" rows={2} />
      </label>
      <div className="supply-row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Capturing…" : "Capture closeout"}
        </button>
      </div>
    </form>
  );
}
