/**
 * The one stock calculation (BE-10.1, PR04-03). Every screen that shows on
 * hand, held or free stock reads it from here, and it matches the
 * InventoryItem.availableQuantity rule in src/inventory/stock.manifest:
 * free = on hand minus active holds. The movement ledger check replays the
 * item's history and says whether it lands on the stored on-hand amount.
 */

export interface StockHold {
  inventoryItemId?: string | null;
  status?: string | null;
  quantity?: number | string | null;
  deletedAt?: number | null;
}

export interface StockBalance {
  onHand: number;
  reserved: number;
  available: number;
}

export interface StockLedgerEntry {
  measure: "on_hand" | "reserved";
  quantityBefore: number;
  quantityAfter: number;
  delta: number;
  action?: string;
  eventId?: string;
}

export interface StockLedgerCheck {
  /** On hand after replaying every movement from zero. */
  ledgerOnHand: number;
  /** True when the replay lands on the stored amount and no step skips. */
  matches: boolean;
  /** Stored on hand minus the replayed amount (0 when they agree). */
  difference: number;
  /** Movements whose starting amount is not where the one before ended. */
  gaps: StockLedgerEntry[];
}

/** decimal(12, 4) - trim float noise the same way the stored values are. */
export function stockQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Active holds on one stock line. Released and consumed holds free nothing twice. */
export function reservedOn(itemId: string, holds: readonly StockHold[]) {
  return stockQuantity(
    holds
      .filter(
        (hold) =>
          hold.inventoryItemId === itemId &&
          hold.status === "active" &&
          hold.deletedAt == null,
      )
      .reduce((sum, hold) => sum + amount(hold.quantity), 0),
  );
}

export function stockBalance(
  itemId: string,
  quantityOnHand: number | string | null | undefined,
  holds: readonly StockHold[],
): StockBalance {
  const onHand = stockQuantity(amount(quantityOnHand));
  const reserved = reservedOn(itemId, holds);
  return { onHand, reserved, available: stockQuantity(onHand - reserved) };
}

/** Free stock never shown below zero (holds may exceed a recount). */
export function freeStock(
  itemId: string,
  quantityOnHand: number | string | null | undefined,
  holds: readonly StockHold[],
) {
  return Math.max(0, stockBalance(itemId, quantityOnHand, holds).available);
}

export function checkStockLedger(
  entries: readonly StockLedgerEntry[],
  storedOnHand: number,
): StockLedgerCheck {
  let running = 0;
  const gaps: StockLedgerEntry[] = [];
  for (const entry of entries) {
    if (entry.measure !== "on_hand") continue;
    if (stockQuantity(entry.quantityBefore) !== stockQuantity(running))
      gaps.push(entry);
    running = stockQuantity(running + entry.delta);
  }
  const difference = stockQuantity(amount(storedOnHand) - running);
  return {
    ledgerOnHand: running,
    matches: difference === 0 && gaps.length === 0,
    difference,
    gaps,
  };
}
