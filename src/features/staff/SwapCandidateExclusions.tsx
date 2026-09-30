type Exclusion = { personId: string; name: string; reason: string };

/** Coworkers who can't take this shift, each with the reason (AC-515). */
export function SwapCandidateExclusions({
  excluded,
}: {
  excluded: readonly Exclusion[];
}) {
  if (excluded.length === 0) return null;
  return (
    <details className="text-sm text-ink-2" data-testid="swap-exclusions">
      <summary className="cursor-pointer">
        Can't take this shift ({excluded.length})
      </summary>
      <ul className="mt-2 space-y-1">
        {excluded.map((row) => (
          <li key={row.personId}>
            <span className="font-medium text-ink">{row.name}</span>
            {" - "}
            {row.reason}
          </li>
        ))}
      </ul>
    </details>
  );
}
