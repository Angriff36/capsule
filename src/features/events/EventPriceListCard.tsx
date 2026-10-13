import { useState } from "react";
import type { Id } from "../../lib/api";
import { formatCount, formatMoney, formatMoneyExact } from "../../lib/format";
import { useEventPriceList } from "../../lib/eventPriceListQueries";
import { useEventChangePricing } from "../../lib/manifest-convex-react";
import { reportActionFail, reportActionOk } from "../../ui/action-result";
import { useGenerateProposalDraft } from "../clients/ProposalDraftCheck";
import { ProposalPricingPanel } from "../clients/ProposalPricingPanel";
import { EventStaffBilling } from "./EventStaffBilling";

/**
 * The event's price, line by line: each menu per guest or per dish, a dish
 * priced differently for this event, packages, rentals and fees. The lines
 * live on the event's proposal, so the proposal and the invoice show the same
 * total; while the event is planned its price follows this list.
 */
export function EventPriceListCard({
  eventId,
  guestCount,
  quotedPrice,
  budgetAmount,
  version,
  startsAt,
  endsAt,
}: {
  eventId: Id<"events">;
  guestCount: number;
  quotedPrice: number;
  budgetAmount: number | null;
  version: number | undefined;
  startsAt: number | null;
  endsAt: number | null;
}) {
  const list = useEventPriceList(eventId);
  const build = useGenerateProposalDraft();
  const changePricing = useEventChangePricing();
  const [busy, setBusy] = useState(false);
  if (list === undefined) return null;

  // A list priced before the event followed it (an older quote request)
  // catches the event's price up in one press.
  const behind =
    list != null &&
    // The price command also writes the budget; one never recorded stays so.
    budgetAmount != null &&
    list.followsEvent &&
    list.total > 0 &&
    Math.round(list.total * 100) !== Math.round(quotedPrice * 100);
  const useListTotal = async () => {
    if (!list || budgetAmount == null) return;
    setBusy(true);
    try {
      await changePricing({
        docId: eventId,
        budgetAmount,
        quotedPrice: list.total,
        version,
      });
      reportActionOk(
        `The event's price is now ${formatMoneyExact(list.total)}.`,
      );
    } catch (error) {
      reportActionFail(
        error instanceof Error
          ? error.message
              .replace(/^.*(ConvexError|Uncaught Error): /, "")
              .split("\n")[0]!
          : "Couldn't change the event's price.",
      );
    } finally {
      setBusy(false);
    }
  };

  const buildFromMenu = async () => {
    setBusy(true);
    try {
      const result = await build({ eventId });
      reportActionOk(
        result.created
          ? "Price list built from the menu. Change any line below."
          : result.changed
            ? "Price list brought up to date with the menu. Your changes were kept."
            : "The price list already matches the menu.",
      );
    } catch (error) {
      reportActionFail(
        error instanceof Error
          ? error.message
              .replace(/^.*(ConvexError|Uncaught Error): /, "")
              .split("\n")[0]!
          : "Couldn't build the price list.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-sm border border-line bg-panel p-4"
      data-testid="event-price-list"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl text-ink">Price list</h3>
        {list ? (
          <div className="flex flex-wrap gap-2">
            {/* Only a list built from the menu can take in menu changes. */}
            {list.status === "draft" && list.generated ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => void buildFromMenu()}
              >
                {busy ? "Working…" : "Bring in menu changes"}
              </button>
            ) : null}
            <a
              className="btn btn-ghost btn-sm"
              href={`/events/${eventId}/proposal`}
              target="_blank"
            >
              Open the proposal
            </a>
          </div>
        ) : null}
      </div>
      {list ? (
        <>
          <p className="mt-1 text-sm text-ink-2">
            {list.followsEvent
              ? "Change any price here — a dish, a menu's price per guest, a package or a fee — or add a line. The event's price follows this total."
              : list.status === "accepted"
                ? "The client accepted these prices. To change them, start a change from the proposal."
                : "These prices are on the proposal sent to the client. To change them, start a change from the proposal."}
          </p>
          {behind ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-warn">
                The event's price is {formatMoneyExact(quotedPrice)}, not this
                list's {formatMoneyExact(list.total)}.
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => void useListTotal()}
              >
                Use {formatMoneyExact(list.total)}
              </button>
            </div>
          ) : null}
          <ProposalPricingPanel
            proposalId={list.proposalId}
            guestCount={guestCount}
            taxAmount={list.taxAmount}
            discountAmount={list.discountAmount}
            discountPercent={list.discountPercent}
            editable={list.status === "draft"}
            onFailure={(error) =>
              reportActionFail(
                error instanceof Error
                  ? error.message
                      .replace(/^.*(ConvexError|Uncaught Error): /, "")
                      .split("\n")[0]!
                  : "Couldn't save that price.",
              )
            }
          />
          {list.status === "draft" ? (
            <EventStaffBilling
              eventId={eventId}
              proposalId={list.proposalId}
              eventStartsAt={startsAt}
              eventEndsAt={endsAt}
            />
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-2">
            This event's price is one amount
            {quotedPrice > 0
              ? `: ${formatMoney(quotedPrice)}${guestCount > 0 ? ` for ${formatCount(guestCount)} guests` : ""}`
              : ""}
            . Build a price list from its menu to price each dish, menu, package
            and fee, and change any of them for this event.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={busy}
            onClick={() => void buildFromMenu()}
          >
            {busy ? "Working…" : "Build price list from the menu"}
          </button>
        </>
      )}
    </section>
  );
}
