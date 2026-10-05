import { explainPackLine, type PackLineFacts } from "./packLineExplanation";

/** "Why this many?" under a pack line: where it came from, the working for
 * every source, whose it is, and whether it comes back. */
export function PackLineWhy({ line }: { line: PackLineFacts }) {
  const why = explainPackLine(line);
  return (
    <>
      {why.leftOff ? <small className="block">{why.leftOff}</small> : null}
      <details className="mt-1">
        <summary className="cursor-pointer text-sm text-ink-3">
          Why {line.requiredQuantity}?
        </summary>
        <div className="mt-1 text-sm text-ink-2">
          <p>{why.origin}</p>
          {why.reasons.length > 0 ? (
            <ul className="ml-4 list-disc">
              {why.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {why.details.length > 0 ? <p>{why.details.join(" · ")}</p> : null}
        </div>
      </details>
    </>
  );
}
