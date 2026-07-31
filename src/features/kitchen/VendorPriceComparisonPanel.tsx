import {
  latestPriceByVendor,
  observationTime,
  type IngredientPriceObservationInput,
} from "./IngredientPriceHistory";
import { formatDate, formatMoneyExact } from "../../lib/format";

type VendorOption = {
  _id: string;
  name: string;
};

export function VendorPriceComparisonPanel({
  observations,
  vendors,
}: {
  observations: IngredientPriceObservationInput[];
  vendors: VendorOption[] | undefined;
}) {
  const vendorById = new Map(
    (vendors ?? []).map((vendor) => [vendor._id, vendor.name]),
  );
  const rows = Array.from(latestPriceByVendor(observations).values())
    .map((observation) => ({
      observation,
      price: Number(observation.unitPrice),
    }))
    .filter((row) => Number.isFinite(row.price))
    .sort((left, right) => left.price - right.price);

  if (rows.length < 2) return null;

  const lowestPrice = rows[0]!.price;
  const mixedUnits = new Set(rows.map((row) => row.observation.unit)).size > 1;

  return (
    <section
      className="culinary-section"
      aria-labelledby="vendor-price-comparison-heading"
      data-testid="vendor-price-comparison"
    >
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">Buying options</p>
          <h2 id="vendor-price-comparison-heading">Vendor price comparison</h2>
        </div>
        <span>{rows.length} vendors</span>
      </div>
      <p className="max-w-160 text-base text-ink-2">
        Most recent confirmed receipt price from each vendor, cheapest first.
        {mixedUnits
          ? " Vendors receipt in different units — compare with care."
          : ""}
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ observation, price }) => {
          const isLowest = price === lowestPrice;
          const at = observationTime(observation);
          return (
            <li
              key={observation.vendorId}
              data-lowest={isLowest || undefined}
              className={`rounded-sm border bg-panel px-4 py-3 ${
                isLowest ? "border-ink" : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <strong className="text-base">
                  {vendorById.get(observation.vendorId) ?? "Unavailable vendor"}
                </strong>
                {isLowest ? (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-panel">
                    Lowest price
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xl font-semibold">
                {formatMoneyExact(price)}
                <small className="ml-1 text-sm font-normal text-ink-2">
                  / {observation.unit}
                </small>
              </p>
              <p className="text-xs text-ink-3">
                {at
                  ? `Received ${formatDate(new Date(at).getTime())}`
                  : "Date unavailable"}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
