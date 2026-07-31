import { useMemo } from "react";
import { formatMoney } from "../../lib/format";
import { useEventLaborSummary } from "../facilities/useLaborSummary";
import {
  useGetEvent,
  useListEquipment,
  useListEquipmentReservation,
  useListEventDish,
  useListIngredientDemand,
  useListInvoice,
  useListPayrollInput,
  useListVendorOrder,
  useListVendorOrderLine,
  useListVendorOrderLineDemand,
} from "../../lib/manifest-convex-react";
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

  const dishFoodRollup = useMemo(() => {
    return (eventDishes ?? [])
      .filter((row) => row.deletedAt == null && row.eventId === eventId)
      .reduce((total, row) => {
        const cost = Number(
          (row as { estimatedCost?: number }).estimatedCost ?? 0,
        );
        return total + (Number.isFinite(cost) ? cost : 0);
      }, 0);
  }, [eventDishes, eventId]);

  const foodCost =
    Number.isFinite(estimatedFoodCost) && estimatedFoodCost > 0
      ? estimatedFoodCost
      : dishFoodRollup;

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
          Food cost uses this event's estimated food cost. Labor and equipment
          use live committed figures when available.
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
      <LiveEventProfitabilityWidget eventId={eventId} />
    </section>
  );
}
