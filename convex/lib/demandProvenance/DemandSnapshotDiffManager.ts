import type { DemandProvenanceChange } from "./types";

const snapshotInputs = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/** Compare stored snapshots only; today's recipe must never rewrite history. */
export function changedInputs(
  before: unknown,
  after: unknown,
): DemandProvenanceChange["changedInputs"] {
  const oldValues = snapshotInputs(before);
  const nextValues = snapshotInputs(after);
  const inputs = (value: Record<string, unknown>) =>
    value.inputValues && typeof value.inputValues === "object"
      ? (value.inputValues as Record<string, unknown>)
      : value;
  const oldInputs = inputs(oldValues);
  const nextInputs = inputs(nextValues);
  const keys = new Set([...Object.keys(oldInputs), ...Object.keys(nextInputs)]);
  return [...keys].flatMap((key) => {
    const before = oldInputs[key] as { label?: unknown; value?: unknown } | undefined;
    const after = nextInputs[key] as { label?: unknown; value?: unknown } | undefined;
    const beforeValue = before && typeof before === "object" && "value" in before ? String(before.value) : before == null ? "Not used" : String(before);
    const afterValue = after && typeof after === "object" && "value" in after ? String(after.value) : after == null ? "Not used" : String(after);
    if (beforeValue === afterValue) return [];
    const label = (after?.label ?? before?.label ?? key);
    return [{ label: String(label), before: beforeValue, after: afterValue }];
  });
}
