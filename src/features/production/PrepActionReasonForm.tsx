import { useId, useState, type FormEvent } from "react";

export type PrepReasonAction = "markBlocked" | "cancel";

interface PrepActionReasonFormProps {
  action: PrepReasonAction;
  busy: boolean;
  taskName: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}

export function PrepActionReasonForm({
  action,
  busy,
  taskName,
  onCancel,
  onSubmit,
}: PrepActionReasonFormProps) {
  const [reason, setReason] = useState("");
  const headingId = useId();
  const reasonId = useId();
  const helperId = useId();
  const isBlocking = action === "markBlocked";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (trimmedReason) onSubmit(trimmedReason);
  };

  return (
    <form
      className="mt-3 rounded-sm border border-line bg-inset p-4"
      aria-labelledby={headingId}
      onSubmit={submit}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Reason required</p>
          <h3 id={headingId} className="mt-1 text-base font-semibold text-ink">
            {isBlocking ? "Block prep line" : "Cancel prep line"}
          </h3>
          <p id={helperId} className="mt-1 text-[12px] text-ink-2">
            {isBlocking
              ? `Explain what is stopping ${taskName} so the next cook knows what to resolve.`
              : `Record why ${taskName} is being removed from the production sheet.`}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={onCancel}
        >
          Keep task
        </button>
      </div>
      <label className="field-label mt-3" htmlFor={reasonId}>
        {isBlocking ? "Block reason" : "Cancellation reason"}
      </label>
      <textarea
        id={reasonId}
        name="reason"
        className="input mt-1 min-h-20 py-2"
        value={reason}
        required
        autoFocus
        aria-describedby={helperId}
        placeholder={
          isBlocking
            ? "e.g. Waiting on delivery of fresh herbs"
            : "e.g. Menu revision removed this item"
        }
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Back
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !reason.trim()}
        >
          {busy
            ? isBlocking
              ? "Blocking…"
              : "Cancelling…"
            : isBlocking
              ? "Block task"
              : "Cancel task"}
        </button>
      </div>
    </form>
  );
}
