import { Fragment, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatCountNoun, formatDate } from "../../lib/format";
import {
  useCreateIngredientDemand,
  useIngredientDemandFulfill,
  useListIngredient,
} from "../../lib/manifest-convex-react";
import { useApplyDemandSupersede } from "../../lib/culinaryDemandClient";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { FieldHelp } from "../../ui/FieldHelp";
import { HoverPreview } from "../../ui/HoverPreview";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { IngredientPreviewCard } from "../kitchen/IngredientPreviewCard";
import { IngredientCatalogLabel } from "../kitchen/IngredientCatalogLabel";
import { IngredientOptionPicker } from "../kitchen/IngredientOptionPicker";
import {
  DEFAULT_ANOMALY_THRESHOLD,
  computeDemandAnomalies,
} from "./demandAnomaly";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";
import { useWorkingEventId } from "../events/workingEvent";
import { IngredientDemandProvenancePanel } from "./IngredientDemandProvenancePanel";
import { DemandChangePreviewDialog } from "./DemandChangePreviewDialog";
import { usePickerAndNamedEvents } from "../facilities/usePickerAndNamedEvents";
import { useEventsInRange } from "../facilities/useEventsById";
import {
  useDemandHistory,
  useDemandsForEvents,
} from "../facilities/useInventoryWindow";
import { DemandLedgerCreateForm, DEMAND_UNITS } from "./DemandLedgerCreateForm";
import { DemandLedgerMasthead } from "./DemandLedgerMasthead";

const policy = new SupplyLifecyclePolicy();
const UNITS = DEMAND_UNITS;
const DAY_MS = 86_400_000;
/** Days of events shown at first, and added by each "Show" button. */
const LEDGER_STEP_DAYS = 14;

export function DemandLedgerPage() {
  const workingId = useWorkingEventId();
  // The events of the next two weeks; earlier and later ones on request.
  // Only their demand lines and purchase needs are read.
  const [daysBack, setDaysBack] = useState(0);
  const [daysAhead, setDaysAhead] = useState(LEDGER_STEP_DAYS);
  const today = new Date().setHours(0, 0, 0, 0);
  const shownEvents = useEventsInRange({
    from: today - daysBack * DAY_MS,
    to: today + daysAhead * DAY_MS,
  });
  const forEvents = useDemandsForEvents(shownEvents?.map((event) => event._id));
  const demands = forEvents?.demands;
  const events = usePickerAndNamedEvents(
    demands ? [workingId, ...demands.map((row) => row.eventId)] : undefined,
  );
  const ingredients = useListIngredient();
  const purchaseNeeds = forEvents?.needs;
  // Past committed demand of the dishes on screen, for the anomaly check.
  const history = useDemandHistory(demands?.map((row) => row.dishId));
  const createDemand = useCreateIngredientDemand();
  const fulfillDemand = useIngredientDemandFulfill();
  const applyDemandSupersede = useApplyDemandSupersede();
  const [showCreate, setShowCreate] = useState(false);
  const [thresholdPct, setThresholdPct] = useState(
    Math.round(DEFAULT_ANOMALY_THRESHOLD * 100),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [expandedDemandId, setExpandedDemandId] = useState<string | null>(null);
  const [supersedePreview, setSupersedePreview] = useState<{
    demandId: string;
    eventId: string;
    version?: number;
    reason: string;
  } | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const eventStart = (id: string) =>
    events?.find((event) => event._id === id)?.startsAt ?? null;
  // Grouped by event, soonest event first, so each block reads as
  // "this event needs these ingredients".
  const activeDemands = (demands ?? [])
    .filter((demand) => demand.deletedAt == null)
    .sort(
      (a, b) =>
        Number(eventStart(a.eventId) ?? Infinity) -
          Number(eventStart(b.eventId) ?? Infinity) ||
        a.eventId.localeCompare(b.eventId),
    );
  const anomalies = useMemo(
    () =>
      computeDemandAnomalies(
        demands && history
          ? [
              ...demands,
              ...history.demands.filter(
                (row) => !demands.some((own) => own._id === row._id),
              ),
            ]
          : undefined,
        events && history ? [...events, ...history.events] : undefined,
        thresholdPct / 100,
      ),
    [demands, events, history, thresholdPct],
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
        unit: String(data.get("unit")) as (typeof DEMAND_UNITS)[number],
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
        setSupersedePreview({
          demandId: demand._id,
          eventId: demand.eventId,
          version: demand.version,
          reason,
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
      <DemandLedgerMasthead
        thresholdPct={thresholdPct}
        onThresholdChange={setThresholdPct}
        showCreate={showCreate}
        onToggleCreate={() => setShowCreate((value) => !value)}
      />
      <InventoryWorkspaceNav />

      <aside className="supply-degraded" role="note">
        <strong>Worked out from the event, not typed</strong>
        <span>
          Change a dish or the headcount on an event and these amounts update by
          themselves. Approving the event turns them into purchase needs and
          keeps the weekly draft order current.
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
      {supersedePreview ? (
        <DemandChangePreviewDialog
          request={{
            eventId: supersedePreview.eventId,
            kind: "supersede",
            demandId: supersedePreview.demandId,
          }}
          onClose={() => setSupersedePreview(null)}
          onApply={(expectedFingerprint) =>
            applyDemandSupersede({ ...supersedePreview, expectedFingerprint })
          }
        />
      ) : null}

      {showCreate ? (
        <DemandLedgerCreateForm
          events={events}
          ingredients={ingredients}
          workingId={workingId}
          busy={busy != null}
          submitting={busy === "create-demand"}
          onSubmit={submitDemand}
        />
      ) : null}
      {false && showCreate ? (
        <form className="supply-form" onSubmit={submitDemand}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">By hand</p>
              <h2>Add a line the dishes do not cover</h2>
              <p className="mt-1 text-sm text-ink-2">
                For something an event needs that no dish lists, such as ice or
                a supply item. Pick the event, the product and the amount.
              </p>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "create-demand" ? "Adding…" : "Add line"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Event
              <select
                key={events?.length ? "events-ready" : "events-loading"}
                name="eventId"
                className="input"
                defaultValue={workingId ?? ""}
                required
              >
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
            <label className="field-label sm:col-span-2">
              Ingredient
              <div className="mt-1">
                <IngredientOptionPicker ingredients={ingredients} required />
              </div>
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
            <p className="eyebrow">Per event, per ingredient</p>
            <h2>What to have on hand</h2>
          </div>
          <span>{formatCountNoun(activeDemands.length, "line")}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span>
            Events from {formatDate(today - daysBack * DAY_MS)} to{" "}
            {formatDate(today + daysAhead * DAY_MS - 1)}.
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setDaysBack((days) => days + LEDGER_STEP_DAYS)}
          >
            Show earlier events
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setDaysAhead((days) => days + LEDGER_STEP_DAYS)}
          >
            Show later events
          </button>
        </div>
        {demands === undefined ||
        events === undefined ||
        ingredients === undefined ? (
          <TableSkeleton rows={7} />
        ) : activeDemands.length === 0 ? (
          <div className="document-empty">
            <p>No event needs anything yet</p>
            <span>
              Put dishes on an event and this list fills in by itself, then
              flows into purchasing. You can also add a line by hand for
              something no dish covers.
            </span>
            <div className="mt-3 flex justify-center gap-2">
              <Link to="/events" className="btn btn-primary btn-sm">
                Go to events
              </Link>
              {showCreate ? null : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowCreate(true)}
                >
                  Add a line by hand
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table phone-cards">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Ingredient</th>
                  <th>Required</th>
                  <th>State</th>
                  <th>
                    <span className="field-label-row">
                      Purchase
                      <FieldHelp term="purchaseEligibility" />
                    </span>
                  </th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeDemands.map((demand, index) => {
                  const need = existingNeed(demand._id);
                  const actions = policy.demandActions(String(demand.status));
                  const expanded = expandedDemandId === demand._id;
                  const firstOfEvent =
                    index === 0 ||
                    activeDemands[index - 1].eventId !== demand.eventId;
                  const lineCount = activeDemands.filter(
                    (line) => line.eventId === demand.eventId,
                  ).length;
                  return (
                    <Fragment key={demand._id}>
                      {firstOfEvent ? (
                        <tr className="bg-inset">
                          <td colSpan={6}>
                            <Link
                              to={`/events/${demand.eventId}`}
                              className="font-semibold text-ink hover:underline"
                            >
                              {eventName(demand.eventId)}
                            </Link>{" "}
                            <span className="text-ink-2">
                              · {formatDate(eventStart(demand.eventId))} ·{" "}
                              {formatCountNoun(lineCount, "ingredient")} needed
                            </span>
                          </td>
                        </tr>
                      ) : null}
                      <tr>
                        <td className="phone-hide">
                          <strong>{eventName(demand.eventId)}</strong>
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
                                <IngredientCatalogLabel
                                  ingredientId={ingredient._id}
                                  ingredients={ingredients}
                                  link
                                />
                              </HoverPreview>
                            );
                          })()}
                        </td>
                        <td className="supply-number" data-label="Required">
                          {/* Two decimals: recipe math leaves float noise. */}
                          {Number(
                            Number(demand.requiredQuantity).toFixed(2),
                          ).toLocaleString()}{" "}
                          {demand.unit}
                          {(() => {
                            const anomaly = anomalies.get(demand._id);
                            if (!anomaly) return null;
                            return (
                              <span
                                className="chip ml-2 chip-tone-warn"
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
                        <td data-label="State">
                          <StatusChip status={String(demand.status)} />
                        </td>
                        <td data-label="Purchase">
                          {need ? (
                            <StatusChip status={String(need.status)} />
                          ) : (
                            <span className="supply-muted">
                              Buying starts when the event is approved
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="supply-row-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              aria-expanded={expanded}
                              aria-controls={`demand-provenance-${demand._id}`}
                              onClick={() =>
                                setExpandedDemandId(
                                  expanded ? null : demand._id,
                                )
                              }
                            >
                              {expanded
                                ? "Hide calculation"
                                : "How was this computed?"}
                            </button>
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
                      {expanded ? (
                        <tr
                          id={`demand-provenance-${demand._id}`}
                          className="demand-provenance-row"
                        >
                          <td colSpan={6}>
                            <IngredientDemandProvenancePanel
                              demandId={demand._id}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
