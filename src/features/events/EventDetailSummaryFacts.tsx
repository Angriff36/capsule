import { Link } from "react-router-dom";
import {
  formatCount,
  formatDate,
  formatMoney,
  formatTime,
} from "../../lib/format";
import { StatusChip } from "../../ui/primitives";
import { clientDisplayName } from "./clientName";

type ClientRow = { _id: string } | null | undefined;

type Props = {
  startsAt?: number | null;
  endsAt?: number | null;
  expectedHeadcount?: number | null;
  budgetAmount?: number | null;
  quotedPrice?: number | null;
  venue?: { name: string } | null;
  clientId: string;
  clients: readonly ClientRow[] | undefined;
  primaryContactName?: string | null;
  stage: string;
};

/** Persistent editable-context facts above Event detail tabs. */
export function EventDetailSummaryFacts({
  startsAt,
  endsAt,
  expectedHeadcount,
  budgetAmount,
  quotedPrice,
  venue,
  clientId,
  clients,
  primaryContactName,
  stage,
}: Props) {
  return (
    <dl className="grid gap-2 rounded-xs border border-line bg-surface px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt className="text-[11px] uppercase text-ink-3">Start</dt>
        <dd className="font-mono text-[13px]">
          {formatDate(startsAt)} {formatTime(startsAt)}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] uppercase text-ink-3">End</dt>
        <dd className="font-mono text-[13px]">
          {formatDate(endsAt)} {formatTime(endsAt)}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] uppercase text-ink-3">Headcount</dt>
        <dd className="font-mono text-[13px]">
          {formatCount(expectedHeadcount)}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] uppercase text-ink-3">Budget / quoted</dt>
        <dd className="font-mono text-[13px]">
          {formatMoney(budgetAmount)} / {formatMoney(quotedPrice)}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] uppercase text-ink-3">Venue</dt>
        <dd className="text-[13px]">
          {venue ? (
            <Link to="/facilities" className="underline">
              {venue.name}
            </Link>
          ) : (
            "—"
          )}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] uppercase text-ink-3">Client</dt>
        <dd className="text-[13px]">
          <Link to={`/clients/${clientId}`} className="underline">
            {clientDisplayName(clientId, clients as never)}
          </Link>
        </dd>
      </div>
      <div>
        <dt className="text-[11px] uppercase text-ink-3">Primary contact</dt>
        <dd className="text-[13px]">{primaryContactName || "—"}</dd>
      </div>
      <div>
        <dt className="text-[11px] uppercase text-ink-3">Status</dt>
        <dd>
          <StatusChip status={stage} />
        </dd>
      </div>
    </dl>
  );
}
