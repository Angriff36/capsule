import { useState, type FormEvent } from "react";
import type { Doc } from "../../lib/api";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import { clientDisplayName } from "../events/clientName";
import { DateHoldCollisionNotice } from "./DateHoldCollisionNotice";
import { DEFAULT_HOLD_DAYS } from "./dateHolds";

export interface DateHoldFormValues {
  mode: "hold" | "waitlist";
  dateKey: string;
  clientId?: string;
  note?: string;
  holdDays: number;
}

/** One form for both a soft hold and a waitlist spot on a date. */
export function DateHoldForm({
  clients,
  busy,
  onSubmit,
}: {
  clients: Doc<"clients">[] | undefined;
  busy: boolean;
  onSubmit: (values: DateHoldFormValues) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<DateHoldFormValues["mode"]>("hold");
  const [dateKey, setDateKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [note, setNote] = useState("");
  const [holdDays, setHoldDays] = useState(String(DEFAULT_HOLD_DAYS));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await onSubmit({
      mode,
      dateKey,
      clientId: clientId || undefined,
      note: note.trim() || undefined,
      holdDays: Math.max(1, Number(holdDays) || DEFAULT_HOLD_DAYS),
    });
    if (saved) {
      setClientId("");
      setNote("");
    }
  };

  const liveClients = (clients ?? []).filter((c) => c.deletedAt == null);

  return (
    <form
      onSubmit={submit}
      className="bg-panel border border-line rounded-sm p-4 space-y-3"
      aria-label="Hold a date"
    >
      <div className="flex gap-2" role="radiogroup" aria-label="What to add">
        {(["hold", "waitlist"] as const).map((value) => (
          <label key={value} className="flex items-center gap-1 text-sm">
            <input
              type="radio"
              name="mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {value === "hold" ? "Soft hold" : "Waitlist"}
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="field-label">
          Date *
          <BoundedDateInput
            className="input"
            required
            value={dateKey}
            onChange={(event) => setDateKey(event.target.value)}
          />
        </label>
        <label className="field-label">
          Client
          <select
            className="input"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          >
            <option value="">— Prospect, no client yet —</option>
            {liveClients.map((client) => (
              <option key={client._id} value={client._id}>
                {clientDisplayName(client._id, liveClients)}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Prospect / note
          <input
            className="input"
            value={note}
            placeholder="e.g. Smith wedding, call back Friday"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {mode === "hold" && (
          <label className="field-label">
            Hold for (days)
            <input
              type="number"
              min={1}
              className="input"
              value={holdDays}
              onChange={(event) => setHoldDays(event.target.value)}
            />
          </label>
        )}
      </div>
      <DateHoldCollisionNotice dateKey={dateKey} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
        {mode === "hold" ? "Hold date" : "Add to waitlist"}
      </button>
    </form>
  );
}
