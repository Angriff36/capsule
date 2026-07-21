import { useState, type FormEvent } from "react";
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
import { StatusChip, TableSkeleton } from "../../ui/primitives";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeDemands = (demands ?? []).filter(
    (demand) => demand.deletedAt == null,
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
            Event-scoped ingredient requirements with visible provenance and
            governed handoff into purchasing.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "Close form" : "Calculate demand"}
        </button>
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
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}

      {showCreate ? (
        <form className="supply-form" onSubmit={submitDemand}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New governed requirement</p>
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
            <p className="eyebrow">Demand provenance</p>
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
            <p>No ingredient demand has been calculated.</p>
            <span>Begin with an event and an active ingredient.</span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
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
                      <td>{ingredientName(demand.ingredientId)}</td>
                      <td className="supply-number">
                        {demand.requiredQuantity} {demand.unit}
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
