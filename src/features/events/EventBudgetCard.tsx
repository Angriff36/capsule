import { Link } from "react-router-dom";
import { formatMoney } from "../../lib/format";
import { eventCommercialQuotedPrice } from "./eventCommercialSeed";
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
  // New events save "not given" as 0; a $0 budget or price is not a real one.
  const budget = budgetAmount != null && budgetAmount > 0 ? budgetAmount : null;
  const quotedRaw = eventCommercialQuotedPrice({ quotedPrice });
  const quoted = quotedRaw != null && quotedRaw > 0 ? quotedRaw : null;
  const variance = budget == null || quoted == null ? null : quoted - budget;
  return (
    <EventOverviewCard
      title="Budget & pricing"
      testId="event-budget-card"
      aside={
        <span className="flex items-center gap-3">
          {locked ? (
            <span className="chip chip-tone-mute">Locked at this stage</span>
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
          value={
            budget == null ? "Not given" : formatMoney(budget, currencyCode)
          }
        />
        <Tile
          label="Quoted price"
          value={
            quoted == null
              ? "Not priced yet"
              : formatMoney(quoted, currencyCode)
          }
        />
        <Tile
          label={
            variance == null
              ? "Budget variance"
              : variance > 0
                ? "Over budget"
                : "Under budget"
          }
          value={
            variance == null
              ? "Nothing to compare"
              : formatMoney(Math.abs(variance), currencyCode)
          }
          tone={variance == null ? undefined : variance > 0 ? "warn" : "ok"}
        />
      </div>
    </EventOverviewCard>
  );
}
