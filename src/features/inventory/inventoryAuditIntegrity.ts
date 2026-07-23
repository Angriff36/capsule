export interface InventoryAuditEntry {
  eventId: string;
  eventType: string;
  action: string;
  measure: "on_hand" | "reserved";
  quantityBefore: number;
  quantityAfter: number;
  delta: number;
  unit: string;
  actorId: string | null;
  occurredAt: number;
  reason: string;
  referenceId: string | null;
}

export interface ChainedInventoryAuditEntry extends InventoryAuditEntry {
  previousHash: string;
  integrityHash: string;
}

export const INVENTORY_AUDIT_GENESIS_HASH = "0".repeat(64);

/**
 * Link normalized audit facts in chronological order. The resulting root is a
 * portable checkpoint: any changed, removed, inserted, or reordered fact
 * produces a different root on the next read.
 */
export async function chainInventoryAudit(
  entries: readonly InventoryAuditEntry[],
): Promise<ChainedInventoryAuditEntry[]> {
  let previousHash = INVENTORY_AUDIT_GENESIS_HASH;
  const chained: ChainedInventoryAuditEntry[] = [];

  for (const entry of entries) {
    const integrityHash = await sha256(
      JSON.stringify([
        previousHash,
        entry.eventId,
        entry.eventType,
        entry.action,
        entry.measure,
        entry.quantityBefore,
        entry.quantityAfter,
        entry.delta,
        entry.unit,
        entry.actorId,
        entry.occurredAt,
        entry.reason,
        entry.referenceId,
      ]),
    );
    chained.push({ ...entry, previousHash, integrityHash });
    previousHash = integrityHash;
  }

  return chained;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
