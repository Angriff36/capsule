import { Link } from "react-router-dom";
import { formatMoney } from "../../lib/format";
import { EventOverviewCard } from "./EventOverviewCard";

function Tile({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: "ok" | "warn";
}) {
  return (
    <div className="event-money-tile" data-tone={tone}>
      <div className="event-money-label">{label}</div>
      <div className="event-money-value">{value}</div>
    </div>
  );
}

/**
 * Budget against quote. The third tile is the variance between the two — the
 * cost-based margin lives on the Margin tab, which this card links to rather
 * than restating a number it cannot compute here.
 */
export function EventBudgetCard({
  budgetAmount,
  quotedPrice,
  currencyCode,
  marginHref,
  locked,
}: {
  readonly budgetAmount?: number | null;
  readonly quotedPrice?: number | null;
  readonly currencyCode: string;
  readonly marginHref: string;
  readonly locked: boolean;
}) {
  const budget = budgetAmount ?? 0;
  const quoted = quotedPrice ?? 0;
  const variance = quoted - budget;
  return (
    <EventOverviewCard
      title="Budget & pricing"
      testId="event-budget-card"
      aside={
        <span className="flex items-center gap-3">
          {locked ? (
            <span className="chip border-line-2 bg-inset text-ink-2">
              Locked at this stage
            </span>
          ) : null}
          <Link
            to={marginHref}
            className="text-base font-medium text-link hover:underline"
          >
            Margin detail
          </Link>
        </span>
      }
    >
      <div className="event-money-grid">
        <Tile
          label="Client budget"
          value={formatMoney(budgetAmount, currencyCode)}
        />
        <Tile
          label="Quoted price"
          value={formatMoney(quotedPrice, currencyCode)}
        />
        <Tile
          label={variance > 0 ? "Over budget" : "Under budget"}
          value={formatMoney(Math.abs(variance), currencyCode)}
          tone={variance > 0 ? "warn" : "ok"}
        />
      </div>
    </EventOverviewCard>
  );
}
