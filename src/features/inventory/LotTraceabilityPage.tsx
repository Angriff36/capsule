import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useListClient,
  useListEvent,
  useListIngredient,
  useListInventoryItem,
  useListInventoryLot,
  useListInventoryReservation,
  useListStorageLocation,
  useListVendor,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import {
  buildLotTraceabilityRows,
  countUnattributedConsumptions,
} from "./lotTraceability";
import "./LotTraceabilityPage.css";

const quantity = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 4,
});
const date = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function LotTraceabilityPage() {
  const lots = useListInventoryLot();
  const reservations = useListInventoryReservation();
  const events = useListEvent();
  const clients = useListClient();
  const ingredients = useListIngredient();
  const vendors = useListVendor();
  const locations = useListStorageLocation();
  const items = useListInventoryItem();
  const [supplierLotNumber, setSupplierLotNumber] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loading = [
    lots,
    reservations,
    events,
    clients,
    ingredients,
    vendors,
    locations,
    items,
  ].some((catalog) => catalog === undefined);
  const receivedFrom = startOfDay(fromDate);
  const receivedTo = endOfDay(toDate);
  const hasFilter =
    supplierLotNumber.trim().length > 0 ||
    fromDate.length > 0 ||
    toDate.length > 0;
  const invalidRange =
    receivedFrom != null && receivedTo != null && receivedFrom > receivedTo;

  const rows = useMemo(
    () =>
      !hasFilter || invalidRange
        ? []
        : buildLotTraceabilityRows(
            {
              lots: lots ?? [],
              reservations: reservations ?? [],
              events: events ?? [],
              clients: clients ?? [],
              ingredients: ingredients ?? [],
              vendors: vendors ?? [],
              locations: locations ?? [],
              items: items ?? [],
            },
            { supplierLotNumber, receivedFrom, receivedTo },
          ),
    [
      clients,
      receivedFrom,
      receivedTo,
      events,
      hasFilter,
      ingredients,
      invalidRange,
      items,
      locations,
      lots,
      reservations,
      supplierLotNumber,
      vendors,
    ],
  );
  const unattributed =
    hasFilter && !supplierLotNumber.trim() && !invalidRange
      ? countUnattributedConsumptions(reservations ?? [])
      : 0;
  const affectedEvents = new Set(rows.map((row) => row.eventId)).size;
  const affectedClients = new Set(
    rows.map((row) => row.clientId).filter(Boolean),
  ).size;
  const matchingLots = new Set(rows.map((row) => row.lotId)).size;
  const issueFacts = rows.reduce((sum, row) => sum + row.consumptionCount, 0);

  const clearFilters = () => {
    setSupplierLotNumber("");
    setFromDate("");
    setToDate("");
  };

  return (
    <div className="operations-stage supply-stage lot-trace-page">
      <header className="supply-masthead lot-trace-masthead">
        <div>
          <p className="eyebrow">Inventory · Recall response</p>
          <h1 className="display-title mt-2">Lot-to-event trace</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Identify every event and client served from a supplier lot, with a
            durable issue-time trail ready to print or share with the response
            team.
          </p>
        </div>
        <div className="lot-trace-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!hasFilter}
            onClick={clearFilters}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={rows.length === 0}
            onClick={() => window.print()}
          >
            Print report
          </button>
        </div>
      </header>
      <InventoryWorkspaceNav />

      <section className="lot-trace-filter" aria-label="Trace filters">
        <div className="lot-trace-filter-mark" aria-hidden="true">
          <span>TRACE</span>
          <strong>01</strong>
        </div>
        <label className="field-label" htmlFor="supplier-lot-number">
          Supplier lot number
          <input
            id="supplier-lot-number"
            className="input"
            value={supplierLotNumber}
            placeholder="e.g. VND-24-0817"
            autoComplete="off"
            onChange={(event) =>
              setSupplierLotNumber(event.currentTarget.value)
            }
          />
          <span className="field-hint">Partial, case-insensitive match</span>
        </label>
        <label className="field-label" htmlFor="trace-from-date">
          Lots received from
          <input
            id="trace-from-date"
            className="input"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.currentTarget.value)}
          />
        </label>
        <label className="field-label" htmlFor="trace-to-date">
          Lots received through
          <input
            id="trace-to-date"
            className="input"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.currentTarget.value)}
          />
        </label>
      </section>

      {invalidRange ? (
        <div className="lot-trace-alert" role="alert">
          The received-through date must be on or after the start date.
        </div>
      ) : null}

      <section className="lot-trace-status" aria-live="polite">
        <TraceStat label="Matching lots" value={matchingLots} />
        <TraceStat label="Affected events" value={affectedEvents} />
        <TraceStat label="Affected clients" value={affectedClients} />
        <TraceStat label="Issue facts" value={issueFacts} />
      </section>

      <section className="working-ledger lot-trace-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Consumed reservation evidence</p>
            <h2>Affected event register</h2>
          </div>
          <span data-testid="trace-result-count">
            {affectedEvents} event{affectedEvents === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <TableSkeleton rows={7} />
        ) : !hasFilter ? (
          <div className="document-empty lot-trace-empty">
            <p>Enter a supplier lot or a lot receipt-date range.</p>
            <span>
              Results update immediately and include only stock issues with a
              durable lot link.
            </span>
          </div>
        ) : rows.length === 0 && !invalidRange ? (
          <div className="document-empty lot-trace-empty">
            <p>No affected events matched this trace.</p>
            <span>
              Check the supplier label, widen the date range, or confirm that
              the stock reservation recorded a lot.
            </span>
          </div>
        ) : rows.length > 0 ? (
          <div className="supply-table-wrap">
            <table className="supply-table lot-trace-table">
              <thead>
                <tr>
                  <th>Supplier lot</th>
                  <th>Event / client</th>
                  <th>Ingredient</th>
                  <th>Consumed</th>
                  <th>Issue time</th>
                  <th>Receipt source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} data-testid="trace-result-row">
                    <td>
                      <code className="lot-trace-lot">
                        {row.supplierLotNumber}
                      </code>
                      <small>{row.vendorName}</small>
                    </td>
                    <td>
                      <Link className="text-link" to={`/events/${row.eventId}`}>
                        {row.eventTitle}
                      </Link>
                      {row.clientId ? (
                        <Link
                          className="lot-trace-client"
                          to={`/clients/${row.clientId}`}
                        >
                          {row.clientName}
                        </Link>
                      ) : (
                        <small>{row.clientName}</small>
                      )}
                      <small>
                        Event {formatOptionalDate(row.eventStartsAt)}
                      </small>
                    </td>
                    <td>
                      <strong>{row.ingredientName}</strong>
                      <small>{row.locationName}</small>
                    </td>
                    <td className="supply-number">
                      <strong>
                        {quantity.format(row.quantity)} {row.unit}
                      </strong>
                      <small>
                        {row.consumptionCount} issue
                        {row.consumptionCount === 1 ? "" : "s"}
                      </small>
                    </td>
                    <td>
                      <strong>{dateTime.format(row.lastConsumedAt)}</strong>
                      {row.firstConsumedAt !== row.lastConsumedAt ? (
                        <small>
                          First {dateTime.format(row.firstConsumedAt)}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <strong>{row.vendorName}</strong>
                      <small>
                        Received {formatOptionalDate(row.receivedAt)}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <aside className="lot-trace-method" role="note">
        <strong>Evidence boundary</strong>
        <span>
          This register uses consumed InventoryReservation facts carrying an
          InventoryLot reference. It never infers a lot from ingredient,
          location, or timing alone.
        </span>
        {unattributed > 0 ? (
          <span className="lot-trace-unattributed">
            {unattributed} historical consumed reservation
            {unattributed === 1 ? "" : "s"} lack lot provenance and cannot be
            evaluated against a receipt-date recall window.
          </span>
        ) : null}
      </aside>
    </div>
  );
}

function TraceStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function startOfDay(value: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function endOfDay(value: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function formatOptionalDate(value: number | null | undefined): string {
  return value == null ? "not recorded" : date.format(value);
}
