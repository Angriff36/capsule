import {
  unresolvedReasons,
  type PackReadinessLine,
} from "../../lib/packReadiness";

/** Names the lines that keep this list from being marked packed, before
 * anyone presses the button (spec §13.4). Nothing shows when none do. */
export function PackReadinessNotice({ lines }: { lines: PackReadinessLine[] }) {
  const reasons = unresolvedReasons(lines);
  if (reasons.length === 0) return null;
  return (
    <section
      className="mt-3 rounded-sm border border-line-2 bg-panel p-3"
      role="status"
    >
      <p className="eyebrow">Can't be marked packed yet</p>
      <ul className="mt-1 ml-4 list-disc text-base text-ink-2">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </section>
  );
}
