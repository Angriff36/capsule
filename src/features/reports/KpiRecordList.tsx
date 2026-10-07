import { Link } from "react-router-dom";
import { formatDate, formatMoney } from "@/lib/format";
import {
  closeoutRevenue,
  isCompletedEvent,
  isConvertedLead,
} from "./dashboardRecordSets";

/**
 * The records behind each KPI on Tim's KPIs (spec §7.4): every completed
 * event behind revenue, every closeout behind food cost and profit, and every
 * lead behind conversion, with the value each one adds. Each list ends with
 * a total that equals the figure on its card.
 */

interface KpiEvent {
  readonly _id: string;
  readonly title?: string | null;
  readonly stage?: string | null;
  readonly startsAt?: number | null;
  readonly quotedPrice?: number | null;
  readonly expectedHeadcount?: number | null;
}

interface KpiCloseout {
  readonly _id: string;
  readonly eventId: string;
  readonly grossProfit?: number | null;
  readonly actualIngredientCost?: number | null;
  readonly budgetedCost?: number | null;
}

interface KpiLead {
  readonly _id: string;
  readonly companyName?: string | null;
  readonly givenName?: string | null;
  readonly familyName?: string | null;
  readonly stage?: string | null;
  readonly proposalId?: string | null;
}

const LEAD_STAGE_LABEL: Record<string, string> = {
  new: "New",
  qualified: "Qualified",
  proposalSent: "Proposal Sent",
  negotiating: "Negotiating",
  converted: "Converted",
  lost: "Lost",
};

function leadName(lead: KpiLead): string {
  const person = `${lead.givenName ?? ""} ${lead.familyName ?? ""}`.trim();
  return lead.companyName || person || "Unnamed lead";
}

export function KpiRecordList({
  events,
  closeouts,
  leads,
  acceptedProposals,
}: {
  events: readonly KpiEvent[];
  closeouts: readonly KpiCloseout[];
  leads: readonly KpiLead[];
  acceptedProposals: ReadonlySet<string>;
}) {
  const completed = events.filter(isCompletedEvent);
  const eventTitle = new Map(events.map((e) => [e._id, e.title ?? "Event"]));
  const revenueTotal = completed.reduce((s, e) => s + (e.quotedPrice ?? 0), 0);
  const costTotal = closeouts.reduce(
    (s, c) => s + (c.actualIngredientCost ?? 0),
    0,
  );
  const profitTotal = closeouts.reduce((s, c) => s + (c.grossProfit ?? 0), 0);
  const converted = leads.filter((lead) =>
    isConvertedLead(lead, acceptedProposals),
  ).length;

  return (
    <section className="mt-6 grid gap-3" data-testid="kpi-records">
      <h2 className="text-sm font-semibold text-ink">
        Records behind each figure
      </h2>

      <details data-testid="kpi-records-revenue">
        <summary className="cursor-pointer text-xs text-ink-2">
          Total Revenue: {completed.length} completed events,{" "}
          {formatMoney(revenueTotal)}
        </summary>
        <div className="supply-table-wrap mt-2">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Guests</th>
                <th className="text-right">Quoted price</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((event) => (
                <tr key={event._id}>
                  <td>
                    <Link to={`/events/${event._id}`} className="btn-link">
                      {event.title ?? "Event"}
                    </Link>
                  </td>
                  <td>{event.startsAt ? formatDate(event.startsAt) : "—"}</td>
                  <td>{event.expectedHeadcount ?? "—"}</td>
                  <td className="text-right">
                    {formatMoney(event.quotedPrice ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details data-testid="kpi-records-closeouts">
        <summary className="cursor-pointer text-xs text-ink-2">
          Food Cost % and Profit Rate: {closeouts.length} closeouts, food cost{" "}
          {formatMoney(costTotal)}, profit {formatMoney(profitTotal)}
        </summary>
        <div className="supply-table-wrap mt-2">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Event</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Food cost</th>
                <th className="text-right">Budgeted cost</th>
                <th className="text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {closeouts.map((closeout) => (
                <tr key={closeout._id}>
                  <td>
                    <Link
                      to={`/events/${closeout.eventId}`}
                      className="btn-link"
                    >
                      {eventTitle.get(closeout.eventId) ?? "Event"}
                    </Link>
                  </td>
                  <td className="text-right">
                    {formatMoney(closeoutRevenue(closeout))}
                  </td>
                  <td className="text-right">
                    {formatMoney(closeout.actualIngredientCost ?? 0)}
                  </td>
                  <td className="text-right">
                    {formatMoney(closeout.budgetedCost ?? 0)}
                  </td>
                  <td className="text-right">
                    {formatMoney(closeout.grossProfit ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details data-testid="kpi-records-leads">
        <summary className="cursor-pointer text-xs text-ink-2">
          Lead Conversion: {leads.length} leads, {converted} converted
        </summary>
        <div className="supply-table-wrap mt-2">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id}>
                  <td>{leadName(lead)}</td>
                  <td>
                    {isConvertedLead(lead, acceptedProposals)
                      ? "Converted"
                      : (LEAD_STAGE_LABEL[lead.stage ?? ""] ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
