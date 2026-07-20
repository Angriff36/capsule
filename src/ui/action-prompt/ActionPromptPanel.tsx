import { useId, useState, type FormEvent } from "react";
import type { ActionPromptRequest } from "./ActionPromptTypes";

interface ActionPromptPanelProps {
  request: ActionPromptRequest;
  busy?: boolean;
  onDismiss: () => void;
  onConfirm: (payload: {
    reason?: string;
    values?: Record<string, string>;
  }) => void;
}

export function ActionPromptPanel({
  request,
  busy = false,
  onDismiss,
  onConfirm,
}: ActionPromptPanelProps) {
  const headingId = useId();
  const helperId = useId();
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(request),
  );

  const tone = request.tone ?? "default";
  const cancelLabel = request.cancelLabel ?? "Keep as-is";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (request.kind === "confirm") {
      onConfirm({});
      return;
    }
    if (request.kind === "reason") {
      const trimmed = reason.trim();
      if (!trimmed) return;
      onConfirm({ reason: trimmed });
      return;
    }
    const next: Record<string, string> = {};
    for (const field of request.fields) {
      const value = (values[field.name] ?? "").trim();
      if ((field.required ?? true) && !value) return;
      next[field.name] = value;
    }
    onConfirm({ values: next });
  };

  return (
    <form
      className={`mt-3 rounded-sm border p-4 ${
        tone === "danger"
          ? "border-danger/40 bg-danger-soft/40"
          : "border-line bg-inset"
      }`}
      aria-labelledby={headingId}
      onSubmit={submit}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            {request.kind === "confirm" ? "Confirm action" : "Details required"}
          </p>
          <h3 id={headingId} className="mt-1 text-base font-semibold text-ink">
            {request.title}
          </h3>
          <p id={helperId} className="mt-1 text-[12px] text-ink-2">
            {request.description}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={onDismiss}
        >
          {cancelLabel}
        </button>
      </div>

      {request.kind === "reason" ? (
        <>
          <label className="field-label mt-3" htmlFor={`${headingId}-reason`}>
            {request.label}
          </label>
          <textarea
            id={`${headingId}-reason`}
            name="reason"
            className="input mt-1 min-h-20 py-2"
            value={reason}
            required
            autoFocus
            aria-describedby={helperId}
            placeholder={request.placeholder}
            onChange={(event) => setReason(event.target.value)}
          />
        </>
      ) : null}

      {request.kind === "fields"
        ? request.fields.map((field, index) => {
            const fieldId = `${headingId}-${field.name}`;
            return (
              <div key={field.name} className="mt-3">
                <label className="field-label" htmlFor={fieldId}>
                  {field.label}
                </label>
                {field.helper ? (
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    {field.helper}
                  </p>
                ) : null}
                <input
                  id={fieldId}
                  name={field.name}
                  type={field.inputType ?? "text"}
                  className="input mt-1"
                  value={values[field.name] ?? ""}
                  required={field.required ?? true}
                  autoFocus={index === 0}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                />
              </div>
            );
          })
        : null}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={onDismiss}
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          className={tone === "danger" ? "btn btn-danger" : "btn btn-primary"}
          disabled={
            busy ||
            (request.kind === "reason" && !reason.trim()) ||
            (request.kind === "fields" &&
              request.fields.some(
                (field) =>
                  (field.required ?? true) &&
                  !(values[field.name] ?? "").trim(),
              ))
          }
        >
          {busy ? "Working…" : request.confirmLabel}
        </button>
      </div>
    </form>
  );
}

function initialValues(request: ActionPromptRequest): Record<string, string> {
  if (request.kind !== "fields") return {};
  return Object.fromEntries(
    request.fields.map((field) => [field.name, field.defaultValue ?? ""]),
  );
}
