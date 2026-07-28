import { useMemo } from "react";
import {
  useListEquipment,
  useListEquipmentReservation,
  useListIngredientDemand,
  useListInvoice,
  useListPayrollInput,
  useListVendorOrder,
  useListVendorOrderLine,
  useListVendorOrderLineDemand,
} from "../../lib/manifest-convex-react";
import { formatMoney } from "../../lib/format";
import { buildLiveEventProfitability } from "./liveEventProfitability";
import "./LiveEventProfitabilityWidget.css";

const percent = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const hours = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

export function LiveEventProfitabilityWidget({ eventId }: { eventId: string }) {
  const invoices = useListInvoice();
  const demands = useListIngredientDemand();
  const orders = useListVendorOrder();
  const lines = useListVendorOrderLine();
  const lineDemands = useListVendorOrderLineDemand();
  const payrollInputs = useListPayrollInput();
  const equipment = useListEquipment();
  const equipmentReservations = useListEquipmentReservation();
  const loading = [
    invoices,
    demands,
    orders,
    lines,
    lineDemands,
    payrollInputs,
    equipment,
    equipmentReservations,
  ].some((value) => value === undefined);

  const result = useMemo(
    () =>
      buildLiveEventProfitability({
        eventId,
        invoices: invoices ?? [],
        demands: demands ?? [],
        orders: orders ?? [],
        lines: lines ?? [],
        lineDemands: lineDemands ?? [],
        payrollInputs: payrollInputs ?? [],
        equipment: equipment ?? [],
        equipmentReservations: equipmentReservations ?? [],
      }),
    [
      demands,
      equipment,
      equipmentReservations,
      eventId,
      invoices,
      lineDemands,
      lines,
      orders,
      payrollInputs,
    ],
  );

  const costShare =
    result.confirmedRevenue > 0
      ? Math.min(
          100,
          (result.totalCommittedCost / result.confirmedRevenue) * 100,
        )
      : result.totalCommittedCost > 0
        ? 100
        : 0;
  const marginTone = result.margin < 0 ? "is-negative" : "is-positive";

  return (
    <section
      className={`live-profitability ${marginTone}`}
      data-testid="live-event-profitability"
      aria-busy={loading}
      aria-label="Live event profitability"
    >
      <header className="live-profitability__header">
        <div>
          <p className="live-profitability__eyebrow">
            <span aria-hidden="true" /> Live event P&amp;L
          </p>
          <h2>Margin at this moment</h2>
        </div>
        <span className="live-profitability__refresh">
          {loading ? "Syncing records…" : "Updates with committed records"}
        </span>
      </header>

      {loading ? (
        <div className="live-profitability__loading" role="status">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <div className="live-profitability__scoreboard">
            <div className="live-profitability__margin">
              <span>Current priced margin</span>
              <strong data-testid="live-profit-margin">
                {formatMoney(result.margin)}
              </strong>
              <small data-testid="live-profit-margin-percent">
                {result.marginPercent == null
                  ? "Waiting for confirmed invoice revenue"
                  : `${percent.format(result.marginPercent)}% of confirmed revenue`}
              </small>
            </div>
            <div
              className="live-profitability__flow"
              aria-label="Revenue and cost"
            >
              <div>
                <span>Confirmed revenue</span>
                <strong data-testid="live-profit-revenue">
                  {formatMoney(result.confirmedRevenue)}
                </strong>
                <small>
                  {result.invoiceCount} issued invoice
                  {result.invoiceCount === 1 ? "" : "s"}
                </small>
              </div>
              <div>
                <span>Committed cost</span>
                <strong data-testid="live-profit-cost">
                  {formatMoney(result.totalCommittedCost)}
                </strong>
                <small>priced records to date</small>
              </div>
            </div>
          </div>

          <div className="live-profitability__rail" aria-hidden="true">
            <span style={{ width: `${costShare}%` }} />
          </div>
          <div className="live-profitability__rail-labels">
            <span>0 cost</span>
            <span>{costShare.toFixed(0)}% of revenue committed</span>
          </div>

          <div className="live-profitability__buckets">
            <article>
              <span className="live-profitability__bucket-code">01</span>
              <div>
                <p>Ingredient demand</p>
                <strong data-testid="live-profit-ingredients">
                  {formatMoney(result.ingredientCost)}
                </strong>
                <small>
                  {result.ingredientLineCount} committed line
                  {result.ingredientLineCount === 1 ? "" : "s"} across{" "}
                  {result.ingredientOrderCount} order
                  {result.ingredientOrderCount === 1 ? "" : "s"}
                </small>
              </div>
            </article>
            <article>
              <span className="live-profitability__bucket-code">02</span>
              <div>
                <p>Labor</p>
                <strong data-testid="live-profit-labor">
                  {formatMoney(result.laborCost)}
                </strong>
                <small>
                  {hours.format(result.laborHours)} reviewed hours ·{" "}
                  {result.payrollInputCount} payroll input
                  {result.payrollInputCount === 1 ? "" : "s"}
                </small>
              </div>
            </article>
            <article>
              <span className="live-profitability__bucket-code">03</span>
              <div>
                <p>Rental equipment</p>
                <strong data-testid="live-profit-equipment">
                  {formatMoney(result.equipmentCost)}
                </strong>
                <small>
                  {result.rentalReservationCount} priced rental
                  {result.rentalReservationCount === 1 ? "" : "s"} ·{" "}
                  {result.equipmentReservationCount} total reservations
                </small>
              </div>
            </article>
          </div>

          {result.hasIncompletePricing ? (
            <div className="live-profitability__notice" role="note">
              <strong>Some committed work is not priced yet.</strong>
              <span>
                {[
                  result.unpricedLaborHours > 0
                    ? `${hours.format(result.unpricedLaborHours)} labor hours need rates`
                    : null,
                  result.unpricedRentalReservationCount > 0
                    ? `${result.unpricedRentalReservationCount} rental reservation${result.unpricedRentalReservationCount === 1 ? " needs" : "s need"} a catalog value`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                . Margin reflects priced commitments only.
              </span>
            </div>
          ) : null}

          <footer className="live-profitability__footer">
            Revenue uses issued, non-void event invoices. Ingredient value uses
            submitted purchase contributions; labor uses reviewed payroll
            amounts or explicit rates; equipment uses active rented catalog
            value. Final closeout may differ.
          </footer>
        </>
      )}
    </section>
  );
}
