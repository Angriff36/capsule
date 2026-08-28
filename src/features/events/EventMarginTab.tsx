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
  const headcount = Number(event?.expectedHeadcount ?? 0);
  const perPerson = headcount > 0 && quoted > 0 ? quoted / headcount : null;
  const costBuckets: MarginCostBucket[] = [
    { key: "food", label: "Food & ingredients", amount: foodCost },
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
      amount: quoted > 0 ? quoted : null,
    },
    {
      key: "invoiced",
      label: "Confirmed invoice revenue",
      hint: `${live.invoiceCount} issued invoice${live.invoiceCount === 1 ? "" : "s"}`,
      amount: live.confirmedRevenue,
      tone: "ok",
    },
    ...(budget > 0
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
          Food cost uses the recipe × catalog (or receipt) estimate when no
          submitted PO exists. Labor and equipment use live committed figures
          when available.
        </p>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <EventMarginTiles
            revenue={revenue}
            totalCost={totalCost}
            grossProfit={grossProfit}
            marginPct={marginPct}
          />
          <EventMarginRevenueBreakdown lines={revenueLines} total={revenue} />
          <EventMarginCostBreakdown buckets={costBuckets} total={totalCost} />

          {recipeRollup.foodCost === 0 && recipeRollup.mismatches.length > 0 ? (
            <p
              className="banner banner-danger"
              data-testid="event-margin-recipe-unpriced"
            >
              Recipe estimate is $0 because recipe units do not match catalog.
              These units are not converted. Food cost still uses the recipe
              estimate (no submitted PO).
            </p>
          ) : recipeRollup.foodCost === 0 ? (
            <p
              className="banner border-line bg-inset text-ink-3"
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
        </div>

        <EventMarginSummaryAside
          revenue={revenue}
          totalCost={totalCost}
          grossProfit={grossProfit}
          marginPct={marginPct}
          headcount={headcount}
          buckets={costBuckets}
          budget={budget}
          budgetVariance={budgetVariance}
        />
      </div>
    </section>
  );
}
