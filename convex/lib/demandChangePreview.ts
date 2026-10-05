export type DemandChangeLine = {
  key: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  currentQuantity: number;
  nextQuantity: number;
};

export type DemandChangeKind = "recalculate" | "headcount" | "supersede";

export function classifyDemandChange(
  currentQuantity: number,
  nextQuantity: number,
): "added" | "removed" | "changed" | "unchanged" {
  if (currentQuantity === 0 && nextQuantity !== 0) return "added";
  if (currentQuantity !== 0 && nextQuantity === 0) return "removed";
  if (currentQuantity !== nextQuantity) return "changed";
  return "unchanged";
}

/** Compact, deterministic guard value for a preview's source data. It is an
 * optimistic-concurrency fingerprint, not a security boundary. */
export function demandPreviewFingerprint(parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of [...parts].sort().join("\u001f")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `dcp-${(hash >>> 0).toString(16)}`;
}
