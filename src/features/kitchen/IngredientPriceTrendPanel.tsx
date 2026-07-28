import { useMemo, useState } from "react";
import { formatDate, formatMoneyExact } from "../../lib/format";
import {
  observationTime,
  priceChange,
  sortPriceObservations,
  type IngredientPriceObservationInput,
} from "./IngredientPriceHistory";

type VendorOption = {
  _id: string;
  name: string;
};

function trendPath(observations: IngredientPriceObservationInput[]) {
  const chronological = sortPriceObservations(observations).reverse();
  const prices = chronological.map((item) => Number(item.unitPrice));
  if (!prices.length || prices.some((price) => !Number.isFinite(price))) {
    return { points: "", dots: [] as Array<{ x: number; y: number }> };
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const dots = prices.map((price, index) => ({
    x: prices.length === 1 ? 50 : (index / (prices.length - 1)) * 100,
    y: 33 - ((price - min) / range) * 26,
  }));
  return {
    points: dots.map((point) => `${point.x},${point.y}`).join(" "),
    dots,
  };
}

function observedDate(observation: IngredientPriceObservationInput) {
  const at = observationTime(observation);
  return at ? formatDate(at) : "Date unavailable";
}

export function IngredientPriceTrendPanel({
  observations,
  vendors,
  loading = false,
}: {
  observations: IngredientPriceObservationInput[];
  vendors: VendorOption[] | undefined;
  loading?: boolean;
}) {
  const [vendorId, setVendorId] = useState("all");
  const vendorById = useMemo(
    () => new Map((vendors ?? []).map((vendor) => [vendor._id, vendor.name])),
    [vendors],
  );
  const vendorOptions = Array.from(
    new Set(observations.map((observation) => observation.vendorId)),
  ).map((id) => ({ id, name: vendorById.get(id) ?? "Unavailable vendor" }));
  const visible = sortPriceObservations(
    vendorId === "all"
      ? observations
      : observations.filter((observation) => observation.vendorId === vendorId),
  );
  const current = visible[0];
  const change = priceChange(visible);
  const trend = trendPath(visible);
  const changeTone =
    change == null || change.amount === 0
      ? "is-flat"
      : change.amount > 0
        ? "is-up"
        : "is-down";
  const changeLabel = change
    ? `${change.amount > 0 ? "+" : ""}${formatMoneyExact(change.amount)}${change.percent == null ? "" : ` · ${change.percent > 0 ? "+" : ""}${change.percent.toFixed(1)}%`}`
    : "First observation";

  return (
    <section
      className="ingredient-price-ledger"
      aria-labelledby="ingredient-price-history-heading"
      data-testid="ingredient-price-history"
    >
      <div className="ingredient-price-ledger-head">
        <div>
          <p className="eyebrow">Confirmed receipts</p>
          <h2 id="ingredient-price-history-heading">Purchase price history</h2>
          <p>
            Invoice-time prices, captured separately for every vendor receipt.
          </p>
        </div>
        <label>
          Vendor view
          <select
            className="input"
            value={vendorId}
            onChange={(event) => setVendorId(event.target.value)}
          >
            <option value="all">All vendors</option>
            {vendorOptions.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="ingredient-price-empty">Loading confirmed prices…</div>
      ) : current ? (
        <>
          <div className="ingredient-price-snapshot">
            <div>
              <span>Latest confirmed</span>
              <strong data-testid="latest-confirmed-price">
                {formatMoneyExact(Number(current.unitPrice))}
                <small> / {current.unit}</small>
              </strong>
              <em>
                {vendorById.get(current.vendorId) ?? "Unavailable vendor"}
              </em>
            </div>
            <div className={`ingredient-price-change ${changeTone}`}>
              <span>Since prior receipt</span>
              <strong>{changeLabel}</strong>
              <em>{observedDate(current)}</em>
            </div>
            <div className="ingredient-price-chart">
              <svg
                viewBox="0 0 100 40"
                role="img"
                aria-label={`Price trend across ${visible.length} confirmed receipt${visible.length === 1 ? "" : "s"}`}
              >
                <path d="M0 34 H100" />
                {trend.points ? <polyline points={trend.points} /> : null}
                {trend.dots.map((point, index) => (
                  <circle key={index} cx={point.x} cy={point.y} r="1.8" />
                ))}
              </svg>
            </div>
          </div>

          <div className="ingredient-price-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Receipt</th>
                  <th>Unit price</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 8).map((observation) => (
                  <tr key={observation._id}>
                    <td>{observedDate(observation)}</td>
                    <td>
                      {vendorById.get(observation.vendorId) ??
                        "Unavailable vendor"}
                    </td>
                    <td>
                      {observation.receiptQuantity} {observation.unit}
                    </td>
                    <td>
                      <strong>
                        {formatMoneyExact(Number(observation.unitPrice))}
                      </strong>
                      <span> / {observation.unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="ingredient-price-empty">
          <strong>No confirmed receipt prices yet.</strong>
          <span>
            The first priced vendor receipt will start this ingredient’s ledger.
          </span>
        </div>
      )}
    </section>
  );
}
