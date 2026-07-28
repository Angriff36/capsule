import { useEffect, useMemo, useState } from "react";
import { type Id } from "../../lib/api";
import { formatStatusLabel } from "../../lib/statusLabels";
import { useInventoryAuditForItem } from "../../lib/inventoryAuditClient";
import {
  useListIngredient,
  useListInventoryItem,
  useListStorageLocation,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import {
  chainInventoryAudit,
  INVENTORY_AUDIT_GENESIS_HASH,
  type ChainedInventoryAuditEntry,
} from "./inventoryAuditIntegrity";
import "./InventoryAuditLogPage.css";

export function InventoryAuditLogPage() {
  const items = useListInventoryItem();
  const ingredients = useListIngredient();
  const locations = useListStorageLocation();
  const loadAudit = useInventoryAuditForItem();
  const activeItems = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item.deletedAt == null)
        .sort((left, right) => {
          const leftIngredient =
            ingredients?.find((row) => row._id === left.ingredientId)?.name ??
            "";
          const rightIngredient =
            ingredients?.find((row) => row._id === right.ingredientId)?.name ??
            "";
          return (
            leftIngredient.localeCompare(rightIngredient) ||
            String(left._id).localeCompare(String(right._id))
          );
        }),
    [ingredients, items],
  );
  const [selectedId, setSelectedId] = useState("");
  const [entries, setEntries] = useState<ChainedInventoryAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (activeItems.length === 0) {
      setSelectedId("");
      return;
    }
    if (!activeItems.some((item) => item._id === selectedId)) {
      setSelectedId(activeItems[0]._id);
    }
  }, [activeItems, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setEntries([]);
      setFailure(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailure(null);
    setCopied(false);
    void loadAudit({
      inventoryItemId: selectedId as Id<"inventoryItems">,
    })
      .then(chainInventoryAudit)
      .then((nextEntries) => {
        if (!cancelled) setEntries(nextEntries);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setEntries([]);
          setFailure(readError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadAudit, refreshKey, selectedId]);

  const selectedItem = activeItems.find((item) => item._id === selectedId);
  const ingredientName = selectedItem
    ? (ingredients?.find(
        (ingredient) => ingredient._id === selectedItem.ingredientId,
      )?.name ?? "Unknown ingredient")
    : "Choose a stock line";
  const locationName = selectedItem
    ? (locations?.find((location) => location._id === selectedItem.locationId)
        ?.name ?? "Unknown location")
    : "No location selected";
  const rootHash =
    entries.at(-1)?.integrityHash ?? INVENTORY_AUDIT_GENESIS_HASH;
  const newestFirst = [...entries].reverse();
  const physicalChanges = entries.filter(
    (entry) => entry.measure === "on_hand",
  ).length;
  const reservationChanges = entries.length - physicalChanges;

  const copyRoot = () => {
    void navigator.clipboard.writeText(rootHash).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="operations-stage supply-stage inventory-audit-page">
      <header className="supply-masthead inventory-audit-masthead">
        <div>
          <p className="eyebrow">Inventory · Evidence ledger</p>
          <h1 className="display-title mt-2">Quantity audit log</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Follow every on-hand and reservation change back to its actor,
            timestamp, and before/after quantity.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!selectedId || loading}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          {loading ? "Reading ledger…" : "Refresh evidence"}
        </button>
      </header>
      <InventoryWorkspaceNav />

      <section className="inventory-audit-selector" aria-label="Audit subject">
        <label className="field-label" htmlFor="inventory-audit-item">
          Inventory item
          <select
            id="inventory-audit-item"
            className="input"
            value={selectedId}
            disabled={items === undefined || activeItems.length === 0}
            onChange={(event) => setSelectedId(event.currentTarget.value)}
          >
            {activeItems.length === 0 ? (
              <option value="">No active stock lines</option>
            ) : null}
            {activeItems.map((item) => {
              const ingredient =
                ingredients?.find((row) => row._id === item.ingredientId)
                  ?.name ?? "Unknown ingredient";
              const location =
                locations?.find((row) => row._id === item.locationId)?.name ??
                "Unknown location";
              return (
                <option key={item._id} value={item._id}>
                  {ingredient} · {location}
                </option>
              );
            })}
          </select>
        </label>
        <div className="inventory-audit-subject">
          <span>Current subject</span>
          <strong>{ingredientName}</strong>
          <small>
            {locationName}
            {selectedItem
              ? ` · ${formatQuantity(selectedItem.quantityOnHand)} ${selectedItem.unit} on hand`
              : ""}
          </small>
        </div>
      </section>

      {failure ? (
        <div className="inventory-audit-error" role="alert">
          <strong>Audit history could not be read.</strong>
          <span>{failure}</span>
        </div>
      ) : null}

      <section
        className="inventory-integrity-rail"
        aria-label="Integrity chain"
      >
        <div className="inventory-integrity-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="inventory-integrity-copy">
          <p className="eyebrow">SHA-256 chain checkpoint</p>
          <strong data-testid="inventory-audit-root">
            {abbreviateHash(rootHash)}
          </strong>
          <span>
            Each row includes the prior digest. Changing, removing, inserting,
            or reordering history changes this root; record it for later
            comparison.
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={entries.length === 0}
          onClick={copyRoot}
        >
          {copied ? "Root copied" : "Copy root"}
        </button>
      </section>

      <div className="inventory-audit-stats" aria-live="polite">
        <AuditStat label="Ledger entries" value={entries.length} />
        <AuditStat label="On-hand changes" value={physicalChanges} />
        <AuditStat label="Reservation changes" value={reservationChanges} />
        <AuditStat
          label="Latest evidence"
          value={
            entries.length
              ? formatCompactTimestamp(entries.at(-1)!.occurredAt)
              : "—"
          }
        />
      </div>

      <section className="working-ledger inventory-audit-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">
              Newest first · chain computed oldest first
            </p>
            <h2>Movement evidence</h2>
          </div>
          <span>{entries.length} immutable facts</span>
        </div>

        {loading || items === undefined ? (
          <TableSkeleton rows={7} />
        ) : !selectedItem ? (
          <div className="document-empty">
            <p>Open a stock line first.</p>
            <span>The audit ledger appears after an InventoryItem exists.</span>
          </div>
        ) : newestFirst.length === 0 ? (
          <div className="document-empty">
            <p>No quantity events were found.</p>
            <span>
              Opening, receiving, adjusting, recounting, reserving, issuing,
              wasting, or transferring stock will add evidence here.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table inventory-audit-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Change</th>
                  <th>Actor</th>
                  <th>Measure</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Delta</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((entry) => (
                  <tr key={entry.eventId} data-testid="inventory-audit-entry">
                    <td className="inventory-audit-when">
                      <strong>{formatDate(entry.occurredAt)}</strong>
                      <small>{formatTime(entry.occurredAt)}</small>
                    </td>
                    <td>
                      <span
                        className={`inventory-audit-action inventory-audit-action--${entryTone(entry)}`}
                      >
                        {entry.action}
                      </span>
                      <strong>{entry.reason}</strong>
                      <small>{formatStatusLabel(entry.eventType)}</small>
                    </td>
                    <td>
                      <code
                        className="inventory-audit-actor"
                        title={entry.actorId ?? undefined}
                      >
                        {entry.actorId
                          ? abbreviateActor(entry.actorId)
                          : "Legacy · not captured"}
                      </code>
                    </td>
                    <td>
                      <span className="inventory-audit-measure">
                        {entry.measure === "on_hand" ? "On hand" : "Reserved"}
                      </span>
                    </td>
                    <td className="supply-number">
                      {formatQuantity(entry.quantityBefore)} {entry.unit}
                    </td>
                    <td className="supply-number">
                      <strong>
                        {formatQuantity(entry.quantityAfter)} {entry.unit}
                      </strong>
                    </td>
                    <td
                      className={`supply-number inventory-audit-delta inventory-audit-delta--${entry.delta < 0 ? "down" : entry.delta > 0 ? "up" : "flat"}`}
                    >
                      {formatSignedQuantity(entry.delta)}
                    </td>
                    <td>
                      <code
                        className="inventory-audit-hash"
                        title={entry.integrityHash}
                      >
                        {entry.integrityHash.slice(0, 12)}
                      </code>
                      <small title={entry.previousHash}>
                        prev {entry.previousHash.slice(0, 8)}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AuditStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function entryTone(entry: ChainedInventoryAuditEntry): string {
  if (entry.action === "Waste" || entry.action === "Issued") return "out";
  if (entry.delta > 0) return "in";
  if (entry.delta < 0) return "out";
  return "neutral";
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(value);
}

function formatSignedQuantity(value: number): string {
  const quantity = formatQuantity(Math.abs(value));
  if (value > 0) return `+${quantity}`;
  if (value < 0) return `−${quantity}`;
  return quantity;
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatCompactTimestamp(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function abbreviateHash(value: string): string {
  return `${value.slice(0, 18)}…${value.slice(-10)}`;
}

function abbreviateActor(value: string): string {
  return value.length <= 26
    ? value
    : `${value.slice(0, 14)}…${value.slice(-8)}`;
}

function readError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The audit service returned an unexpected error.";
}
