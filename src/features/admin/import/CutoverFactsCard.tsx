// PL-CUTOVER (AC-287, AC-632): the facts the switch rests on besides the
// sign-off - when TPP stopped taking new entries, the opening stock date,
// how old money records come over, and where the backup is.
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";
import { classifyCommandFailure } from "../../events/CommandFailure";
import { BoundedDateTimeLocalInput } from "@/ui/BoundedDateInputs";

type FinancialMode = "reference_history" | "ledger_reconstruction";

interface SavedFacts {
  sourceFrozenAt: number | null;
  openingStockAsOf: number | null;
  openingStockCount: number | null;
  financialMode: FinancialMode | null;
  backupEvidence: string | null;
}

function toLocalInput(time: number | null): string {
  if (time == null) return "";
  const date = new Date(time);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(time - offset).toISOString().slice(0, 16);
}

function fromLocalInput(text: string): number | undefined {
  if (!text) return undefined;
  const time = new Date(text).getTime();
  return Number.isNaN(time) ? undefined : time;
}

export function CutoverFactsCard({
  saved,
  canEdit,
  onSaved,
  onError,
}: {
  saved: SavedFacts;
  canEdit: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const saveFacts = useMutation(api.cutover.saveCutoverFacts);
  // null = untouched, show the saved value.
  const [frozenAt, setFrozenAt] = useState<string | null>(null);
  const [stockAsOf, setStockAsOf] = useState<string | null>(null);
  const [mode, setMode] = useState<FinancialMode | "" | null>(null);
  const [backup, setBackup] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const frozenValue = frozenAt ?? toLocalInput(saved.sourceFrozenAt);
  const stockValue = stockAsOf ?? toLocalInput(saved.openingStockAsOf);
  const modeValue = mode ?? saved.financialMode ?? "";
  const backupValue = backup ?? saved.backupEvidence ?? "";

  const save = async () => {
    setSaving(true);
    try {
      await saveFacts({
        sourceFrozenAt: frozenAt != null ? fromLocalInput(frozenAt) : undefined,
        openingStockAsOf:
          stockAsOf != null ? fromLocalInput(stockAsOf) : undefined,
        financialMode: mode ? mode : undefined,
        backupEvidence: backup ?? undefined,
      });
      setFrozenAt(null);
      setStockAsOf(null);
      setMode(null);
      setBackup(null);
      onSaved("Switch facts saved.");
    } catch (err) {
      const failure = classifyCommandFailure(err);
      onError(`${failure.title}: ${failure.detail}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-sm p-4 space-y-3">
      <h3 className="font-medium">Switch facts</h3>
      <label className="block space-y-1 text-xs">
        <span className="font-medium">TPP stopped taking new entries at</span>
        <BoundedDateTimeLocalInput
          className="w-full border rounded-sm p-2"
          value={frozenValue}
          onChange={(e) => setFrozenAt(e.target.value)}
          disabled={!canEdit}
        />
        <span className="text-ink-3">
          The last import of each list must run after this time.
        </span>
      </label>
      <label className="block space-y-1 text-xs">
        <span className="font-medium">Opening stock counted as of</span>
        <BoundedDateTimeLocalInput
          className="w-full border rounded-sm p-2"
          value={stockValue}
          onChange={(e) => setStockAsOf(e.target.value)}
          disabled={!canEdit}
        />
        {saved.openingStockAsOf != null && (
          <span className="text-ink-3">
            Confirmed with {saved.openingStockCount ?? 0} counted line(s) on the
            shelves.
          </span>
        )}
      </label>
      <label className="block space-y-1 text-xs">
        <span className="font-medium">Old invoices and payments</span>
        <select
          className="w-full border rounded-sm p-2"
          value={modeValue}
          onChange={(e) => setMode(e.target.value as FinancialMode | "")}
          disabled={!canEdit}
        >
          <option value="">Choose one</option>
          <option value="reference_history">
            Keep them for reference (TPP stays the money history)
          </option>
          <option value="ledger_reconstruction">
            Rebuild them as Capsule invoices and payments
          </option>
        </select>
      </label>
      <label className="block space-y-1 text-xs">
        <span className="font-medium">Backup and restore</span>
        <textarea
          className="w-full border rounded-sm p-2 min-h-[60px]"
          placeholder="Where the backup is, and when someone last restored it to check it works"
          value={backupValue}
          onChange={(e) => setBackup(e.target.value)}
          disabled={!canEdit}
        />
      </label>
      <button
        type="button"
        className="btn btn-sm"
        disabled={!canEdit || saving}
        onClick={save}
      >
        Save switch facts
      </button>
    </div>
  );
}
