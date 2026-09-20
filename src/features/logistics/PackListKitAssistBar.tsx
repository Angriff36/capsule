import { Link } from "react-router-dom";

interface PackListKitAssistBarProps {
  /** Name of the event's service style, or null when the event has none. */
  serviceStyleName: string | null;
  /** Active kit lines for that service style. */
  kitLineCount: number;
  assistanceRequestedAt?: number | null;
  assistanceNote?: string | null;
  busy: string | null;
  onApplyKit: () => void;
  onRequestAssistance: () => void;
  onResolveAssistance: () => void;
}

/**
 * Two list-level controls on a load sheet: put the service style kit on the
 * list again, and tell the Event Tracker that the packer needs a hand.
 */
export function PackListKitAssistBar({
  serviceStyleName,
  kitLineCount,
  assistanceRequestedAt,
  assistanceNote,
  busy,
  onApplyKit,
  onRequestAssistance,
  onResolveAssistance,
}: PackListKitAssistBarProps) {
  return (
    <div className="fact-row mt-3">
      <span className="fact">
        <b>Style kit:</b>
        {serviceStyleName
          ? `${serviceStyleName} · ${kitLineCount} ${kitLineCount === 1 ? "line" : "lines"}`
          : "Event has no service style"}
      </span>
      {serviceStyleName && kitLineCount > 0 ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy != null}
          onClick={onApplyKit}
          title="Adds the kit lines that are not on this list. Lines already here are left alone."
        >
          {busy === "list:applyKit" ? "Working…" : "Add style kit"}
        </button>
      ) : null}
      <Link className="text-link" to="/logistics/style-kits">
        Edit kits
      </Link>
      {assistanceRequestedAt != null ? (
        <>
          <span className="fact" role="status">
            <b>Needs assistance:</b>
            {assistanceNote || "The packer asked for help"}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy != null}
            onClick={onResolveAssistance}
          >
            {busy === "list:resolveAssistance" ? "Working…" : "Resolved"}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy != null}
          onClick={onRequestAssistance}
        >
          Needs assistance
        </button>
      )}
    </div>
  );
}
