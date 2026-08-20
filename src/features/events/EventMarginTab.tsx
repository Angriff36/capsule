import { useMemo } from "react";
import { formatMoney } from "../../lib/format";
import { useEventLaborSummary } from "../facilities/useLaborSummary";
import {
  useGetEvent,
  useListComponent,
  useListComponentIngredient,
  useListDishComponent,
  useListDishIngredient,
  useListEquipment,
  useListEquipmentReservation,
  useListEventDish,
  useListIngredient,
  useListIngredientDemand,
  useListIngredientPriceObservation,
  useListInvoice,
  useListPayrollInput,
  useListVendorOrder,
  useListVendorOrderLine,
  useListVendorOrderLineDemand,
} from "../../lib/manifest-convex-react";
import { buildEventMenuCost } from "./eventMenuCost";
import { TableSkeleton } from "../../ui/primitives";
import { buildLiveEventProfitability } from "./liveEventProfitability";
import { LiveEventProfitabilityWidget } from "./LiveEventProfitabilityWidget";

type Props = {
  eventId: string;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xs border border-line bg-inset/40 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-ink-3">{label}</p>
      <p className="font-mono text-xl text-ink">{value}</p>
    </div>
  );
}

export function EventMarginTab({ eventId }: Props) {
  const event = useGetEvent(eventId);
  const eventDishes = useListEventDish();
  const dishIngredients = useListDishIngredient();
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const componentIngredients = useListComponentIngredient();
  const ingredients = useListIngredient();
  const priceObservations = useListIngredientPriceObservation();
  const invoices = useListInvoice();
  const demands = useListIngredientDemand();
  const orders = useListVendorOrder();
  const lines = useListVendorOrderLine();
  const lineDemands = useListVendorOrderLineDemand();
  const payroll = useListPayrollInput();
  const equipment = useListEquipment();
  const equipmentReservations = useListEquipmentReservation();
  // Live labor from clocked time × pay rates (laborSummary seam). Payroll
  // inputs are only the fallback — their rate fields are encrypted-stripped.
  const clockedLabor = useEventLaborSummary(eventId);

  const estimatedFoodCost = Number(
    (event as { estimatedFoodCost?: number } | null | undefined)
      ?.estimatedFoodCost ?? 0,
  );
  const quoted = Number(event?.quotedPrice ?? 0);
  const budget = Number(event?.budgetAmount ?? 0);

  const recipeRollup = useMemo(
    () =>
      buildEventMenuCost({
        eventId,
        expectedHeadcount: Number(event?.expectedHeadcount ?? 0),
        eventDishes: (eventDishes ?? [])
          .filter((row) => row.deletedAt == null && row.eventId === eventId)
          .map((row) => ({
            id: row._id,
            eventId: row.eventId,
            dishId: row.dishId,
            quantityServings: Number(row.quantityServings),
            headcountOverride: Number(
              (row as { headcountOverride?: number }).headcountOverride ?? 0,
            ),
            deletedAt: row.deletedAt,
          })),
        dishIngredients: (dishIngredients ?? []).map((row) => ({
          id: row._id,
          dishId: row.dishId,
          ingredientId: row.ingredientId,
          quantity: Number(row.quantity),
          unit: String(row.unit),
          wasteFactor: row.wasteFactor,
          addedAt: row.addedAt,
          deletedAt: row.deletedAt,
        })),
        dishComponents: (dishComponents ?? []).map((row) => ({
          id: row._id,
          dishId: row.dishId,
          componentId: row.componentId,
          yieldQuantity: Number(row.yieldQuantity),
          batchMultiplier: Number(row.batchMultiplier),
          deletedAt: row.deletedAt,
        })),
        components: (components ?? []).map((row) => ({
          id: row._id,
          yieldQuantity: Number(row.yieldQuantity),
          deletedAt: row.deletedAt,
        })),
        componentIngredients: (componentIngredients ?? []).map((row) => ({
          id: row._id,
          componentId: row.componentId,
          ingredientId: row.ingredientId,
          quantity: Number(row.quantity),
          unit: String(row.unit),
          deletedAt: row.deletedAt,
        })),
        ingredients: (ingredients ?? []).map((row) => ({
          id: row._id,
          name: row.name,
          unit: String(row.unit),
          costPerUnit: Number(row.costPerUnit),
          deletedAt: row.deletedAt,
        })),
        priceObservations: priceObservations ?? [],
      }),
    [
      componentIngredients,
      components,
      dishComponents,
      dishIngredients,
      event?.expectedHeadcount,
      eventDishes,
      eventId,
      ingredients,
      priceObservations,
    ],
  );

  const foodCost =
    recipeRollup.foodCost > 0
      ? recipeRollup.foodCost
      : Number.isFinite(estimatedFoodCost) && estimatedFoodCost > 0
        ? estimatedFoodCost
        : 0;

  const live = useMemo(
    () =>
      buildLiveEventProfitability({
        eventId,
        invoices: invoices ?? [],
        demands: demands ?? [],
        orders: orders ?? [],
        lines: lines ?? [],
        lineDemands: lineDemands ?? [],
        payrollInputs: payroll ?? [],
        equipment: equipment ?? [],
        equipmentReservations: equipmentReservations ?? [],
        clockedLabor,
        recipeEstimatedFoodCost: recipeRollup.foodCost,
      }),
    [
      clockedLabor,
      demands,
      equipment,
      equipmentReservations,
      eventId,
      invoices,
      lineDemands,
      lines,
      orders,
      payroll,
      recipeRollup.foodCost,
    ],
  );

  const laborCost = live.laborCost;
  const equipmentCost = live.equipmentCost;
  const revenue = live.confirmedRevenue || quoted;
  const totalCost = foodCost + laborCost + equipmentCost;
  const grossProfit = revenue - totalCost;
  const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : null;
  const budgetVariance = budget > 0 ? budget - totalCost : null;

  if (event === undefined) {
    return <TableSkeleton rows={3} />;
  }
  if (event === null) {
    return <p className="text-base text-ink-2">Event unavailable.</p>;
  }

  return (
    <section className="space-y-4" data-testid="event-margin-tab">
      <div>
        <h2 className="font-display text-lg">Margin</h2>
        <p className="text-base text-ink-2">
          Food cost uses the recipe × catalog (or receipt) estimate when no
          submitted PO exists. Labor and equipment use live committed figures
          when available.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Projected revenue" value={formatMoney(quoted)} />
        <Metric
          label="Confirmed / invoice revenue"
          value={formatMoney(revenue)}
        />
        <Metric label="Estimated food cost" value={formatMoney(foodCost)} />
        <Metric label="Labor cost" value={formatMoney(laborCost)} />
        <Metric label="Equipment / rental" value={formatMoney(equipmentCost)} />
        <Metric label="Total cost" value={formatMoney(totalCost)} />
        <Metric label="Gross profit" value={formatMoney(grossProfit)} />
        <Metric
          label="Margin %"
          value={marginPct == null ? "—" : `${marginPct.toFixed(1)}%`}
        />
        <Metric
          label="Budget variance"
          value={budgetVariance == null ? "—" : formatMoney(budgetVariance)}
        />
      </div>
      {recipeRollup.foodCost === 0 && recipeRollup.mismatches.length > 0 ? (
        <p
          className="text-sm text-danger"
          data-testid="event-margin-recipe-unpriced"
        >
          Recipe estimate is $0 because recipe units do not match catalog. These
          units are not converted. Food cost still uses the recipe estimate (no
          submitted PO).
        </p>
      ) : recipeRollup.foodCost === 0 ? (
        <p
          className="text-sm text-ink-3"
          data-testid="event-margin-recipe-zero"
        >
          Recipe estimate is $0 — no same-unit priced ingredient lines. Food
          cost still uses the recipe estimate until a submitted PO exists.
        </p>
      ) : null}
      <LiveEventProfitabilityWidget
        eventId={eventId}
        recipeEstimatedFoodCost={recipeRollup.foodCost}
        recipeUnpricedReason={
          recipeRollup.foodCost === 0 && recipeRollup.mismatches.length > 0
            ? "Recipe estimate is $0 because recipe units do not match catalog. These units are not converted."
            : recipeRollup.foodCost === 0
              ? "Recipe estimate is $0 — no same-unit priced ingredient lines."
              : undefined
        }
      />
    </section>
  );
}
