import { FieldHelp } from "../../ui/FieldHelp";

type Props = {
  thresholdPct: number;
  onThresholdChange: (next: number) => void;
  showCreate: boolean;
  onToggleCreate: () => void;
};

export function DemandLedgerMasthead({
  thresholdPct,
  onThresholdChange,
  showCreate,
  onToggleCreate,
}: Props) {
  return (
    <header className="supply-masthead">
      <div>
        <p className="eyebrow">Inventory - Demand ledger</p>
        <h1 className="display-title mt-2">
          <span className="field-label-row">
            What each event needs
            <FieldHelp term="demand" />
          </span>
        </h1>
        <p className="mt-3 max-w-160 text-ink-2">
          Capsule works this list out for you: every event&apos;s dishes and
          headcount become the ingredients and amounts below. Purchasing draws
          from this list. You do not type it in.
        </p>
      </div>
      <div className="supply-masthead-actions">
        <label className="field-label" style={{ marginBottom: 0 }}>
          Flag amounts off from past events by
          <select
            className="input"
            value={thresholdPct}
            onChange={(event) => onThresholdChange(Number(event.target.value))}
          >
            {[20, 30, 40, 50, 75].map((pct) => (
              <option key={pct} value={pct}>
                +/-{pct}%
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" onClick={onToggleCreate}>
          {showCreate ? "Close form" : "Add a line by hand"}
        </button>
      </div>
    </header>
  );
}
