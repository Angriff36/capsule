import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateIngredientDemand,
  useIngredientDemandFulfill,
  useIngredientDemandSupersede,
  useListEvent,
  useListIngredient,
  useListIngredientDemand,
  useListPurchaseNeed,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { HoverPreview } from "../../ui/HoverPreview";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { IngredientPreviewCard } from "../kitchen/IngredientPreviewCard";
import {
  DEFAULT_ANOMALY_THRESHOLD,
  computeDemandAnomalies,
} from "./demandAnomaly";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";

const UNITS = [
  "each",
  "gram",
  "kilogram",
  "ounce",
  "pound",
  "milliliter",
  "liter",
  "teaspoon",
  "tablespoon",
  "cup",
  "pint",
  "quart",
  "gallon",
  "portion",
] as const;

const policy = new SupplyLifecyclePolicy();

export function DemandLedgerPage() {
  const demands = useListIngredientDemand();
  const events = useListEvent();
  const ingredients = useListIngredient();
  const purchaseNeeds = useListPurchaseNeed();
  const createDemand = useCreateIngredientDemand();
  const fulfillDemand = useIngredientDemandFulfill();
  const supersedeDemand = useIngredientDemandSupersede();
  const [showCreate, setShowCreate] = useState(false);
  const [thresholdPct, setThresholdPct] = useState(
    Math.round(DEFAULT_ANOMALY_THRESHOLD * 100),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeDemands = (demands ?? []).filter(
    (demand) => demand.deletedAt == null,
  );
  const anomalies = useMemo(
    () => computeDemandAnomalies(demands, events, thresholdPct / 100),
    [demands, events, thresholdPct],
  );
  const eventName = (id: string) =>
    events?.find((event) => event._id === id)?.title ?? "Unknown event";
  const ingredientName = (id: string) =>
    ingredients?.find((ingredient) => ingredient._id === id)?.name ??
    "Unknown ingredient";
  const existingNeed = (demandId: string) =>
    purchaseNeeds?.find(
      (need) => need.deletedAt == null && need.ingredientDemandId === demandId,
    );

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitDemand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("create-demand", async () => {
      await createDemand({
        eventId: String(data.get("eventId")),
        ingredientId: String(data.get("ingredientId")),
        requiredQuantity: Number(data.get("requiredQuantity")),
        unit: String(data.get("unit")) as (typeof UNITS)[number],
      });
      form.reset();
      setShowCreate(false);
    });
  };

  const invokeDemandAction = (demand: any, key: string) => {
    void (async () => {
      if (key === "supersede") {
        const reason = await prompt.askReason({
          ...ReasonCopy.supersedeDemand,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${demand._id}:${key}`, async () => {
          await supersedeDemand({
            docId: demand._id,
            version: demand.version,
            reason,
          });
        });
        return;
      }
      void run(`${demand._id}:${key}`, async () => {
        const args = { docId: demand._id, version: demand.version };
        if (key === "fulfill") await fulfillDemand(args);
      });
    })();
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Inventory · Demand ledger</p>
          <h1 className="display-title mt-2">What service requires</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            What each event needs, ingredient by ingredient — where each amount
            came from, and a clean handoff into purchasing.
          </p>
        </div>
        <div className="supply-masthead-actions">
          <label className="field-label" style={{ marginBottom: 0 }}>
            Anomaly threshold
            <select
              className="input"
              value={thresholdPct}
              onChange={(event) => setThresholdPct(Number(event.target.value))}
            >
              {[20, 30, 40, 50, 75].map((pct) => (
                <option key={pct} value={pct}>
                  ±{pct}%
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate ? "Close form" : "Calculate demand"}
          </button>
        </div>
      </header>
      <InventoryWorkspaceNav />

      <aside className="supply-degraded" role="note">
        <strong>Approve releases purchasing</strong>
        <span>
          Dish and headcount changes recalculate demand automatically. Event
          approval opens PurchaseNeeds and maintains the shared weekly draft —
          no manual create-need step.
        </span>
      </aside>
      {anomalies.size > 0 ? (
        <aside
          className="supply-degraded"
          role="alert"
          data-testid="demand-anomaly-banner"
        >
          <strong>
            {anomalies.size} demand line{anomalies.size === 1 ? "" : "s"} need
            review
          </strong>
          <span>
            These quantities deviate more than ±{thresholdPct}% from the
            historical average for the same dish at this headcount tier. Confirm
            them before approval commits purchase needs.
          </span>
        </aside>
      ) : null}
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}

      {showCreate ? (
        <form className="supply-form" onSubmit={submitDemand}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New requirement</p>
              <h2>Calculate demand</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "create-demand" ? "Calculating…" : "Calculate"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Event
              <select name="eventId" className="input" required>
                <option value="">Select event</option>
                {(events ?? [])
                  .filter((item) => item.deletedAt == null)
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Ingredient
              <select name="ingredientId" className="input" required>
                <option value="">Select ingredient</option>
                {(ingredients ?? [])
                  .filter(
                    (item) =>
                      item.deletedAt == null && item.status === "active",
                  )
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Required quantity
              <input
                name="requiredQuantity"
                className="input"
                type="number"
                min={0.0001}
                step="any"
                required
              />
            </label>
            <label className="field-label">
              Unit
              <select name="unit" className="input">
                {UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Where each amount comes from</p>
            <h2>Event requirements</h2>
          </div>
          <span>{activeDemands.length} lines</span>
        </div>
        {demands === undefined ||
        events === undefined ||
        ingredients === undefined ? (
          <TableSkeleton rows={7} />
        ) : activeDemands.length === 0 ? (
          <div className="document-empty">
            <p>No ingredient demand yet</p>
            <span>
              Demand is what service requires per ingredient. It generates
              automatically when you approve an event with dishes — then flows
              into purchasing. You can also calculate a line by hand.
            </span>
            <div className="mt-3 flex justify-center gap-2">
              <Link to="/events" className="btn btn-primary btn-sm">
                Go to events
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCreate(true)}
              >
                Calculate demand
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Ingredient</th>
                  <th>Required</th>
                  <th>State</th>
                  <th>Purchase</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeDemands.map((demand) => {
                  const need = existingNeed(demand._id);
                  const actions = policy.demandActions(String(demand.status));
                  return (
                    <tr key={demand._id}>
                      <td>
                        <strong>{eventName(demand.eventId)}</strong>
                        <small>{demand.eventId.slice(-8)}</small>
                      </td>
                      <td>
                        {(() => {
                          const ingredient = ingredients?.find(
                            (i) => i._id === demand.ingredientId,
                          );
                          if (!ingredient)
                            return ingredientName(demand.ingredientId);
                          return (
                            <HoverPreview
                              card={
                                <IngredientPreviewCard
                                  ingredient={ingredient}
                                />
                              }
                            >
                              <Link
                                to={`/kitchen/ingredients/${ingredient._id}`}
                                className="underline decoration-dotted underline-offset-2 hover:text-ink"
                              >
                                {ingredient.name}
                              </Link>
                            </HoverPreview>
                          );
                        })()}
                      </td>
                      <td className="supply-number">
                        {demand.requiredQuantity} {demand.unit}
                        {(() => {
                          const anomaly = anomalies.get(demand._id);
                          if (!anomaly) return null;
                          return (
                            <span
                              className="chip ml-2 border-warn/40 bg-warn-soft text-warn"
                              data-testid="demand-anomaly-flag"
                              title={`Historical avg ${anomaly.expectedQuantity.toFixed(
                                2,
                              )} ${demand.unit} across ${anomaly.sampleSize} past ${
                                anomaly.tier
                              } events — this is ${Math.round(
                                anomaly.deviation * 100,
                              )}% ${anomaly.direction}`}
                            >
                              ⚠ {Math.round(anomaly.deviation * 100)}%{" "}
                              {anomaly.direction}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        <StatusChip status={String(demand.status)} />
                      </td>
                      <td>
                        {need ? (
                          <StatusChip status={String(need.status)} />
                        ) : (
                          <span className="supply-muted">
                            Opens on Event approve
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          {actions.map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() =>
                                invokeDemandAction(demand, action.key)
                              }
                            >
                              {busy === `${demand._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
