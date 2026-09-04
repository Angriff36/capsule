import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ActionPromptRequest } from "./ActionPromptTypes";
import { MAX_DATETIME_LOCAL_INPUT_VALUE } from "../BoundedDateInputs";
import {
  ACTION_PROMPT_CONFIRM_ARM_MS,
  shouldAcceptConfirmClick,
} from "./confirmClickArm";

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
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null),
  );
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(request),
  );

  const tone = request.tone ?? "default";
  const cancelLabel = request.cancelLabel ?? "Keep as-is";

  const [confirmArmed, setConfirmArmed] = useState(request.kind !== "confirm");

  useEffect(() => {
    if (request.kind !== "confirm") return;
    setConfirmArmed(false);
    const id = window.setTimeout(() => {
      setConfirmArmed(true);
    }, ACTION_PROMPT_CONFIRM_ARM_MS);
    return () => window.clearTimeout(id);
    // Keyed to the request object itself: replacing an open confirm with
    // another (same title or not) re-arms the delay, so a click aimed at the
    // first prompt can never land on the second one's destructive button.
  }, [request]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  useEffect(
    () => () => {
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected) returnTarget.focus();
    },
    [],
  );

  const rejectUnarmedConfirm = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    if (shouldAcceptConfirmClick({ kind: request.kind, armed: confirmArmed })) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Confirm-kind is click-only. Form submit / Enter / a Keep as-is button
    // that lost type="button" must not confirm a destructive remove.
    if (request.kind === "confirm") {
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

  const cancel = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  };

  return (
    <form
      data-action-prompt
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
          <p id={helperId} className="mt-1 text-sm text-ink-2">
            {request.description}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          data-testid="action-prompt-cancel"
          onClick={cancel}
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
                  <p className="mt-0.5 text-xs text-ink-3">{field.helper}</p>
                ) : null}
                {field.options ? (
                  <select
                    id={fieldId}
                    name={field.name}
                    className="input mt-1"
                    value={values[field.name] ?? ""}
                    required={field.required ?? true}
                    autoFocus={index === 0}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.name]: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {field.placeholder ?? "Select an option"}
                    </option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={fieldId}
                    name={field.name}
                    type={field.inputType ?? "text"}
                    // Unbounded datetime-local years grow to six digits while
                    // typing (issue #148); cap at 9999 so the year commits
                    // after four digits.
                    max={
                      field.inputType === "datetime-local"
                        ? MAX_DATETIME_LOCAL_INPUT_VALUE
                        : undefined
                    }
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
                )}
              </div>
            );
          })
        : null}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          data-testid="action-prompt-cancel"
          onClick={cancel}
        >
          {cancelLabel}
        </button>
        {request.kind === "confirm" ? (
          <button
            type="button"
            className={tone === "danger" ? "btn btn-danger" : "btn btn-primary"}
            disabled={busy || !confirmArmed}
            data-testid="action-prompt-confirm"
            data-confirm-armed={confirmArmed ? "true" : "false"}
            style={{ pointerEvents: confirmArmed ? "auto" : "none" }}
            onMouseDown={rejectUnarmedConfirm}
            onClick={() => {
              if (
                !shouldAcceptConfirmClick({
                  kind: request.kind,
                  armed: confirmArmed,
                })
              ) {
                return;
              }
              onConfirm({});
            }}
          >
            {busy ? "Working…" : request.confirmLabel}
          </button>
        ) : (
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
            data-testid="action-prompt-confirm"
          >
            {busy ? "Working…" : request.confirmLabel}
          </button>
        )}
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
