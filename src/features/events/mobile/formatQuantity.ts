/** Prep and pack quantities: up to 3 decimals, no float noise (1.878, not 1.8780000000000001). */
export function formatQuantity(value: number): string {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
}
