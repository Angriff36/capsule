import type { BatchCompletionEntry } from "./batchCompletion";

type Props = {
  title: string;
  unit: string;
  entry: BatchCompletionEntry | undefined;
  onChange: (entry: BatchCompletionEntry) => void;
};

/** Counted yield (required, zero allowed) and optional waste with a reason. */
export function BatchCompletionFields({ title, unit, entry, onChange }: Props) {
  const set = (patch: BatchCompletionEntry) => onChange({ ...entry, ...patch });
  const wasted = Number(entry?.waste ?? 0) > 0;
  return (
    <>
      <label className="kds-detail">
        Actual yield ({unit})
        <input
          className="input"
          type="number"
          min="0"
          step="any"
          required
          aria-label={`Actual yield for ${title} in ${unit}`}
          value={entry?.yield ?? ""}
          onChange={(event) => set({ yield: event.target.value })}
        />
      </label>
      <label className="kds-detail">
        Wasted ({unit}, if any)
        <input
          className="input"
          type="number"
          min="0"
          step="any"
          aria-label={`Wasted amount for ${title} in ${unit}`}
          value={entry?.waste ?? ""}
          onChange={(event) => set({ waste: event.target.value })}
        />
      </label>
      {wasted ? (
        <label className="kds-detail">
          Why was it wasted?
          <input
            className="input"
            type="text"
            required
            aria-label={`Why ${title} was wasted`}
            value={entry?.wasteReason ?? ""}
            onChange={(event) => set({ wasteReason: event.target.value })}
          />
        </label>
      ) : null}
    </>
  );
}
