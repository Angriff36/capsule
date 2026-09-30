import type { FormEvent } from "react";
import { formatMoneyExact } from "../../lib/format";
import {
  useCloseoutResults,
  useEventCloseoutSources,
} from "../facilities/useCloseoutSources";
import { CloseoutSourcesPanel } from "./CloseoutSourcesPanel";

// PL-CLOSEOUT (AC-626): a finalized closeout is corrected with a reason. The
// new numbers come from today's records; every earlier result stays listed.

export function CloseoutCorrectionPanel({
  closeoutId,
  eventId,
  busy,
  onSubmit,
}: {
  closeoutId: string;
  eventId: string;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const sources = useEventCloseoutSources(eventId);
  const results = useCloseoutResults(closeoutId);
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Correct a final closeout</p>
          <h2>Numbers from today's records</h2>
        </div>
      </div>
      <CloseoutSourcesPanel sources={sources} />
      <label className="field-label">
        Why is this being corrected?
        <textarea className="input" name="reason" rows={2} required />
      </label>
      <div className="supply-row-actions">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || sources == null}
        >
          {busy ? "Saving…" : "Save correction"}
        </button>
      </div>
      {results && results.length > 0 ? (
        <div data-testid="closeout-results">
          <p className="eyebrow mt-3">Earlier results</p>
          <ul className="text-sm text-ink-2">
            {results.map((result) => (
              <li key={result.revision}>
                Version {result.revision} ·{" "}
                {new Date(result.at).toLocaleDateString()} · revenue{" "}
                {formatMoneyExact(result.actualRevenue)} · cost{" "}
                {formatMoneyExact(result.totalActualCost)} · profit{" "}
                {formatMoneyExact(result.grossProfit)}
                {result.reason ? ` · ${result.reason}` : " · first final"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
