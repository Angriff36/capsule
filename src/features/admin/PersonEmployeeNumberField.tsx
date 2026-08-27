import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../lib/api";

/**
 * Saves a payroll employee number on an already-hired person.
 * Used on Admin → Permissions and Finance → Payroll.
 */
export function PersonEmployeeNumberField({
  personId,
  personName,
  currentNumber,
  version,
  canEdit,
  busy,
  onBusy,
  onSaved,
  onError,
}: {
  personId: string;
  personName: string;
  currentNumber?: string | null;
  version?: number;
  canEdit: boolean;
  busy: boolean;
  onBusy?: (busy: boolean) => void;
  onSaved?: (employeeNumber: string) => void;
  onError?: (message: string) => void;
}) {
  const setEmployeeNumber = useMutation(
    api.personEmployeeNumber.setEmployeeNumber,
  );
  const saved = (currentNumber ?? "").trim();
  const [draft, setDraft] = useState(saved);

  if (!canEdit) {
    return saved ? (
      <span className="text-ink-2">{saved}</span>
    ) : (
      <span className="text-warn">No employee number</span>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const next = draft.trim();
        if (!next || next === saved) return;
        onBusy?.(true);
        void setEmployeeNumber({
          docId: personId as never,
          employeeNumber: next,
          version,
        })
          .then(() => {
            onSaved?.(next);
          })
          .catch((error: unknown) => {
            onError?.(
              error instanceof Error
                ? error.message
                : "Could not save employee number.",
            );
          })
          .finally(() => {
            onBusy?.(false);
          });
      }}
    >
      <input
        name="employeeNumber"
        className="input w-28"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="EMP-104"
        aria-label={`Employee number for ${personName}`}
        disabled={busy}
        autoComplete="off"
      />
      <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>
        {busy ? "…" : "Set"}
      </button>
    </form>
  );
}
