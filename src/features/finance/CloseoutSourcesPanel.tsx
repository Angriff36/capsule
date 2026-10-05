import { formatMoneyExact } from "../../lib/format";
import type {
  CloseoutLine,
  CloseoutLineKey,
} from "../../lib/closeoutSourceProjection";
import type { CloseoutSources } from "../facilities/useCloseoutSources";

// PL-CLOSEOUT (spec §15.5, AC-628 / AC-386): plan vs actual per closeout
// line, with the records behind each number. Lines the records answer are
// shown, not typed; a line still open gets an amount box (`entered.<key>`).

const RECORD_NAMES: Record<string, string> = {
  invoices: "Invoice",
  creditMemos: "Credit",
  payments: "Payment",
  vendorOrderLines: "Food delivery",
  wasteRecords: "Waste entry",
  timeRecords: "Clocked shift",
  rentalOrderLines: "Rental",
  equipmentIssues: "Equipment problem",
  revenueAttributions: "Commission",
  eventVehicleAssignments: "Truck run",
  eventGuests: "Guest",
};

function amount(line: CloseoutLine, value: number | null) {
  if (value == null) return "—";
  return line.key === "headcount" ? String(value) : formatMoneyExact(value);
}

function RecordList({ line }: { line: CloseoutLine }) {
  if (line.sources.length === 0) return null;
  return (
    <details>
      <summary className="text-xs text-ink-3">
        {line.sources.length} record{line.sources.length === 1 ? "" : "s"}
      </summary>
      <ul className="text-xs text-ink-3">
        {line.sources.map((source) => (
          <li key={`${source.table}:${source.id}`}>
            {RECORD_NAMES[source.table] ?? "Record"}
            {source.label ? ` · ${source.label}` : ""}
            {line.key === "headcount" || line.key === "labor"
              ? ""
              : ` · ${formatMoneyExact(source.amount)}`}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Reads the typed amounts (only open lines have a box) out of a form. */
export function enteredAmounts(
  data: FormData,
): Partial<Record<CloseoutLineKey, number>> {
  const entered: Partial<Record<CloseoutLineKey, number>> = {};
  for (const [name, raw] of data.entries()) {
    if (!name.startsWith("entered.")) continue;
    const text = String(raw).trim();
    if (text === "") continue;
    const value = Number(text);
    if (!Number.isFinite(value)) {
      throw new Error("Amounts have to be numbers.");
    }
    entered[name.slice("entered.".length) as CloseoutLineKey] = value;
  }
  return entered;
}

export function CloseoutSourcesPanel({
  sources,
}: {
  sources: CloseoutSources | null | undefined;
}) {
  if (sources === undefined) {
    return (
      <p className="text-sm text-ink-3">Adding up this event's records…</p>
    );
  }
  if (sources === null) {
    return (
      <p className="text-sm text-warn">
        Only finance staff and event managers can see this event's numbers.
      </p>
    );
  }
  const { projection } = sources;
  return (
    <div className="supply-table-wrap">
      <table className="supply-table" data-testid="closeout-sources">
        <thead>
          <tr>
            <th>Area</th>
            <th>Planned</th>
            <th>From records</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {projection.lines.map((line) => (
            <tr key={line.key} data-line={line.key}>
              <td>
                <strong>{line.label}</strong>
                <RecordList line={line} />
              </td>
              <td>{amount(line, line.planned)}</td>
              <td>{amount(line, line.actual)}</td>
              <td>
                {line.complete ? (
                  <span className="text-sm text-ink-2">Complete</span>
                ) : (
                  <label className="field-label">
                    <span className="text-xs text-warn">{line.note}</span>
                    <input
                      className="input"
                      name={`entered.${line.key}`}
                      type="number"
                      min="0"
                      step={line.key === "headcount" ? "1" : "0.01"}
                      aria-label={`${line.label} to use`}
                      placeholder={
                        line.actual == null
                          ? "Enter amount"
                          : String(line.actual)
                      }
                    />
                  </label>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-ink-3">
        Billed {formatMoneyExact(projection.billed)} · Received{" "}
        {formatMoneyExact(projection.collected)} · Still owed{" "}
        {formatMoneyExact(projection.outstanding)}
      </p>
    </div>
  );
}
