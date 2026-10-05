import type { Doc } from "../../lib/api";
import { formatMoneyExact } from "../../lib/format";
import {
  parseQuoteEstimate,
  parseQuoteSelections,
} from "../../lib/quoteSelections";

/**
 * What the visitor picked on the quote form, the estimate they saw, and
 * where they came from — on the sales queue, so nobody retypes it.
 */
export function QuoteRequestPicks({
  submission,
  referralSourceName,
}: Readonly<{
  submission: Doc<"quoteSubmissions">;
  referralSourceName: string | null;
}>) {
  const selections = parseQuoteSelections(submission.selectionsJson);
  const estimate = parseQuoteEstimate(submission.estimateJson);
  const menuPicks = selections?.lines.filter((l) => l.kind === "menu") ?? [];
  const extras = selections?.lines.filter((l) => l.kind === "extra") ?? [];
  const portions = (quantity: number | null) =>
    quantity == null ? "one per guest" : `${quantity} portions`;
  const heard = referralSourceName ?? submission.howHeardText ?? null;
  const campaign = [
    submission.utmSource,
    submission.utmMedium,
    submission.utmCampaign,
  ].filter(Boolean);

  return (
    <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
      {selections?.menu && (
        <div>
          <dt className="text-2xs uppercase text-ink-3">
            Menu: {selections.menu.name}
          </dt>
          <dd className="text-ink-2">
            {menuPicks.length === 0
              ? "No dishes picked"
              : menuPicks
                  .map((l) => `${l.name} (${portions(l.quantity)})`)
                  .join(", ")}
          </dd>
        </div>
      )}
      {extras.length > 0 && (
        <div>
          <dt className="text-2xs uppercase text-ink-3">Extras</dt>
          <dd className="text-ink-2">
            {extras
              .map((l) => `${l.name} (${portions(l.quantity)})`)
              .join(", ")}
          </dd>
        </div>
      )}
      {estimate && (
        <div>
          <dt className="text-2xs uppercase text-ink-3">
            Estimate shown to client
          </dt>
          <dd className="text-ink-2">
            {formatMoneyExact(estimate.total)} for {estimate.guestCount} guests
            {estimate.priceToFollow.length > 0
              ? ` · to price: ${estimate.priceToFollow.join(", ")}`
              : ""}
          </dd>
        </div>
      )}
      <div>
        <dt className="text-2xs uppercase text-ink-3">Heard about us</dt>
        <dd className="text-ink-2">
          {heard ?? "Not said"}
          {campaign.length > 0 ? ` · campaign ${campaign.join(" / ")}` : ""}
          {submission.referrer ? ` · from ${submission.referrer}` : ""}
        </dd>
      </div>
      <div>
        <dt className="text-2xs uppercase text-ink-3">Consent</dt>
        <dd className="text-ink-2">
          Quote: yes · Offers and news:{" "}
          {submission.marketingConsent ? "yes" : "no"}
        </dd>
      </div>
    </dl>
  );
}
