import { useEventRentalOrderLines } from "../../lib/useEventRows";
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
  useListIngredient,
  useListIngredientDemand,
  useListIngredientPriceObservation,
  useListItemUnitMapping,
  useListInvoice,
  useListPayrollInput,
  useListVendorOrder,
  useListVendorOrderLine,
  useListVendorOrderLineDemand,
} from "../../lib/manifest-convex-react";
import { useEventMenuLines } from "../../lib/useEventMenuLines";
import { buildEventMenuCost } from "./eventMenuCost";
import {
  canReadEventFoodCost,
  useEventFoodCost,
} from "../../lib/culinaryDemandClient";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { EventFoodCostPanel } from "../finance/EventFoodCostPanel";
import { RecordedUnitMappings } from "../../lib/recordedUnitMappings";
import { TableSkeleton } from "../../ui/primitives";
import {
  EventMarginCostBreakdown,
  EventMarginRevenueBreakdown,
  EventMarginTiles,
  type MarginCostBucket,
  type MarginRevenueLine,
} from "./EventMarginBreakdown";
import { EventMarginSummaryAside } from "./EventMarginSummaryAside";
import { buildLiveEventProfitability } from "./liveEventProfitability";
import { LiveEventProfitabilityWidget } from "./LiveEventProfitabilityWidget";

type Props = {
  eventId: string;
};

export function EventMarginTab({ eventId }: Props) {
  const event = useGetEvent(eventId);
  const eventDishes = useEventMenuLines(eventId);
  const rentalLines = useEventRentalOrderLines(eventId);
  const dishIngredients = useListDishIngredient();
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const componentIngredients = useListComponentIngredient();
  const ingredients = useListIngredient();
  const priceObservations = useListIngredientPriceObservation();
  const itemUnitMappings = useListItemUnitMapping();
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

  // The one food-cost read: menu priced at the event date, gaps counted.
  const authStatus = useAuthStatus();
  const canReadFoodCost = canReadEventFoodCost(authStatus?.role);
  const foodCostReport = useEventFoodCost(eventId, canReadFoodCost);
  const quoted = event?.quotedPrice ?? null;
  const budget = event?.budgetAmount ?? null;

  const recipeRollup = useMemo(
    () =>
      buildEventMenuCost({
        eventId,
        expectedHeadcount: event?.expectedHeadcount,
        eventDishes: (eventDishes ?? [])
          .filter((row) => row.deletedAt == null && row.eventId === eventId)
          .map((row) => ({
            id: row._id,
            eventId: row.eventId,
            dishId: row.dishId,
            recipeDishId: row.recipeDishId,
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
        unitMappings: RecordedUnitMappings.fromRows(itemUnitMappings),
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
      itemUnitMappings,
      priceObservations,
    ],
  );

  // Never fall back to a total that prices unconvertible or unpriced lines
  // at $0: the server estimate, else the same-rules browser rollup.
  const foodCost = foodCostReport
    ? foodCostReport.estimated.knownCost
    : recipeRollup.foodCost;

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
        rentalLines: rentalLines ?? [],
        clockedLabor,
        recipeEstimatedFoodCost: foodCost,
      }),
    [
      clockedLabor,
      demands,
      equipment,
      equipmentReservations,
      rentalLines,
      eventId,
      invoices,
      lineDemands,
      lines,
      orders,
      payroll,
      foodCost,
    ],
  );

  // Some food has no price: costs shown are only the known part.
  const costsIncomplete = foodCostReport
    ? !foodCostReport.estimated.complete
    : recipeRollup.dishes.some(
        (dish) => dish.incompleteLineCount > 0 || dish.pricedLineCount === 0,
      );
  const laborCost = live.laborCost;
  const equipmentCost = live.equipmentCost;
  const revenue = live.invoiceCount > 0 ? live.confirmedRevenue : quoted;
  const totalCost = foodCost + laborCost + equipmentCost;
  const grossProfit = revenue == null ? null : revenue - totalCost;
  const marginPct =
    revenue != null && revenue > 0 && grossProfit != null
      ? (grossProfit / revenue) * 100
      : null;
  const budgetVariance = budget == null ? null : budget - totalCost;
  const headcount = event?.expectedHeadcount ?? null;
  const perPerson =
    headcount != null && headcount > 0 && quoted != null
      ? quoted / headcount
      : null;
  const costBuckets: MarginCostBucket[] = [
    {
      key: "food",
      label:
        foodCostReport && !foodCostReport.estimated.complete
          ? "Food & ingredients (not all priced)"
          : "Food & ingredients",
      amount: foodCost,
    },
    { key: "labor", label: "Labor & staffing", amount: laborCost },
    { key: "equipment", label: "Equipment & rentals", amount: equipmentCost },
  ];
  const revenueLines: MarginRevenueLine[] = [
    {
      key: "quoted",
      label: "Quoted price",
      hint:
        perPerson == null
          ? undefined
          : `${headcount} covers × ${formatMoney(perPerson)} per person`,
      amount: quoted,
    },
    {
      key: "invoiced",
      label: "Confirmed invoice revenue",
      hint: `${live.invoiceCount} issued invoice${live.invoiceCount === 1 ? "" : "s"}`,
      amount: live.confirmedRevenue,
      tone: "ok",
    },
    ...(budget != null
      ? [
          {
            key: "budget",
            label: "Budgeted revenue",
            hint: "Owner budget set on this event",
            amount: budget,
          } as MarginRevenueLine,
        ]
      : []),
  ];

  if (event === undefined) {
    return <TableSkeleton rows={3} />;
  }
  if (event === null) {
    return <p className="text-base text-ink-2">Event unavailable.</p>;
  }

  return (
    <section className="space-y-4" data-testid="event-margin-tab">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-3">
        <h2 className="font-display text-2xl leading-none text-ink">Margin</h2>
        <p className="max-w-xl text-base text-ink-3">
          Food cost is the menu priced at the event date from receipt (or
          catalog) prices. Anything without a price is listed, not counted as
          free. Labor and equipment use the current booked costs when there are
          any.
        </p>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <EventMarginTiles
            revenue={revenue}
            totalCost={totalCost}
            grossProfit={grossProfit}
            marginPct={marginPct}
            costsIncomplete={costsIncomplete}
          />
          <EventMarginRevenueBreakdown lines={revenueLines} total={revenue} />
          <EventMarginCostBreakdown buckets={costBuckets} total={totalCost} />

          <EventFoodCostPanel eventId={eventId} enabled={canReadFoodCost} />

          {foodCostReport ? null : recipeRollup.foodCost === 0 &&
            recipeRollup.mismatches.length > 0 ? (
            <p
              className="banner banner-danger"
              data-testid="event-margin-recipe-unpriced"
            >
              Recipe estimate is $0 because the recipe units don't match how
              these ingredients are priced, so they can't be costed. Food cost
              still uses the recipe estimate until a PO is submitted.
            </p>
          ) : recipeRollup.foodCost === 0 ? (
            <p
              className="banner border-line bg-inset text-ink-3"
              data-testid="event-margin-recipe-zero"
            >
              Recipe estimate is $0 — no ingredient has a price in the unit the
              recipe uses. Food cost still uses the recipe estimate until a PO
              is submitted.
            </p>
          ) : null}

          <LiveEventProfitabilityWidget
            eventId={eventId}
            recipeEstimatedFoodCost={foodCost}
            recipeUnpricedReason={
              foodCost === 0 && recipeRollup.mismatches.length > 0
                ? "Recipe estimate is $0 because the recipe units don't match how these ingredients are priced."
                : foodCost === 0
                  ? "Recipe estimate is $0 — no ingredient has a price in the unit the recipe uses."
                  : undefined
            }
          />
        </div>

        <EventMarginSummaryAside
          revenue={revenue}
          totalCost={totalCost}
          grossProfit={grossProfit}
          marginPct={marginPct}
          costsIncomplete={costsIncomplete}
          headcount={headcount}
          buckets={costBuckets}
          budget={budget}
          budgetVariance={budgetVariance}
        />
      </div>
    </section>
  );
}
