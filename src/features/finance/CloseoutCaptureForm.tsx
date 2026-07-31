import { useRef, type FormEvent } from "react";

type EventOption = {
  _id: string;
  title?: string | null;
  expectedHeadcount?: number | null;
  quotedPrice?: number | null;
  budgetAmount?: number | null;
};

export type LaborSummary = {
  cost: number;
  totalMinutes: number;
  unpricedMinutes: number;
  recordCount: number;
  peopleMissingRates: string[];
};

/** Existing draft closeout being re-captured (reconciled) instead of created. */
export type CloseoutDraft = {
  _id: string;
  version: number;
  eventId: string;
  actualRevenue?: number | null;
  budgetedRevenue?: number | null;
  actualIngredientCost?: number | null;
  actualWasteCost?: number | null;
  actualLaborCost?: number | null;
  actualVendorCost?: number | null;
  budgetedCost?: number | null;
  expectedHeadcount?: number | null;
  actualHeadcount?: number | null;
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

function LaborProvenance({
  labor,
}: {
  labor: LaborSummary | null | undefined;
}) {
  if (labor === undefined) {
    return <span className="text-xs text-ink-3">Loading clocked time…</span>;
  }
  if (labor === null) {
    return (
      <span className="text-xs text-ink-3">
        Clocked-time totals are available to finance, event, and workforce
        managers.
      </span>
    );
  }
  if (labor.recordCount === 0) {
    return (
      <span className="text-xs text-warn">
        No clocked time is attached to this event — staff clock-ins link to it
        via their assigned shift. Enter labor manually if time was not tracked.
      </span>
    );
  }
  return (
    <span className="text-xs text-ink-3">
      {labor.recordCount} clocked shift{labor.recordCount === 1 ? "" : "s"} ·{" "}
      {(labor.totalMinutes / 60).toFixed(1)} h · ${labor.cost.toFixed(2)}
      {labor.peopleMissingRates.length > 0 ? (
        <span className="text-warn">
          {" "}
          — no pay rate set for {labor.peopleMissingRates.join(", ")} (their
          hours are priced at $0; set rates under Admin → Permissions)
        </span>
      ) : null}
    </span>
  );
}

export function CloseoutCaptureForm({
  events,
  selectedEventId,
  onSelectEvent,
  labor,
  draft,
  busy,
  onSubmit,
}: {
  events: EventOption[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  labor: LaborSummary | null | undefined;
  /** When set, the form reconciles this existing draft closeout. */
  draft: CloseoutDraft | null;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const laborInputRef = useRef<HTMLInputElement>(null);

  if (events.length === 0) {
    return (
      <form className="supply-form" onSubmit={(e) => e.preventDefault()}>
        <div className="supply-form-heading">
          <div>
            <p className="eyebrow">Capture</p>
            <h2>Event closeout</h2>
          </div>
        </div>
        <p className="text-base text-ink-2">
          No closed-out events are waiting for capture. Complete and close out
          an event from Events first.
        </p>
      </form>
    );
  }

  const defaults = events[0]!;
  const eventId = selectedEventId ?? String(draft?.eventId ?? defaults._id);
  const selected = events.find((event) => event._id === eventId) ?? defaults;
  const laborDefault =
    draft?.actualLaborCost != null && Number(draft.actualLaborCost) > 0
      ? Number(draft.actualLaborCost)
      : (labor?.cost ?? 0);

  return (
    <form className="supply-form" onSubmit={onSubmit} key={draft?._id ?? "new"}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">{draft ? "Reconcile" : "Capture"}</p>
          <h2>Event closeout</h2>
        </div>
      </div>
      <label className="field-label">
        Closed-out event
        <select
          className="input"
          name="eventId"
          required
          value={eventId}
          disabled={draft != null}
          onChange={(event) => onSelectEvent(event.target.value)}
        >
          {events.map((event) => (
            <option key={event._id} value={event._id}>
              {event.title || "Untitled event"}
            </option>
          ))}
        </select>
        {draft ? <input type="hidden" name="eventId" value={eventId} /> : null}
      </label>
      <div className="supply-form-grid">
        <label className="field-label">
          Actual revenue
          <input
            className="input"
            name="actualRevenue"
            type="number"
            min="0"
            step="0.01"
            required
            key={`rev:${eventId}`}
            defaultValue={String(
              draft?.actualRevenue || selected.quotedPrice || 0,
            )}
          />
        </label>
        <label className="field-label">
          Budgeted revenue
          <input
            className="input"
            name="budgetedRevenue"
            type="number"
            min="0"
            step="0.01"
            required
            key={`brev:${eventId}`}
            defaultValue={String(
              draft?.budgetedRevenue || selected.quotedPrice || 0,
            )}
          />
        </label>
        <label className="field-label">
          Budgeted cost
          <input
            className="input"
            name="budgetedCost"
            type="number"
            min="0"
            step="0.01"
            required
            key={`bcost:${eventId}`}
            defaultValue={String(
              draft?.budgetedCost || selected.budgetAmount || 0,
            )}
          />
        </label>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Ingredient cost
          <input
            className="input"
            name="actualIngredientCost"
            type="number"
            min="0"
            step="0.01"
            required
            key={`ing:${eventId}`}
            defaultValue={String(draft?.actualIngredientCost ?? 0)}
          />
        </label>
        <label className="field-label">
          Waste cost
          <input
            className="input"
            name="actualWasteCost"
            type="number"
            min="0"
            step="0.01"
            required
            key={`waste:${eventId}`}
            defaultValue={String(draft?.actualWasteCost ?? 0)}
          />
        </label>
        <label className="field-label">
          Labor cost
          <input
            ref={laborInputRef}
            className="input"
            name="actualLaborCost"
            type="number"
            min="0"
            step="0.01"
            required
            key={`labor:${eventId}:${labor === undefined ? "loading" : "ready"}`}
            defaultValue={laborDefault.toFixed(2)}
          />
          <LaborProvenance labor={labor} />
          {labor != null && labor.recordCount > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-1 self-start"
              onClick={() => {
                if (laborInputRef.current) {
                  laborInputRef.current.value = labor.cost.toFixed(2);
                }
              }}
            >
              Use clocked total (${labor.cost.toFixed(2)})
            </button>
          ) : null}
        </label>
        <label className="field-label">
          Vendor cost
          <input
            className="input"
            name="actualVendorCost"
            type="number"
            min="0"
            step="0.01"
            required
            key={`vendor:${eventId}`}
            defaultValue={String(draft?.actualVendorCost ?? 0)}
          />
        </label>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Expected headcount
          <input
            className="input"
            name="expectedHeadcount"
            type="number"
            min="0"
            required
            key={`ehc:${eventId}`}
            defaultValue={String(
              draft?.expectedHeadcount || selected.expectedHeadcount || 0,
            )}
          />
        </label>
        <label className="field-label">
          Actual headcount
          <input
            className="input"
            name="actualHeadcount"
            type="number"
            min="0"
            required
            key={`ahc:${eventId}`}
            defaultValue={String(
              draft?.actualHeadcount || selected.expectedHeadcount || 0,
            )}
          />
        </label>
      </div>
      <label className="field-label">
        Unresolved issues
        <textarea className="input" name="unresolvedIssues" rows={2} />
      </label>
      <label className="field-label">
        Performance notes
        <textarea className="input" name="performanceNotes" rows={2} />
      </label>
      <label className="field-label">
        Notes
        <textarea className="input" name="notes" rows={2} />
      </label>
      <div className="supply-row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy
            ? "Saving…"
            : draft
              ? "Save reconciled closeout"
              : "Capture closeout"}
        </button>
      </div>
    </form>
  );
}
